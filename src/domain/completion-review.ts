import {completionRecord,type WorkSession} from './work-session';

/** Binds an operator acknowledgment to the exact completed timer and loaded workday. */
export function completionReviewKey(
 operatorId:string|null|undefined,
 session:WorkSession|null,
 workday:string|null
):string|null{
 if(!operatorId||!session||session.status!=='completed'||session.jobId==='demo-job'||!workday)return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(workday))return null;
 const date=new Date(workday+'T00:00:00.000Z');
 if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==workday)return null;
 try{
  const record=completionRecord(session);
  return JSON.stringify([operatorId,record.jobId,record.completedAt,record.actualMinutes,workday]);
 }catch{return null;}
}
export function isCompletionReviewConfirmed(reviewKey:string|null,confirmedKey:string):boolean{
 return reviewKey!==null&&reviewKey===confirmedKey;
}
