export type ServiceWorkloadItem={id:string;minutes:number};
export type ServiceWorkloadAssessment={
  status:'invalid_hours'|'invalid_job_cap'|'invalid_jobs'|'within_service_hours'|'over_service_hours';
  availableMinutes:number|null;
  selectedJobCount:number;
  selectedMinutes:number;
  jobsOutsideCap:number;
  overtimeMinutes:number;
};

/** Assess ordered jobs against hours and job-count inputs. This covers service time only;
 * it does not estimate travel, breaks, appointments, or route feasibility.
 */
export function assessServiceWorkload(
  jobs:readonly ServiceWorkloadItem[],
  hoursInput:string,
  maxJobsInput:string
):ServiceWorkloadAssessment{
  const invalid=(status:ServiceWorkloadAssessment['status']):ServiceWorkloadAssessment=>({
    status,availableMinutes:null,selectedJobCount:0,selectedMinutes:0,jobsOutsideCap:0,overtimeMinutes:0
  });
  const hoursText=hoursInput.trim(),capText=maxJobsInput.trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(hoursText))return invalid('invalid_hours');
  const hours=Number(hoursText);
  if(!Number.isFinite(hours)||hours<0.25||hours>24)return invalid('invalid_hours');
  if(!/^\d+$/.test(capText))return invalid('invalid_job_cap');
  const cap=Number(capText);
  if(!Number.isSafeInteger(cap)||cap<1||cap>200)return invalid('invalid_job_cap');
  const ids=new Set<string>();
  for(const job of jobs){
    if(!job.id||ids.has(job.id)||!Number.isSafeInteger(job.minutes)||job.minutes<1||job.minutes>1440)
      return invalid('invalid_jobs');
    ids.add(job.id);
  }
  const selected=jobs.slice(0,cap);
  const selectedMinutes=selected.reduce((sum,job)=>sum+job.minutes,0);
  const availableMinutes=Math.round(hours*60);
  const overtimeMinutes=Math.max(0,selectedMinutes-availableMinutes);
  return {
    status:overtimeMinutes?'over_service_hours':'within_service_hours',
    availableMinutes,selectedJobCount:selected.length,selectedMinutes,
    jobsOutsideCap:Math.max(0,jobs.length-selected.length),overtimeMinutes
  };
}
