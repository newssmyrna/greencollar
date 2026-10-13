import {assessSavedQueueWorkload,describeSavedQueueWorkload,type SavedQueueWorkloadLimits} from '../domain/saved-queue-workload';
import type {Digest,KeyValueSecureStore} from './local-saved-queue-approval';

export type WorkloadSettingsContext={subject:string;businessId:string;date:string};
export type WorkloadSettingsStore={
  load(context:WorkloadSettingsContext):Promise<SavedQueueWorkloadLimits|null>;
  save(context:WorkloadSettingsContext,limits:SavedQueueWorkloadLimits):Promise<SavedQueueWorkloadLimits>;
};
const MAX_RECORD_LENGTH=512;

export function workloadSettingsScope(context:WorkloadSettingsContext):string{
  return JSON.stringify([context.subject,context.businessId,context.date]);
}
function validateContext(context:WorkloadSettingsContext):void{
  for(const value of [context.subject,context.businessId])
    if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error('A signed-in operator and business are required');
  const date=new Date(context.date+'T00:00:00.000Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(context.date)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==context.date)
    throw new Error('A valid work date is required');
}
export function normalizeWorkloadLimits(limits:SavedQueueWorkloadLimits):SavedQueueWorkloadLimits{
  if(!limits||typeof limits.hours!=='string'||typeof limits.maxJobs!=='string'
    ||limits.hours.length>32||limits.maxJobs.length>32)throw new Error('Invalid workload limits');
  const assessment=assessSavedQueueWorkload([],limits);
  if(assessment.status!=='within_limits')throw new Error(describeSavedQueueWorkload(assessment));
  return {
    hours:limits.hours.trim()?String(Number(limits.hours)):'',
    maxJobs:limits.maxJobs.trim()?String(Number(limits.maxJobs)):''
  };
}

/** Device-local limits for each exact operator/business/date. Keys and records contain no raw identities.
 * Operations serialize per scope; failures propagate and never cause deletion or automatic retries.
 */
export function createLocalSavedQueueWorkloadStore(storage:KeyValueSecureStore,digest:Digest):WorkloadSettingsStore{
  const pending=new Map<string,Promise<unknown>>();
  function ordered<T>(scope:string,action:()=>Promise<T>):Promise<T>{
    const next=(pending.get(scope)??Promise.resolve()).catch(()=>{}).then(action);
    pending.set(scope,next);
    const cleanup=()=>{if(pending.get(scope)===next)pending.delete(scope);};
    void next.then(cleanup,cleanup);
    return next;
  }
  async function identity(context:WorkloadSettingsContext){
    const contextDigest=await digest('workload-settings:'+workloadSettingsScope(context));
    if(!/^[a-f0-9]{64}$/i.test(contextDigest))throw new Error('Could not derive a secure workload key');
    return {contextDigest,key:'greencollar_workload_'+contextDigest};
  }
  return {
    async save(context,limits){
      validateContext(context);
      // Copy inputs before asynchronous hashing or earlier operations can delay the write.
      const captured={...context},normalized=normalizeWorkloadLimits(limits);
      return ordered(workloadSettingsScope(captured),async()=>{
        const {contextDigest,key}=await identity(captured);
        const record=JSON.stringify({version:1,contextDigest,...normalized});
        if(record.length>MAX_RECORD_LENGTH)throw new Error('Workload settings are too large to save');
        await storage.setItemAsync(key,record);
        return {...normalized};
      });
    },
    async load(context){
      validateContext(context);
      const captured={...context};
      return ordered(workloadSettingsScope(captured),async()=>{
        const {contextDigest,key}=await identity(captured);
        const value=await storage.getItemAsync(key);
        if(value===null)return null;
        try{
          if(value.length>MAX_RECORD_LENGTH)throw new Error('Oversized record');
          const record=JSON.parse(value);
          if(!record||typeof record!=='object'||record.version!==1||record.contextDigest!==contextDigest)
            throw new Error('Mismatched record');
          return normalizeWorkloadLimits(record);
        }catch{
          throw new Error('Saved workload limits could not be read. Retry or explicitly enter replacement limits.');
        }
      });
    }
  };
}
