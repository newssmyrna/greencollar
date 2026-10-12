export type SavedQueueOrder={scopeKey:string;visitIds:string[]};

function validateVisitIds<T extends {id:string}>(visits:readonly T[]):void{
  const ids=new Set<string>();
  for(const visit of visits){
    if(!visit.id||ids.has(visit.id))throw new Error('Visit IDs must be present and unique');
    ids.add(visit.id);
  }
}

/** Reconcile a operator order with the latest authorized due visits.
 * Removed visits disappear; new visits append in source order. No visit is invented or dropped.
 * A different operator/business/date scope always uses the supplied default order.
 */
export function orderSavedQueue<T extends {id:string}>(visits:readonly T[],scopeKey:string,order:SavedQueueOrder|null):T[]{
  validateVisitIds(visits);
  if(!order||order.scopeKey!==scopeKey)return [...visits];
  const byId=new Map(visits.map(visit=>[visit.id,visit]));
  const result:T[]=[];
  for(const id of order.visitIds){
    const visit=byId.get(id);
    if(visit){result.push(visit);byId.delete(id);}
  }
  for(const visit of visits)if(byId.has(visit.id))result.push(visit);
  return result;
}

/** Move one visit without mutating data or changing any appointment, price, or duration. */
export function moveSavedQueueVisit<T extends {id:string}>(visits:readonly T[],visitId:string,direction:'earlier'|'later'):T[]{
  validateVisitIds(visits);
  const index=visits.findIndex(visit=>visit.id===visitId);
  if(index===-1)throw new Error('Visit is no longer in this work queue');
  const nextIndex=index+(direction==='earlier'?-1:1);
  const result=[...visits];
  if(nextIndex<0||nextIndex>=visits.length)return result;
  [result[index],result[nextIndex]]=[result[nextIndex],result[index]];
  return result;
}
