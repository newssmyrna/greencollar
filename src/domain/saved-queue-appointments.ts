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
export const APPOINTMENT_CHECK_ASSUMPTIONS='Checks use the current queue order, service estimates and one shared local clock, with a best-case start at 00:00. Optional manual travel estimates may cover the operator-chosen starting point to the first stop and each leg between adjacent saved stops. The chosen starting point is not stored; unentered travel and the actual workday start are excluded. Any planned breaks are reserved. These are not route or arrival times.';

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
    c