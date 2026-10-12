import {generateDueVisits, type Agreement} from './recurrence';
import {planDay, predictDuration} from './planner';
import type {PlannerInput,PlanResult,ServiceJob} from './types';

export type DailyWorkflowInput=Omit<PlannerInput,'jobs'> & {
  date:string;
  agreements:Agreement[];
  extraJobs?:ServiceJob[];
  completedVisitIds?:string[];
  skippedVisitIds?:string[];
  /** Actual completed service minutes grouped by agreement ID. */
  durationHistoryByAgreement?:Record<string,number[]>;
};
export type DailyWorkflowResult=PlanResult & {
  date:string;
  dueCount:number;
  scheduledCount:number;
  alreadyHandledCount:number;
  unscheduledVisitIds:string[];
  predictions:Array<{agreementId:string;minutes:number;samples:number;confidence:'low'|'medium'|'high'}>;
};

/**
 * Combine recurring due visits and one-off jobs into a daily plan.
 * The supplied date is the operator's *local service day*, not a UTC instant.
 *
 * This is a deterministic planning baseline using a synthetic/provided travel matrix,
 * NOT a global route optimizer or a live road-map integration.
 */
export function buildDailyWorkflow(input:DailyWorkflowInput):DailyWorkflowResult{
  const due=generateDueVisits(input.agreements,input.date,input.date);
  const handled=new Set([...(input.completedVisitIds??[]),...(input.skippedVisitIds??[])]);
  const pending=due.filter(v=>!handled.has(v.id));
  const predictions=pending.map(v=>({agreementId:v.agreementId,...predictDuration(input.durationHistoryByAgreement?.[v.agreementId]??[],v.estimatedMinutes)}));
  const predicted=new Map(predictions.map(p=>[p.agreementId,p.minutes]));
  const recurringJobs:ServiceJob[]=pending.map(v=>({
    id:v.id,customerId:v.customerId,locationId:v.locationId,
    serviceName:v.serviceName,rateCents:v.rateCents,
    estimatedMinutes:predicted.get(v.agreementId)??v.estimatedMinutes,
    earliestStartMinute:v.earliestStartMinute,latestFinishMinute:v.latestFinishMinute,
    fixedStartMinute:v.fixedStartMinute,due:true
  }));
  const extra=input.extraJobs??[];
  const ids=new Set(recurringJobs.map(j=>j.id));
  for(const job of extra){
    if(ids.has(job.id))throw new Error('Duplicate job id: '+job.id);
    ids.add(job.id);
  }
  const result=planDay({...input,jobs:[...recurringJobs,...extra]});
  const scheduled=new Set(result.stops.map(stop=>stop.jobId));
  return {
    ...result,date:input.date,dueCount:due.length,
    scheduledCount:result.stops.length,predictions,
    alreadyHandledCount:due.length-pending.length,
    unscheduledVisitIds:pending.filter(v=>!scheduled.has(v.id)).map(v=>v.id)
  };
}
