import type {Digest,KeyValueSecureStore} from './local-saved-queue-approval';
import type {SavedQueueTravelEstimate} from '../domain/saved-queue-order';
export type QueueOrderContext={subject:string;businessId:string;date:string};
export type SavedQueueOrderState={visitIds:string[];travelEstimates:SavedQueueTravelEstimate[]};
type StoredTravelEstimate={toIndex:number;minutes:number};
type OrderRecord={version:1|2;businessDigest:string;date:string;visitDigests:string[];travelByStop?:StoredTravelEstimate[]};
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
  if((r.version!==1&&r.version!==2)||typeof r.businessDigest!=='string'||typeof r.date!=='string'
   ||!Array.isArray(r.visitDigests)||r.visitDigests.some(id=>typeof id!=='string'||!id)
   ||new Set(r.visitDigests).size!==r.visitDigests.length)return null;
  if(r.version===1)return r as OrderRecord;
  if(!Array.isArray(r.travelByStop))return null;
  const stops=new Set<number>();
  for(const item of r.travelByStop){
   if(!item||!Number.isSafeInteger(item.toIndex)||item.toIndex<1||item.toIndex>=r.visitDigests.length
    ||stops.has(item.toIndex)||!Number.isSafeInteger(item.minutes)||item.minutes<0||item.minutes>1440)return null;
   stops.add(item.toIndex);
  }
  return r as OrderRecord;
 }catch{return null;}
}
/** Latest chosen queue and its adjacent manual travel estimates on this device per operator.
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
   const fromVisitId=originalIds[item.toIndex-1],toVisitId=originalIds[item.toIndex];
   if(fromVisitId&&toVisitId&&result.indexOf(toVisitId)===result.indexOf(fromVisitId)+1)
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
    const from=position.get(estimate.fromVisitId),to=position.get(estimate.toVisitId);
    if(from===undefined||to!==from+1)throw new Error('Travel estimates must match adjacent stops in the saved work order.');
    if(!Number.isSafeInteger(estimate.minutes)||estimate.minutes<0||estimate.minutes>1440)throw new Error('Travel estimates must be whole numbers from 0 to 1440 minutes.');
    if(byIndex.has(to))throw new Error('Only one travel estimate can be saved for each stop pair.');
    byIndex.set(to,estimate.minutes);
   }
   const [key,businessDigest,visitDigests]=await Promise.all([
    keyFor(context.subject),digest('business:'+context.businessId),Promise.all(visitIds.map(id=>digest('visit:'+id)))
   ]);
   const travelByStop=[...byIndex].sort((a,b)=>a[0]-b[0]).map(([toIndex,minutes])=>({toIndex,minutes}));
   const record:OrderRecord=travelByStop.length
    ?{version:2,businessDigest,date:context.date,visitDigests,travelByStop}
    :{version:1,businessDigest,date:context.date,visitDigests};
   const serialized=JSON.stringify(record);
   if(serialized.length>MAX_RECORD_LENGTH)throw new Error('This work queue and its travel estimates are too large to save securely on this device. Keep the current order.');
   await storage.setItemAsync(key,serialized);
  },
  async load(context:QueueOrderContext,currentVisitIds:readonly string[]):Promise<string[]|null>{
   return (await loadState(context,currentVisitIds))?.visitIds??null;
  },
  loadState
 };
}
