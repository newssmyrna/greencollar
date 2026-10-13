import type {WorkdayWindowInput} from './workday-window';
export type SavedQueueWorkloadLimits=WorkdayWindowInput&{hours:string;maxJobs:string};
export type SavedQueueWorkloadAssessment={
  status:'needs_limits'|'invalid_hours'|'invalid_job_cap'|'invalid_visits'|'within_limits'|'over_limits';
  availableMinutes:number|null;
  maxJobs:number|null;
  visitCount:number;
  estimatedServiceMinutes:number;
  serviceOverageMinutes:number;
  jobsOverCap:number;
};

/** Measures the entire remaining saved queue. Limits never select, remove or reorder visits.
 * Hours are the operator's service-time budget; road travel and appointments are not assessed.
 */
export function assessSavedQueueWorkload(
  visits:readonly {id:string;estimatedMinutes:number}[],
  limits:SavedQueueWorkloadLimits
):SavedQueueWorkloadAssessment{
  const result:SavedQueueWorkloadAssessment={
    status:'needs_limits',availableMinutes:null,maxJobs:null,visitCount:visits.length,
    estimatedServiceMinutes:0,serviceOverageMinutes:0,jobsOverCap:0
  };
  const ids=new Set<string>();
  for(const visit of visits){
    if(!visit.id.trim()||ids.has(visit.id)||!Number.isSafeInteger(visit.estimatedMinutes)
      ||visit.estimatedMinutes<1||visit.estimatedMinutes>1440)
      return {...result,status:'invalid_visits'};
    ids.add(visit.id);
    result.estimatedServiceMinutes+=visit.estimatedMinutes;
  }
  if(!Number.isSafeInteger(result.estimatedServiceMinutes))return {...result,status:'invalid_visits'};
  const hours=limits.hours.trim(),cap=limits.maxJobs.trim();
  if(!hours&&!cap)return result;
  if(hours){
    if(!/^\d+(?:\.\d{1,2})?$/.test(hours)||Number(hours)<0.25||Number(hours)>24)
      return {...result,status:'invalid_hours'};
    // Only whole service minutes fit inside the entered budget.
    const [whole,fraction='']=hours.split('.');
    const hundredths=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    result.availableMinutes=Math.floor(hundredths*60/100);
  }
  if(cap){
    if(!/^\d+$/.test(cap)||!Number.isSafeInteger(Number(cap))||Number(cap)<1||Number(cap)>200)
      return {...result,status:'invalid_job_cap'};
    result.maxJobs=Number(cap);
  }
  result.serviceOverageMinutes=result.availableMinutes===null?0:Math.max(0,result.estimatedServiceMinutes-result.availableMinutes);
  result.jobsOverCap=result.maxJobs===null?0:Math.max(0,result.visitCount-result.maxJobs);
  result.status=result.serviceOverageMinutes||result.jobsOverCap?'over_limits':'within_limits';
  return result;
}

export function describeSavedQueueWorkload(result:SavedQueueWorkloadAssessment):string{
  switch(result.status){
    case 'needs_limits':return 'Enter service hours, a visit limit, or both before approving.';
    case 'invalid_hours':return 'Enter service hours from 0.25 to 24, with up to two decimal places.';
    case 'invalid_job_cap':return 'Enter a whole visit limit from 1 to 200.';
    case 'invalid_visits':return 'Some saved visits have invalid duration or identity data. Reload and correct them before approving.';
  }
  const limits=[
    result.availableMinutes===null?'Service-hour limit not set.':result.availableMinutes+' service minutes available.',
    result.maxJobs===null?'Visit limit not set.':'Visit limit: '+result.maxJobs+'.'
  ];
  const warnings=[];
  if(result.serviceOverageMinutes)warnings.push(result.serviceOverageMinutes+' service minutes over your budget.');
  if(result.jobsOverCap)warnings.push(result.jobsOverCap+(result.jobsOverCap===1?' visit':' visits')+' above your limit.');
  return [...limits,...(warnings.length?warnings:['Within the entered service-workload limits.'])].join(' ');
}
