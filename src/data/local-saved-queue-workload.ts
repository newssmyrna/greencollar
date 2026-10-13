import {assessSavedQueueWorkload,describeSavedQueueWorkload,type SavedQueueWorkloadLimits} from '../domain/saved-queue-workload';
import {normalizeWorkdayWindow} from '../domain/workday-window';
import {normalizeWorkdayBreak} from '../domain/workday-break';
import type {Digest,KeyValueSecureStore} from './local-saved-queue-approval';

export type WorkloadSettingsContext={subject:string;businessId:string;date:string};
export type WorkloadSettingsStore={
  load(context:WorkloadSettingsContext):Promise<SavedQueueWorkloadLimits|null>;
  save(context:WorkloadSettingsContext,limits:SavedQueueWorkloadLimits):Promise<SavedQueueWorkloadLimits>;
};
const MAX_RECORD_LENGTH=512;
const hasOwn=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);

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
    maxJobs:limits.maxJobs.trim()?String(Number(limits.maxJobs)):'',
    ...normalizeWorkdayWindow(limits),
    ...normalizeWorkdayBreak(limits)
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
        const record=JSON.stringify({version:4,contextDigest,...normalized});
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
          if(!record||typeof record!=='object'||![1,2,3,4].includes(record.version)||record.contextDigest!==contextDigest)
            throw new Error('Mismatched record');
          if(record.version===1&&('workdayStart' in record||'workdayFinish' in record))
            throw new Error('Unexpected workday fields in a legacy record');
          if(record.version<3&&('breakStart' in record||'breakFinish' in record||'breaks' in record))
            throw new Error('Unexpected break fields in a legacy record');
          if(record.version===3){
            const hasStart=hasOwn(record,'breakStart'),hasFinish=hasOwn(record,'breakFinish');
            if(hasStart!==hasFinish||'breaks' in record)throw new Error('Unexpected legacy break fields');
            if(hasStart){
              if(typeof record.breakStart!=='string'||typeof record.breakFinish!=='string')
                throw new Error('Malformed version-three break fields');
              const legacyBreak=normalizeWorkdayBreak({
                workdayStart:record.workdayStart as string|undefined,
                workdayFinish:record.workdayFinish as string|undefined,
                breaks:record.breakStart+'-'+record.breakFinish
              });
              return normalizeWorkloadLimits({...record,...legacyBreak});
            }
          }else if(record.version===4&&('breakStart' in record||'breakFinish' in record))
            throw new Error('Unexpected old break fields');
          return normalizeWorkloadLimits(record);
        }catch{
          throw new Error('Saved work settings could not be read. Retry or explicitly enter replacement settings.');
        }
      });
    }
  };
}
