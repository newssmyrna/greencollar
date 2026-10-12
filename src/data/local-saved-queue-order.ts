import type {Digest,KeyValueSecureStore} from './local-saved-queue-approval';
export type QueueOrderContext={subject:string;businessId:string;date:string};
type OrderRecord={version:1;businessDigest:string;date:string;visitDigests:string[]};
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
  if(r.version!==1||typeof r.businessDigest!=='string'||typeof r.date!=='string'
   ||!Array.isArray(r.visitDigests)||r.visitDigests.some(id=>typeof id!=='string'||!id)
   ||new Set(r.visitDigests).size!==r.visitDigests.length)return null;
  return r as OrderRecord;
 }catch{return null;}
}
/** Latest chosen queue on this device per operator. Stores only hashes and the date.
 * Restore maps hashes against current authorized IDs; storage failures propagate.
 */
export function createLocalSavedQueueOrderStore(storage:KeyValueSecureStore,digest:Digest){
 const keyFor=async(subject:string)=>'greencollar_queue_order_'+await digest('operator:'+subject);
 return {
  async save(context:QueueOrderContext,visitIds:readonly string[]):Promise<void>{
   validateContext(context);validateIds(visitIds);
   const [key,businessDigest,visitDigests]=await Promise.all([
    keyFor(context.subject),digest('business:'+context.businessId),Promise.all(visitIds.map(id=>digest('visit:'+id)))
   ]);
   const record:OrderRecord={version:1,businessDigest,date:context.date,visitDigests};
   const serialized=JSON.stringify(record);
   if(serialized.length>MAX_RECORD_LENGTH)throw new Error('This work queue is too large to save securely on this device. Keep the current order.');
   await storage.setItemAsync(key,serialized);
  },
  async load(context:QueueOrderContext,currentVisitIds:readonly string[]):Promise<string[]|null>{
   validateContext(context);validateIds(currentVisitIds);
   const record=parseRecord(await storage.getItemAsync(await keyFor(context.subject)));
   if(!record||record.date!==context.date||record.businessDigest!==await digest('business:'+context.businessId))return null;
   const hashes=await Promise.all(currentVisitIds.map(id=>digest('visit:'+id)));
   const byDigest=new Map(hashes.map((hash,index)=>[hash,currentVisitIds[index]]));
   const result:string[]=[];
   for(const hash of record.visitDigests){
    const id=byDigest.get(hash);
    if(id!==undefined){result.push(id);byDigest.delete(hash);}
   }
   for(let i=0;i<hashes.length;i++)if(byDigest.has(hashes[i]))result.push(currentVisitIds[i]);
   return result;
  }
 };
}
