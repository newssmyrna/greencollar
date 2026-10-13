import type {SavedQueueWorkloadLimits} from '../domain/saved-queue-workload';
import {normalizeWorkloadLimits,workloadSettingsScope,type WorkloadSettingsContext,type WorkloadSettingsStore} from './local-saved-queue-workload';

export type WorkloadSettingsState={
  scopeKey:string|null;
  status:'idle'|'loading'|'ready'|'saving'|'error';
  draft:SavedQueueWorkloadLimits;
  saved:SavedQueueWorkloadLimits|null;
  error:string;
};
const empty=():SavedQueueWorkloadLimits=>({hours:'',maxJobs:''});
const idle=():WorkloadSettingsState=>({scopeKey:null,status:'idle',draft:empty(),saved:null,error:''});
export function workloadSettingsHaveUnsavedChanges(state:WorkloadSettingsState):boolean{
  return !state.saved||state.draft.hours!==state.saved.hours||state.draft.maxJobs!==state.saved.maxJobs
    ||(state.draft.workdayStart??'')!==(state.saved.workdayStart??'')
    ||(state.draft.workdayFinish??'')!==(state.saved.workdayFinish??'');
}
export function workloadSettingsReadyForApproval(state:WorkloadSettingsState|null):boolean{
  return !!state&&state.status==='ready'&&!workloadSettingsHaveUnsavedChanges(state);
}

/** Keeps approval gated until a restore or explicit save confirms this scope's limits.
 * Async results from a previous scope are ignored; the device write itself may still complete.
 */
export function createSavedQueueWorkloadSettings(store:WorkloadSettingsStore){
  let state=idle(),context:WorkloadSettingsContext|null=null,generation=0;
  const listeners=new Set<(state:WorkloadSettingsState)=>void>();
  const snapshot=():WorkloadSettingsState=>({...state,draft:{...state.draft},saved:state.saved?{...state.saved}:null});
  const publish=(next:WorkloadSettingsState)=>{
    state=next;
    for(const listener of listeners)listener(snapshot());
  };
  async function activate(nextContext:WorkloadSettingsContext|null):Promise<void>{
    const request=++generation;
    context=nextContext?{...nextContext}:null;
    if(!context){publish(idle());return;}
    const captured={...context},scopeKey=workloadSettingsScope(captured);
    publish({scopeKey,status:'loading',draft:empty(),saved:null,error:''});
    try{
      const restored=await store.load(captured);
      if(request!==generation)return;
      publish({scopeKey,status:'ready',draft:restored?{...restored}:empty(),saved:restored?{...restored}:null,error:''});
    }catch{
      if(request===generation)publish({scopeKey,status:'error',draft:empty(),saved:null,
        error:'Could not restore work settings. Retry or enter replacement settings before approving.'});
    }
  }
  return {
    getState:snapshot,
    subscribe(listener:(state:WorkloadSettingsState)=>void){
      listeners.add(listener);listener(snapshot());
      return ()=>{listeners.delete(listener);};
    },
    activate,
    retry(){return activate(context);},
    reset(){generation++;context=null;publish(idle());},
    edit(field:keyof SavedQueueWorkloadLimits,value:string):boolean{
      if(state.status!=='ready')return false;
      publish({...state,draft:{...state.draft,[field]:value},error:''});
      return true;
    },
    enterReplacement():boolean{
      if(!context||state.status!=='error')return false;
      generation++;
      publish({...state,status:'ready',draft:empty(),saved:null,
        error:'Enter new settings and tap Save. The stored record stays untouched until you save replacements.'});
      return true;
    },
    async save():Promise<boolean>{
      if(!context||state.status!=='ready'||!workloadSettingsHaveUnsavedChanges(state))return false;
      let limits:SavedQueueWorkloadLimits;
      try{limits=normalizeWorkloadLimits(state.draft);}
      catch(error){publish({...state,error:error instanceof Error?error.message:'Enter valid work settings'});return false;}
      const captured={...context},request=++generation;
      publish({...state,status:'saving',error:''});
      try{
        const saved=await store.save(captured,limits);
        if(request!==generation)return false;
        publish({...state,status:'ready',draft:{...saved},saved:{...saved},error:''});
        return true;
      }catch{
        if(request===generation)publish({...state,status:'error',
          error:'Could not confirm the work settings save; it may have been written. Restore or enter replacement settings before continuing.'});
        return false;
      }
    }
  };
}
