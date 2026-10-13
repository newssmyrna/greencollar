import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createLocalSavedQueueWorkloadStore,workloadSettingsScope,type WorkloadSettingsStore} from '../src/data/local-saved-queue-workload';
import {createSavedQueueWorkloadSettings,workloadSettingsHaveUnsavedChanges,workloadSettingsReadyForApproval} from '../src/data/saved-queue-workload-settings';
import {createLocalSavedQueueApprovalStore} from '../src/data/local-saved-queue-approval';
import {createSavedQueueReview} from '../src/domain/saved-queue-review';
import type {SavedQueueWorkloadLimits} from '../src/domain/saved-queue-workload';

const context={subject:'operator-a',businessId:'business-a',date:'2026-10-13'};
const limits={hours:'4.25',maxJobs:'3'};
const digest=async(value:string)=>createHash('sha256').update(value).digest('hex');
function deferred<T>(){
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(yes=>{resolve=yes;});
  return {promise,resolve};
}
function fixture(){
  const memory=new Map<string,string>();
  const storage={async getItemAsync(key:string){return memory.get(key)??null;},async setItemAsync(key:string,value:string){memory.set(key,value);}};
  const store=createLocalSavedQueueWorkloadStore(storage,digest);
  return {memory,storage,store,settings:createSavedQueueWorkloadSettings(store)};
}

test('missing limits require a valid explicit save before approval',async()=>{
  const f=fixture();await f.settings.activate(context);
  assert.equal(f.settings.getState().status,'ready');
  assert.equal(workloadSettingsReadyForApproval(f.settings.getState()),false);
  assert.equal(await f.settings.save(),false);
  assert.equal(f.memory.size,0);
  f.settings.edit('hours','4.25');
  assert.equal(workloadSettingsHaveUnsavedChanges(f.settings.getState()),true);
  assert.equal(workloadSettingsReadyForApproval(f.settings.getState()),false);
  assert.equal(await f.settings.save(),true);
  assert.equal(workloadSettingsReadyForApproval(f.settings.getState()),true);
  assert.deepEqual(await f.store.load(context),{hours:'4.25',maxJobs:''});
});

test('saved settings restore before matching device approval can be reused',async()=>{
  const f=fixture(),approvals=createLocalSavedQueueApprovalStore(f.storage,digest);
  const visits=[{id:'visit-a',customer:'Synthetic Customer',service:'Cleaning',rateCents:8000,estimatedMinutes:60}];
  await f.store.save(context,limits);
  await approvals.approve(context.subject,createSavedQueueReview(context.businessId,context.date,visits,limits));
  const restoring=f.settings.activate(context);
  assert.equal(workloadSettingsReadyForApproval(f.settings.getState()),false);
  await restoring;
  assert.equal(workloadSettingsReadyForApproval(f.settings.getState()),true);
  assert.equal(await approvals.isApproved(context.subject,createSavedQueueReview(context.businessId,context.date,visits,f.settings.getState().draft)),true);
  f.settings.edit('hours','5');
  assert.equal(workloadSettingsReadyForApproval(f.settings.getState()),false);
  assert.deepEqual(await f.store.load(context),limits);
  await f.settings.save();
  assert.equal(await approvals.isApproved(context.subject,createSavedQueueReview(context.businessId,context.date,visits,f.settings.getState().draft)),false);
});

test('pending saves gate approval, block edits and ignore repeated save taps',async()=>{
  const pending=deferred<SavedQueueWorkloadLimits>();let writes=0;
  const settings=createSavedQueueWorkloadSettings({
    async load(){return limits;},
    async save(){writes++;return pending.promise;}
  });
  await settings.activate(context);settings.edit('hours','5');
  const save=settings.save();
  assert.equal(settings.getState().status,'saving');
  assert.equal(workloadSettingsReadyForApproval(settings.getState()),false);
  assert.equal(settings.edit('hours','6'),false);
  assert.equal(await settings.save(),false);
  assert.equal(writes,1);
  pending.resolve({hours:'5',maxJobs:'3'});assert.equal(await save,true);
  assert.deepEqual(settings.getState().saved,{hours:'5',maxJobs:'3'});
});

test('failed restoration stays gated until retry succeeds',async()=>{
  let fail=true;
  const settings=createSavedQueueWorkloadSettings({
    async load(){if(fail)throw Error('read failure');return limits;},
    async save(_context,value){return value;}
  });
  await settings.activate(context);
  assert.equal(settings.getState().status,'error');
  assert.equal(workloadSettingsReadyForApproval(settings.getState()),false);
  assert.equal(settings.edit('hours','5'),false);
  fail=false;await settings.retry();
  assert.equal(workloadSettingsReadyForApproval(settings.getState()),true);
  assert.deepEqual(settings.getState().draft,limits);
});

test('a write that commits then reports failure must be reconciled before approval',async()=>{
  const f=fixture();await f.store.save(context,limits);
  const uncertain:WorkloadSettingsStore={
    load:f.store.load,
    async save(scope,value){await f.store.save(scope,value);throw Error('acknowledgment lost');}
  };
  const settings=createSavedQueueWorkloadSettings(uncertain);
  await settings.activate(context);settings.edit('hours','5');
  assert.equal(await settings.save(),false);
  assert.equal(settings.getState().status,'error');
  assert.equal(workloadSettingsReadyForApproval(settings.getState()),false);
  assert.match(settings.getState().error,/may have been written/);
  await settings.retry();
  assert.deepEqual(settings.getState().saved,{hours:'5',maxJobs:'3'});
  assert.equal(workloadSettingsReadyForApproval(settings.getState()),true);
});

test('replacement recovery preserves corrupt bytes until explicit valid save',async()=>{
  const f=fixture();await f.store.save(context,limits);
  const key=[...f.memory.keys()][0];f.memory.set(key,'corrupt record');
  await f.settings.activate(context);
  assert.equal(f.settings.enterReplacement(),true);
  assert.equal(f.memory.get(key),'corrupt record');
  assert.equal(workloadSettingsReadyForApproval(f.settings.getState()),false);
  f.settings.edit('maxJobs','6');
  assert.equal(f.memory.get(key),'corrupt record');
  await f.settings.save();
  assert.deepEqual(await f.store.load(context),{hours:'',maxJobs:'6'});
});

test('late restoration cannot leak limits into a different operator business or date',async()=>{
  const pending=deferred<SavedQueueWorkloadLimits|null>();
  const nextContext={...context,subject:'operator-b',businessId:'business-b',date:'2026-10-14'};
  const settings=createSavedQueueWorkloadSettings({
    async load(scope){return scope.subject===context.subject?pending.promise:{hours:'',maxJobs:'2'};},
    async save(_scope,value){return value;}
  });
  const first=settings.activate(context);
  await settings.activate(nextContext);
  pending.resolve(limits);await first;
  assert.equal(settings.getState().scopeKey,workloadSettingsScope(nextContext));
  assert.deepEqual(settings.getState().draft,{hours:'',maxJobs:'2'});
});

test('late save results do not change a new scope',async()=>{
  const pending=deferred<SavedQueueWorkloadLimits>();
  const nextContext={...context,businessId:'business-b'};
  const settings=createSavedQueueWorkloadSettings({
    async load(scope){return scope.businessId===context.businessId?limits:{hours:'',maxJobs:'2'};},
    async save(){return pending.promise;}
  });
  await settings.activate(context);settings.edit('hours','5');
  const saving=settings.save();
  await settings.activate(nextContext);
  pending.resolve({hours:'5',maxJobs:'3'});assert.equal(await saving,false);
  assert.deepEqual(settings.getState().draft,{hours:'',maxJobs:'2'});
  settings.reset();
  assert.equal(settings.getState().status,'idle');
  assert.equal(workloadSettingsReadyForApproval(settings.getState()),false);
});

test('subscribers and callers cannot mutate the controllers saved snapshot',async()=>{
  const f=fixture();await f.store.save(context,limits);
  const unsubscribe=f.settings.subscribe(state=>{state.draft.hours='20';if(state.saved)state.saved.maxJobs='200';});
  await f.settings.activate(context);
  const snapshot=f.settings.getState();snapshot.draft.hours='21';
  assert.deepEqual(f.settings.getState().draft,limits);
  assert.deepEqual(f.settings.getState().saved,limits);
  unsubscribe();
});

test('reset during restoration ignores the late result',async()=>{
  const pending=deferred<SavedQueueWorkloadLimits|null>();
  const settings=createSavedQueueWorkloadSettings({
    async load(){return pending.promise;},
    async save(_scope,value){return value;}
  });
  const loading=settings.activate(context);
  settings.reset();
  pending.resolve(limits);await loading;
  assert.equal(settings.getState().status,'idle');
  assert.equal(settings.getState().scopeKey,null);
  assert.deepEqual(settings.getState().draft,{hours:'',maxJobs:''});
  assert.equal(workloadSettingsReadyForApproval(settings.getState()),false);
});
