import {readServiceTimeConstraints,formatServiceClock,type ServiceTimeConstraints} from './service-time';
import {assessWorkdayWindow,type WorkdayWindowAssessment} from './workday-window';
import {assessWorkdayBreak,type WorkdayTimingInput,type WorkdayBreakAssessment,type WorkdayBreakInterval} from './workday-break';

export type AppointmentVisit=ServiceTimeConstraints&{id:string;estimatedMinutes:number;travelMinutesBefore?:number};
export type AppointmentIssue={
  visitId:string;
  kind:'invalid_data'|'fixed_break_conflict'|'fixed_start_conflict'|'finish_window_conflict'|'day_boundary_conflict'|'workday_finish_conflict';
  message:string;
};
export type SavedQueueAppointments={
  status:'no_constraints'|'no_conflicts_detected'|'conflicts'|'invalid_visits'|'invalid_window'|'invalid_break';
  visitCount:number;
  constrainedVisitCount:number;
  travelEstimateCount:number;
  estimatedTravelMinutes:number;
  issues:AppointmentIssue[];
  workdayWindow:WorkdayWindowAssessment;
  plannedBreak:WorkdayBreakAssessment;
};
export const APPOINTMENT_CHECK_ASSUMPTIONS='Checks use the current queue order, service estimates and one shared local clock, with a best-case start at 00:00. Optional manual travel estimates apply only between adjacent saved stops; travel to the first stop, unentered travel, and the actual workday start are excluded. Any planned breaks are reserved. These are not route or arrival times.';

function overlapsBreak(start:number,duration:number,interval:WorkdayBreakInterval):boolean{
  return start<interval.finishMinute&&start+duration>interval.startMinute;
}
function uninterruptedStart(candidate:number,duration:number,intervals:readonly WorkdayBreakInterval[]):number{
  let start=candidate;
  // Intervals are sorted and disjoint; a long service may need to move past more than one.
  for(const interval of intervals)
    if(overlapsBreak(start,duration,interval))start=interval.finishMinute;
  return start;
}

/** A lower-bound timing check for one operator, never a route or an arrival forecast.
 * Moving each service as early as possible proves only conflicts in this order under
 * the stated assumptions. Later real starts/travel can introduce additional conflicts.
 */
export function assessSavedQueueAppointments(visits:readonly AppointmentVisit[],windowInput:WorkdayTimingInput={}):SavedQueueAppointments{
  const window=assessWorkdayWindow(windowInput),plannedBreak=assessWorkdayBreak(windowInput);
  const result:SavedQueueAppointments={status:'no_constraints',visitCount:visits.length,constrainedVisitCount:0,travelEstimateCount:0,estimatedTravelMinutes:0,issues:[],workdayWindow:window,plannedBreak};
  if(window.status==='invalid')return {...result,status:'invalid_window'};
  if(plannedBreak.status==='invalid')return {...result,status:'invalid_break'};
  const intervals=plannedBreak.intervals;
  const seen=new Set<string>();
  const constraints:ServiceTimeConstraints[]=[];
  for(const [index,visit] of visits.entries()){
    try{
      if(typeof visit.id!=='string'||!visit.id.trim()||seen.has(visit.id))
        throw new Error('Visit identity is missing or repeated. Reload the saved workday.');
      seen.add(visit.id);
      if(!Number.isSafeInteger(visit.estimatedMinutes)||visit.estimatedMinutes<1||visit.estimatedMinutes>1440)
        throw new Error('Service duration is invalid. Reload and review the saved service.');
      if(visit.travelMinutesBefore!==undefined){
        if(index===0)throw new Error('Travel before the first stop has no saved origin. Enter estimates only between adjacent saved stops.');
        if(!Number.isSafeInteger(visit.travelMinutesBefore)||visit.travelMinutesBefore<0||visit.travelMinutesBefore>1440)
          throw new Error('Travel estimate must be a whole number from 0 to 1440 minutes.');
        result.travelEstimateCount++;
        result.estimatedTravelMinutes+=visit.travelMinutesBefore;
      }
      const times=readServiceTimeConstraints(visit);
      constraints.push(times);
      if(Object.keys(times).length)result.constrainedVisitCount++;
    }catch(error){
      result.issues.push({visitId:visit.id,kind:'invalid_data',message:error instanceof Error?error.message:'Invalid saved appointment data.'});
    }
  }
  if(result.issues.length)return {...result,status:'invalid_visits'};
  const excludedTime=result.travelEstimateCount
    ?'unentered travel or any other breaks'
    :intervals.length?'travel or any other breaks':'travel or breaks';
  let earliestFreeMinute=window.startMinute;
  visits.forEach((visit,index)=>{
    const times=constraints[index];
    const travelStart=visit.travelMinutesBefore===undefined
      ?earliestFreeMinute
      :uninterruptedStart(earliestFreeMinute,visit.travelMinutesBefore,intervals)+visit.travelMinutesBefore;
    const availableStart=Math.max(travelStart,times.preferredStartMinute??0);
    const candidateStart=Math.max(availableStart,times.fixedStartMinute??0);
    const start=uninterruptedStart(candidateStart,visit.estimatedMinutes,intervals);
    const finish=start+visit.estimatedMinutes;
    const latestFinish=Math.min(times.preferredFinishMinute??1440,window.finishMinute);
    const workdayEndsFirst=window.status==='set'&&(times.preferredFinishMinute===undefined||window.finishMinute<times.preferredFinishMinute);
    if(times.fixedStartMinute!==undefined){
      const overlapping=intervals.filter(interval=>overlapsBreak(times.fixedStartMinute!,visit.estimatedMinutes,interval));
      if(overlapping.length){
        const range=overlapping.map(interval=>formatServiceClock(interval.startMinute)+'–'+formatServiceClock(interval.finishMinute)).join(', ');
        result.issues.push({visitId:visit.id,kind:'fixed_break_conflict',
          message:'Fixed start '+formatServiceClock(times.fixedStartMinute)+' with a '+visit.estimatedMinutes+'-minute service overlaps your planned break'+(overlapping.length>1?'s':'')+' '+range+'. Services are checked without interruption.'});
      }else if(start>times.fixedStartMinute){
        const travelCopy=visit.travelMinutesBefore
          ?' after the '+visit.travelMinutesBefore+'-minute travel estimate from the previous stop':'';
        result.issues.push({visitId:visit.id,kind:'fixed_start_conflict',
          message:visit.travelMinutesBefore
            ?'Fixed start '+formatServiceClock(times.fixedStartMinute)+' cannot fit this work window and order'+travelCopy+' with the saved timing settings ('+(start-times.fixedStartMinute)+' min short), even without '+excludedTime+'.'
            :'Fixed start '+formatServiceClock(times.fixedStartMinute)+' cannot fit this work window, order and saved timing settings ('+(start-times.fixedStartMinute)+' min short), even without '+excludedTime+'.'});
      }
    }
    if(finish>latestFinish){
      result.issues.push({visitId:visit.id,kind:workdayEndsFirst?'workday_finish_conflict':times.preferredFinishMinute===undefined?'day_boundary_conflict':'finish_window_conflict',
        message:workdayEndsFirst
          ?'The '+visit.estimatedMinutes+'-minute service cannot finish by your '+formatServiceClock(window.finishMinute)+' workday finish in this order ('+(finish-window.finishMinute)+' min over), even without '+excludedTime+'.'
          :times.preferredFinishMinute===undefined
          ?'This order exceeds the local service day by at least '+(finish-1440)+' min before '+excludedTime+'.'
          :'The '+visit.estimatedMinutes+'-minute service cannot finish by '+formatServiceClock(latestFinish)+' in this order ('+(finish-latestFinish)+' min over), even without '+excludedTime+'.'});
    }
    earliestFreeMinute=finish;
  });
  result.status=result.issues.length?'conflicts':result.constrainedVisitCount||result.travelEstimateCount||window.status==='set'||intervals.length?'no_conflicts_detected':'no_constraints';
  return result;
}
export function describeSavedQueueAppointments(result:SavedQueueAppointments):string{
  if(result.status==='invalid_window')return result.workdayWindow.error;
  if(result.status==='invalid_break')return result.plannedBreak.error;
  if(result.status==='invalid_visits')return 'Appointment checks stopped because saved timing or duration data is invalid. Reload and review the affected services before approving.';
  if(!result.visitCount)return 'No remaining visits to check.';
  if(result.status==='no_constraints')return 'No appointment times are saved for this remaining queue.';
  if(result.status==='conflicts'){
    const count=result.issues.length;
    return count+' potential timing '+(count===1?'conflict':'conflicts')+' in this queue. Review the warnings with each visit before approving.';
  }
  return 'No timing conflicts found under these assumptions. This does not establish an achievable schedule.';
}

export function describeAppointmentCheckAssumptions(result:SavedQueueAppointments):string{
  const window=result.workdayWindow,plannedBreak=result.plannedBreak;
  if(window.status==='invalid')return 'Correct the workday window before checking appointment timing or approving.';
  if(plannedBreak.status==='invalid')return 'Correct the planned break list before checking appointment timing or approving.';
  if(window.status==='not_set'&&plannedBreak.status==='not_set')return result.travelEstimateCount
    ?APPOINTMENT_CHECK_ASSUMPTIONS+' '+travelSummary(result)
    :APPOINTMENT_CHECK_ASSUMPTIONS;
  const workWindow=window.status==='set'
    ?'within your planned '+formatServiceClock(window.startMinute)+'–'+formatServiceClock(window.finishMinute)+' work window.'
    :'with a best-case start at 00:00. The actual workday start is not set.';
  const breakCopy=plannedBreak.status==='set'
    ?'The planned breaks '+plannedBreak.intervals.map(interval=>
      formatServiceClock(interval.startMinute)+'–'+formatServiceClock(interval.finishMinute)
    ).join(', ')+' are reserved; services are not split around them. '+(result.travelEstimateCount?'Unentered travel and any other breaks are excluded.':'Travel and any other breaks are excluded.')
    :result.travelEstimateCount?'Unentered travel and breaks are excluded.':'Travel and breaks are excluded.';
  const estimateCopy=travelSummary(result);
  return 'Checks use the current queue order, service estimates and one shared local clock '+workWindow+' '+breakCopy+(estimateCopy?' '+estimateCopy:'')+' The device clock is not used; update the remaining-work start yourself. These are not route or arrival times.';
}

function travelSummary(result:SavedQueueAppointments):string{
  if(!result.travelEstimateCount)return '';
  return 'Your manual estimates cover '+result.travelEstimateCount+' adjacent '+(result.travelEstimateCount===1?'stop pair':'stop pairs')+' ('+result.estimatedTravelMinutes+' minutes total); travel to the first stop is not estimated.';
}
