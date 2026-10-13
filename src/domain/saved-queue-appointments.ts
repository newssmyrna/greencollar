import {readServiceTimeConstraints,formatServiceClock,type ServiceTimeConstraints} from './service-time';

export type AppointmentVisit=ServiceTimeConstraints&{id:string;estimatedMinutes:number};
export type AppointmentIssue={
  visitId:string;
  kind:'invalid_data'|'fixed_start_conflict'|'finish_window_conflict'|'day_boundary_conflict';
  message:string;
};
export type SavedQueueAppointments={
  status:'no_constraints'|'no_conflicts_detected'|'conflicts'|'invalid_visits';
  visitCount:number;
  constrainedVisitCount:number;
  issues:AppointmentIssue[];
};
export const APPOINTMENT_CHECK_ASSUMPTIONS='Checks use the current queue order, service estimates and one shared local clock, with a best-case start at 00:00. Travel, breaks and the actual workday start are excluded. These are not arrival times.';

/** A lower-bound timing check for one operator, never a route or an arrival forecast.
 * Moving each service as early as possible proves only conflicts in this order under
 * the stated assumptions. Later real starts/travel can introduce additional conflicts.
 */
export function assessSavedQueueAppointments(visits:readonly AppointmentVisit[]):SavedQueueAppointments{
  const result:SavedQueueAppointments={status:'no_constraints',visitCount:visits.length,constrainedVisitCount:0,issues:[]};
  const seen=new Set<string>();
  const constraints:ServiceTimeConstraints[]=[];
  for(const visit of visits){
    try{
      if(typeof visit.id!=='string'||!visit.id.trim()||seen.has(visit.id))
        throw new Error('Visit identity is missing or repeated. Reload the saved workday.');
      seen.add(visit.id);
      if(!Number.isSafeInteger(visit.estimatedMinutes)||visit.estimatedMinutes<1||visit.estimatedMinutes>1440)
        throw new Error('Service duration is invalid. Reload and review the saved service.');
      const times=readServiceTimeConstraints(visit);
      constraints.push(times);
      if(Object.keys(times).length)result.constrainedVisitCount++;
    }catch(error){
      result.issues.push({visitId:visit.id,kind:'invalid_data',message:error instanceof Error?error.message:'Invalid saved appointment data.'});
    }
  }
  if(result.issues.length)return {...result,status:'invalid_visits'};
  let earliestFreeMinute=0;
  visits.forEach((visit,index)=>{
    const times=constraints[index];
    const availableStart=Math.max(earliestFreeMinute,times.preferredStartMinute??0);
    const start=Math.max(availableStart,times.fixedStartMinute??0);
    const finish=start+visit.estimatedMinutes;
    const latestFinish=times.preferredFinishMinute??1440;
    if(times.fixedStartMinute!==undefined&&availableStart>times.fixedStartMinute){
      result.issues.push({visitId:visit.id,kind:'fixed_start_conflict',
        message:'Fixed start '+formatServiceClock(times.fixedStartMinute)+' cannot fit this order and saved windows ('+(availableStart-times.fixedStartMinute)+' min short), even without travel or breaks.'});
    }
    if(finish>latestFinish){
      result.issues.push({visitId:visit.id,kind:times.preferredFinishMinute===undefined?'day_boundary_conflict':'finish_window_conflict',
        message:times.preferredFinishMinute===undefined
          ?'This order exceeds the local service day by at least '+(finish-1440)+' min before travel or breaks.'
          :'The '+visit.estimatedMinutes+'-minute service cannot finish by '+formatServiceClock(latestFinish)+' in this order ('+(finish-latestFinish)+' min over), even without travel or breaks.'});
    }
    // Preserve a lower bound after a missed fixed start; never move the clock backward.
    earliestFreeMinute=finish;
  });
  result.status=result.issues.length?'conflicts':result.constrainedVisitCount?'no_conflicts_detected':'no_constraints';
  return result;
}
export function describeSavedQueueAppointments(result:SavedQueueAppointments):string{
  if(result.status==='invalid_visits')return 'Appointment checks stopped because saved timing or duration data is invalid. Reload and review the affected services before approving.';
  if(!result.visitCount)return 'No remaining visits to check.';
  if(result.status==='no_constraints')return 'No appointment times are saved for this remaining queue.';
  if(result.status==='conflicts'){
    const count=result.issues.length;
    return count+' potential timing '+(count===1?'conflict':'conflicts')+' in this queue. Review the warnings with each visit before approving.';
  }
  return 'No service-only timing conflicts found in this order. This does not establish an achievable schedule.';
}
