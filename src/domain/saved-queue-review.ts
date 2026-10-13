import {assessSavedQueueWorkload,type SavedQueueWorkloadLimits,type SavedQueueWorkloadAssessment} from './saved-queue-workload';

export type QueueReviewVisit={
  id:string;
  customer:string;
  service:string;
  rateCents:number;
  estimatedMinutes:number;
};
export type SavedQueueReview={
  businessId:string;
  date:string;
  visitIds:string[];
  visitCount:number;
  estimatedServiceMinutes:number;
  expectedRevenueCents:number;
  approvalKey:string;
  workload?:SavedQueueWorkloadAssessment|null;
};
/** A review of the saved work queue in its current order; this does not claim route optimization. */
export function createSavedQueueReview(businessId:string,date:string,visits:QueueReviewVisit[],limits?:SavedQueueWorkloadLimits):SavedQueueReview{
  if(!businessId.trim())throw new Error('Business context is required');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('A local service date is required');
  const parsedDate=new Date(date+'T00:00:00.000Z');
  if(Number.isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date)throw new Error('A local service date is required');
  const ids=new Set<string>();
  for(const visit of visits){
    if(!visit.id||ids.has(visit.id))throw new Error('Visit IDs must be present and unique');
    ids.add(visit.id);
    if(!Number.isFinite(visit.rateCents)||visit.rateCents<0)throw new Error('Visit prices must be valid');
    if(!Number.isFinite(visit.estimatedMinutes)||visit.estimatedMinutes<0)throw new Error('Visit durations must be valid');
  }
  const workload=limits?assessSavedQueueWorkload(visits,limits):null;
  const snapshot=[businessId,date,visits.map(v=>[v.id,v.rateCents,v.estimatedMinutes])];
  const approvalKey=JSON.stringify(limits
    ?['saved-queue-workload-v1',...snapshot,workload?.status,workload?.availableMinutes,workload?.maxJobs]
    :snapshot);
  return {
    businessId,date,visitIds:visits.map(v=>v.id),visitCount:visits.length,
    estimatedServiceMinutes:visits.reduce((total,v)=>total+v.estimatedMinutes,0),
    expectedRevenueCents:visits.reduce((total,v)=>total+v.rateCents,0),
    approvalKey,workload
  };
}
export function canApproveSavedQueueReview(review:SavedQueueReview|null):boolean{
  return !!review&&review.visitCount>0&&(!review.workload
    ||review.workload.status==='within_limits'||review.workload.status==='over_limits');
}
export function isSavedQueueApproved(review:SavedQueueReview|null,approvedKey:string|null):boolean{
  return canApproveSavedQueueReview(review)&&approvedKey===review?.approvalKey;
}
