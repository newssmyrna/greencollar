import {canApproveSavedQueueReview,type SavedQueueReview} from '../domain/saved-queue-review';

export type KeyValueSecureStore={
  getItemAsync(key:string):Promise<string|null>;
  setItemAsync(key:string,value:string):Promise<void>;
};
export type Digest=(value:string)=>Promise<string>;
type ApprovalRecord={version:1;businessDigest:string;date:string;approvalDigest:string};

function parseRecord(value:string|null):ApprovalRecord|null{
  if(!value)return null;
  try{
    const parsed:unknown=JSON.parse(value);
    if(!parsed||typeof parsed!=='object')return null;
    const record=parsed as Partial<ApprovalRecord>;
    if(record.version!==1||typeof record.businessDigest!=='string'
      ||typeof record.date!=='string'||typeof record.approvalDigest!=='string')return null;
    return record as ApprovalRecord;
  }catch{return null;}
}

/** Keeps the latest approved saved work queue on this device, bound to operator, business and date. */
export function createLocalSavedQueueApprovalStore(storage:KeyValueSecureStore,digest:Digest){
  async function keyFor(subject:string):Promise<string>{
    if(!subject)throw new Error('Signed-in operator is required');
    return 'greencollar_approved_queue_'+await digest('operator:'+subject);
  }
  return {
    async isApproved(subject:string,review:SavedQueueReview|null):Promise<boolean>{
      if(!subject||!review||!canApproveSavedQueueReview(review))return false;
      const record=parseRecord(await storage.getItemAsync(await keyFor(subject)));
      if(!record||record.date!==review.date)return false;
      const [businessDigest,approvalDigest]=await Promise.all([
        digest('business:'+review.businessId),
        digest('approval:'+review.approvalKey)
      ]);
      return record.businessDigest===businessDigest&&record.approvalDigest===approvalDigest;
    },
    async approve(subject:string,review:SavedQueueReview):Promise<void>{
      if(!subject)throw new Error('Signed-in operator is required');
      if(!review.visitCount)throw new Error('There are no visits to approve');
      if(!canApproveSavedQueueReview(review))throw new Error(review.appointments?.status==='invalid_visits'
        ?'Resolve invalid appointment data before approving':'Enter valid workload limits before approving');
      const [key,businessDigest,approvalDigest]=await Promise.all([
        keyFor(subject),
        digest('business:'+review.businessId),
        digest('approval:'+review.approvalKey)
      ]);
      const record:ApprovalRecord={version:1,businessDigest,date:review.date,approvalDigest};
      await storage.setItemAsync(key,JSON.stringify(record));
    }
  };
}
