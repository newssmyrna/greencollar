import type {Digest,KeyValueSecureStore} from './local-saved-queue-approval';
import type {SavedQueueTravelEstimate} from '../domain/saved-queue-order';
export type QueueOrderContext={subject:string;businessId:string;date:string};
export type SavedQueueOrderState={visitIds:string[];travelEstimates:SavedQueueTravelEstimate[]};
type StoredTravelEstimate={toIndex:number;minutes:number};
type OrderRecord={version:1|2|3;businessDigest:string;date:string;visitDigests:string[];travelByStop?:StoredTravelEstimate[]};
const MAX_RECORD_LENGTH=2000;
function validateContext(context:QueueOrderContext):void{
 if(!context.subject||!context.businessId.trim())throw new Error('Signed-in operator and business are required');
 const date=new Date(context.date+'T00:00:00.000Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(context.date)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==context.date)throw new Error('A valid work date is required');
}
function validateIds(ids:readonly string[]):void{
 if(ids.some(id=>!id)||new Set(ids).size!==ids.length)throw new Error('Visit IDs must be present and unique');
}
function parseRecord(value:string|null):OrderRecord|null{
 if(!value||value.length>MAX_RECORD_LENGTH)return null;
 try{
  const record:unknown=JSON.parse(value);
  if(!record||typeof record!=='object')return null;
  const r=record as Partial<OrderRecord>;
  if((r.version!==1&&r.version!==2&&r.version!==3)||typeof r.businessDigest!=='string'||typeof r.date!=='string'
   ||!Array.isArray(r.visitDigests)||r.visitDigests.some(id=>typeof id!=='string'||!id)
   ||new Set(r.visitDigests).size!==r.visitDigests.length)return null;
  if(r.version===1)return r as OrderRecord;
  if(!Array.isArray(r.travelByStop))return null;
  const stops=new Set<number>();
  for(const item of r.travelByStop){
   if(!item||!Number.isSafeInteger(item.toIndex)||item.toIndex<(r.version===3?0:1)||item.toIndex>=r.visitDigests.length
    ||stops.has(item.toIndex)||!Number.isSafeInteger(item.minutes)||item.minutes<0||item.minutes>1440)return null;
   stops.add(item.toIndex);
  }
  return r as OrderRecord;
 }catch{return null;}
}
/** Latest chosen queue and its manual travel estimates on this device per operator.
 * Stored visit identities are hashes; restore maps them against current authorized IDs.
 */
export function createLocalSavedQueueOrderStore(storage:KeyValueSecureStore,digest:Digest){
 const keyFor=async(subject:string)=>'greencollar_queue_order_'+await digest('operator:'+subject);
 async function loadState(context:QueueOrderContext,currentVisitIds:readonly string[]):Promise<SavedQueueOrderState|null>{
  validateContext(context);validateIds(currentVisitIds);
  const record=parseRecord(await storage.getItemAsync(await keyFor(context.subject)));
  if(!record||record.date!==context.date||record.businessDigest!==await digest('business:'+context.businessId))return null;
  const hashes=await Promise.all(currentVisitIds.map(id=>digest('visit:'+id)));
  const byDigest=new Map(hashes.map((hash,index)=>[hash,currentVisitIds[index]]));
  const result:string[]=[];
  const originalIds:(string|undefined)[]=[];
  for(const hash of record.visitDigests){
   const id=byDigest.get(hash);
   originalIds.push(id);
   if(id!==undefined){result.push(id);byDigest.delete(hash);}
  }
  for(let i=0;i<hashes.length;i++)if(byDigest.has(hashes[i]))result.push(currentVisitIds[i]);
  const travelEstimates:SavedQueueTravelEstimate[]=[];
  for(const item of record.travelByStop??[]){
   const toVisitId=originalIds[item.toIndex];
   if(!toVisitId)continue;
   if(item.toIndex===0){
    if(result[0]===toVisitId)travelEstimates.push({fromVisitId:null,toVisitId,minutes:item.minutes});
    continue;
   }
   const fromVisitId=originalIds[item.toIndex-1];
   if(fromVisitId&&result.indexOf(toVisitId)===result.indexOf(fromVisitId)+1)
    travelEstimates.push({fromVisitId,toVisitId,minutes:item.minutes});
  }
  return {visitIds:result,travelEstimates};
 }
 return {
  async save(context:QueueOrderContext,visitIds:readonly string[],travelEstimates:readonly SavedQueueTravelEstimate[]=[]):Promise<void>{
   validateContext(context);validateIds(visitIds);
   const position=new Map(visitIds.map((id,index)=>[id,index]));
   const byIndex=new Map<number,number>();
   for(const estimate of travelEstimates){
    const to=position.get(estimate.toVisitId);
    if(estimate.fromVisitId===null){
     if(to!==0)throw new Error('A starting-point travel estimate must target the first stop in the saved work order.');
    }else{
     const from=position.get(estimate.fromVisitId);
     if(from===undefined||to!==from+1)throw new Error('Travel estimates must match adjacent stops in the saved work order.');
    }
    if(!Number.isSafeInteger(estimate.minutes)||estimate.minutes<0||estimate.minutes>1440)throw new Error('Travel estimates must be whole numbers from 0 to 1440 minutes.');
    if(byIndex.has(to))throw new Error('Only one travel estimate can be saved for each stop pair.');
    byIndex.set(to,estimate.minutes)