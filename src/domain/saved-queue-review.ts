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
};
/** A review of the saved work queue in its current order; this does not claim route optimization. */
export function createSavedQueueReview(businessId:string,date:string,visits:QueueReviewVisit[]):SavedQueueReview{
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
  return {
    businessId,date,visitIds:visits.map(v=>v.id),visitCount:visits.length,
    estimatedServiceMinutes:visits.reduce((total,v)=>total+v.estimatedMinutes,0),
    expectedRevenueCents:visits.reduce((total,v)=>total+v.rateCents,0),
    approvalKey:JSON.stringify([businessId,date,visits.map(v=>[v.id,v.rateCents,v.estimatedMinutes])])
  };
}
export function isSavedQueueApproved(review:SavedQueueReview|null,approvedKey:string|null):boolean{
  return !!review&&review.visitCount>0&&approvedKey===review.approvalKey;
}
