import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessWorkdayWindow,normalizeWorkdayWindow,type WorkdayWindowInput} from '../src/domain/workday-window';
import {formatServiceClock} from '../src/domain/service-time';
import {assessSavedQueueAppointments,describeAppointmentCheckAssumptions,APPOINTMENT_CHECK_ASSUMPTIONS} from '../src/domain/saved-queue-appointments';
import {createSavedQueueReview,canApproveSavedQueueReview,isSavedQueueApproved,type QueueReviewVisit} from '../src/domain/saved-queue-review';
import {createLocalSavedQueueWorkloadStore,normalizeWorkloadLimits,workloadSettingsScope,type WorkloadSettingsStore} from '../src/data/local-saved-queue-workload';
import {createSavedQueueWorkloadSettings,workloadSettingsHaveUnsavedChanges,workloadSettingsReadyForApproval} from '../src/data/saved-queue-workload-settings';
import {createLocalSavedQueueApprovalStore} from '../src/data/local-saved-queue-approval';
import type {SavedQueueWorkloadLimits} from '../src/domain/saved-queue-workload';

const context={subject:'operator-a',businessId:'business-a',date:'2026-10-13'};
const limits={hours:'8',maxJobs:'6'};
const window={workdayStart:'08:00',workdayFinish:'17:00'};
const settings={...limits,...window};
const visit=(id:string,extra:Partial<QueueReviewVisit>={}):QueueReviewVisit=>({
  id,customer:'Synthetic '+id,service:'Synthetic service',rateCents:5000,estimatedMinutes:30,...extra
});
const review=(rows:QueueReviewVisit[],input:SavedQueueWorkloadLimits=settings)=>
  createSavedQueueReview(context.businessId,context.date,rows,input);
const digest=async(value:string)=>createHash('sha256').update(value).digest('hex');
function deferred<T>(){
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(yes=>{resolve=yes;});
  return {promise,resolve};
}
function fixture(){
  const records=new Map<string,string>();let writes=0;
  const storage={async getItemAsync(key:string){return records.get(key)??null;},async setItemAsync(key:string,value:string){writes++;records.set(key,value);}};
  const store=createLocalSavedQueueWorkloadStore(storage,digest);
  return {records,storage,store,controller:createSavedQueueWorkloadSettings(store),writes:()=>writes};
}

test('optional work window preserves blanks and canonicalizes valid local clock boundaries',()=>{
  assert.deepEqual(normalizeWorkdayWindow({}),{});
  assert.deepEqual(normalizeWorkdayWindow({workdayStart:' ',workdayFinish:''}),{});
  assert.deepEqual(normalizeWorkloadLimits(limits),limits);
  assert.deepEqual(normalizeWorkdayWindow({workdayStart:' 9:05 ',workdayFinish:'17:30'}),{workdayStart:'09:05',workdayFinish:'17:30'});
  assert.deepEqual(assessWorkdayWindow({workdayStart:'00:00',workdayFinish:'24:00'}),{status:'set',startMinute:0,finishMinute:1440,error:''});
  assert.equal(assessWorkdayWindow({workdayStart:'23:59',workdayFinish:'24:00'}).status,'set');
});

test('partial, malformed, equal and overnight work windows reject without invented defaults',()=>{
  for(const input of [
    {workdayStart:'08:00'},{workdayFinish:'17:00'},
    {workdayStart:'08:00',workdayFinish:''},{workdayStart:'09:00',workdayFinish:'09:00'},
    {workdayStart:'22:00',workdayFinish:'06:00'},{workdayStart:'24:00',workdayFinish:'24:00'},
    {workdayStart:'08:60',workdayFinish:'17:00'},{workdayStart:'8am',workdayFinish:'17:00'},
    {workdayStart:null,workdayFinish:'17:00'},{workdayStart:480,workdayFinish:'17:00'},
    {workdayStart:' '.repeat(33),workdayFinish:'17:00'}
  ]){
    const value=input as unknown as WorkdayWindowInput;
    assert.equal(assessWorkdayWindow(value).status,'invalid');
    assert.throws(()=>normalizeWorkdayWindow(value));
  }
});

test('planned work start exposes fixed appointments earlier than the available window',()=>{
  const rows=[visit('a',{fixedStartMinute:450})];
  assert.equal(assessSavedQueueAppointments(rows).status,'no_conflicts_detected');
  const current=assessSavedQueueAppointments(rows,window);
  assert.equal(current.status,'conflicts');
  assert.equal(current.issues[0].kind,'fixed_start_conflict');
  assert.match(current.issues[0].message,/07:30.*30 min short/);
  assert.equal(assessSavedQueueAppointments(rows,{...window,workdayStart:'07:00'}).status,'no_conflicts_detected');
});

test('planned finish bounds flexible service without replacing the separate service-hour budget',()=>{
  const rows=[visit('a',{estimatedMinutes:60}),visit('b',{estimatedMinutes:60})];
  const before=JSON.stringify(rows);
  const current=review(rows,{...limits,workdayStart:'09:00',workdayFinish:'10:00'});
  assert.equal(current.workload?.availableMinutes,480);
  assert.equal(current.workload?.status,'within_limits');
  assert.equal(current.appointments.status,'conflicts');
  assert.equal(current.appointments.issues[0].visitId,'b');
  assert.equal(current.appointments.issues[0].kind,'workday_finish_conflict');
  assert.match(current.appointments.issues[0].message,/10:00 workday finish.*60 min over/);
  assert.equal(review(rows,{...limits,workdayStart:'09:00',workdayFinish:'11:00'}).appointments.status,'no_conflicts_detected');
  assert.equal(JSON.stringify(rows),before);
});

test('the earlier of customer finish and workday finish applies, including waiting time',()=>{
  const row=visit('a',{preferredStartMinute:525,preferredFinishMinute:1020});
  const workday=assessSavedQueueAppointments([row],{workdayStart:'08:00',workdayFinish:'09:00'});
  assert.equal(workday.issues[0].kind,'workday_finish_conflict');
  assert.match(workday.issues[0].message,/15 min over/);
  const customer=assessSavedQueueAppointments([{...row,preferredFinishMinute:540}],window);
  assert.equal(customer.issues[0].kind,'finish_window_conflict');
  const waiting=assessSavedQueueAppointments([visit('late',{preferredStartMinute:960,estimatedMinutes:60}),visit('after')],window);
  assert.equal(waiting.issues[0].visitId,'after');
  assert.match(waiting.issues[0].message,/30 min over/);
});

test('review copy states the entered window and keeps the no-window assumptions explicit',()=>{
  assert.equal(describeAppointmentCheckAssumptions(assessSavedQueueAppointments([visit('a')])),APPOINTMENT_CHECK_ASSUMPTIONS);
  const copy=describeAppointmentCheckAssumptions(assessSavedQueueAppointments([visit('a')],window));
  assert.match(copy,/planned 08:00–17:00 work window/);
  assert.match(copy,/Travel and breaks are excluded/);
  assert.match(copy,/device clock is not used/);
  assert.match(describeAppointmentCheckAssumptions(assessSavedQueueAppointments([],{workdayStart:'08:00'})),/Correct the workday window/);
});

test('work-window check agrees with exhaustive schedules across 200 bounded synthetic cases',()=>{
  let seed=62,fitCount=0,conflictCount=0;
  const next=(max:number)=>{seed=(seed*1664525+1013904223)>>>0;return seed%max;};
  function fits(rows:QueueReviewVisit[],finish:number,index:number,free:number):boolean{
    if(index===rows.length)return true;
    const row=rows[index],latest=Math.min(finish,row.preferredFinishMinute??1440)-row.estimatedMinutes;
    for(let start=Math.max(free,row.preferredStartMinute??0);start<=latest;start++){
      if(row.fixedStartMinute!==undefined&&row.fixedStartMinute!==start)continue;
      if(fits(rows,finish,index+1,start+row.estimatedMinutes))return true;
    }
    return false;
  }
  for(let example=0;example<200;example++){
    const start=next(6),finish=start+1+next(14);
    const rows=Array.from({length:2},(_,index)=>visit(String(index),{
      estimatedMinutes:1+next(4),preferredStartMinute:next(9),preferredFinishMinute:1+next(20),
      ...(next(3)===0?{fixedStartMinute:next(13)}:{})
    }));
    const feasible=fits(rows,finish,0,start);
    if(feasible)fitCount++;else conflictCount++;
    const result=assessSavedQueueAppointments(rows,{workdayStart:formatServiceClock(start),workdayFinish:formatServiceClock(finish)});
    assert.equal(result.status==='conflicts',!feasible,'case '+example);
  }
  assert.ok(fitCount>0&&conflictCount>0);
});

test('approval binds normalized workday boundaries and detects edits to either clock',()=>{
  const rows=[visit('a')],original=review(rows);
  assert.equal(review(rows,{...limits,workdayStart:' 8:00 ',workdayFinish:'17:00'}).approvalKey,original.approvalKey);
  for(const changed of [{...settings,workdayStart:'09:00'},{...settings,workdayFinish:'16:00'},limits])
    assert.equal(isSavedQueueApproved(review(rows,changed),original.approvalKey),false);
});

test('invalid work windows cannot restore or overwrite approval even with a matching key',async()=>{
  const f=fixture(),approvals=createLocalSavedQueueApprovalStore(f.storage,digest);
  await approvals.approve(context.subject,review([visit('a')]));
  const previous=[...f.records];
  const invalid=review([visit('a')],{...limits,workdayStart:'08:00'});
  assert.equal(invalid.appointments.status,'invalid_window');
  assert.equal(canApproveSavedQueueReview(invalid),false);
  assert.equal(isSavedQueueApproved(invalid,invalid.approvalKey),false);
  assert.equal(await approvals.isApproved(context.subject,invalid),false);
  await assert.rejects(()=>approvals.approve(context.subject,invalid),/valid workday window/);
  assert.deepEqual([...f.records],previous);
});

test('the previous appointment approval policy requires a fresh review',async()=>{
  const f=fixture(),approvals=createLocalSavedQueueApprovalStore(f.storage,digest);
  const rows=[visit('a')],current=review(rows,limits);
  const snapshot=[context.businessId,context.date,rows.map(v=>[v.id,v.rateCents,v.estimatedMinutes,null,null,null])];
  const oldKey=JSON.stringify(['saved-queue-appointments-v1',...snapshot,['within_limits',480,6]]);
  await approvals.approve(context.subject,{...current,approvalKey:oldKey});
  assert.equal(await approvals.isApproved(context.subject,current),false);
});

test('current records round trip the canonical work window in isolated scopes',async()=>{
  const f=fixture();
  await f.store.save(context,{...limits,workdayStart:' 8:00 ',workdayFinish:'17:00'});
  assert.deepEqual(await createLocalSavedQueueWorkloadStore(f.storage,digest).load(context),settings);
  for(const other of [{...context,subject:'operator-b'},{...context,businessId:'business-b'},{...context,date:'2026-10-14'}]){
    assert.equal(await f.store.load(other),null);
    await f.store.save(other,{...limits,workdayStart:'10:00',workdayFinish:'14:00'});
    assert.deepEqual(await f.store.load(context),settings);
  }
  for(const raw of f.records.values()){
    assert.equal(JSON.parse(raw).version,3);
    assert.ok(raw.length<=512);
    for(const identity of [context.subject,context.businessId,context.date])assert.equal(raw.includes(identity),false);
  }
});

test('legacy settings load without inventing a window or silently rewriting the record',async()=>{
  const f=fixture();await f.store.save(context,limits);
  const [key,value]=[...f.records][0],old=JSON.stringify({...JSON.parse(value),version:1});
  f.records.set(key,old);const writes=f.writes();
  assert.deepEqual(await f.store.load(context),limits);
  assert.equal(f.writes(),writes);
  assert.equal(f.records.get(key),old);
  await f.store.save(context,settings);
  assert.equal(JSON.parse(f.records.get(key)!).version,3);
  assert.deepEqual(await f.store.load(context),settings);
});

test('partial, malformed or unexpected persisted work windows retain their original bytes',async()=>{
  const f=fixture();await f.store.save(context,settings);
  const [key,value]=[...f.records][0],record=JSON.parse(value);
  for(const bad of [
    {...record,workdayFinish:undefined},{...record,workdayStart:null},
    {...record,workdayStart:480},{...record,workdayStart:'22:00',workdayFinish:'06:00'},
    {...record,version:1},{...record,version:99}
  ]){
    const raw=JSON.stringify(bad);f.records.set(key,raw);
    await assert.rejects(()=>f.store.load(context),/could not be read/);
    assert.equal(f.records.get(key),raw);
  }
});

test('pending storage captures workday clocks before caller mutation',async()=>{
  const f=fixture(),input={...settings};
  const saving=f.store.save(context,input);
  input.workdayStart='12:00';input.workdayFinish='13:00';
  await saving;
  assert.deepEqual(await f.store.load(context),settings);
});

test('workday-only edits block approval until saved, restore exactly, and can be explicitly cleared',async()=>{
  const f=fixture(),approvals=createLocalSavedQueueApprovalStore(f.storage,digest),rows=[visit('a')];
  await f.store.save(context,settings);
  await approvals.approve(context.subject,review(rows));
  const loading=f.controller.activate(context);
  assert.equal(workloadSettingsReadyForApproval(f.controller.getState()),false);
  await loading;
  assert.equal(await approvals.isApproved(context.subject,review(rows,f.controller.getState().draft)),true);
  f.controller.edit('workdayStart','09:00');
  assert.equal(workloadSettingsHaveUnsavedChanges(f.controller.getState()),true);
  assert.equal(workloadSettingsReadyForApproval(f.controller.getState()),false);
  assert.deepEqual(await f.store.load(context),settings);
  assert.equal(await f.controller.save(),true);
  assert.equal(await approvals.isApproved(context.subject,review(rows,f.controller.getState().draft)),false);
  const restored=createSavedQueueWorkloadSettings(f.store);
  await restored.activate(context);
  assert.equal(restored.getState().draft.workdayStart,'09:00');
  restored.edit('workdayStart','');restored.edit('workdayFinish','');
  assert.equal(await restored.save(),true);
  assert.deepEqual(await f.store.load(context),limits);
});

test('partial work-window edits reject before storage while leaving the previous settings intact',async()=>{
  const f=fixture();await f.store.save(context,limits);await f.controller.activate(context);
  const writes=f.writes();
  f.controller.edit('workdayStart','08:00');
  assert.equal(await f.controller.save(),false);
  assert.equal(f.writes(),writes);
  assert.match(f.controller.getState().error,/both a workday start and finish/);
  assert.deepEqual(await f.store.load(context),limits);
  assert.equal(workloadSettingsReadyForApproval(f.controller.getState()),false);
});

test('work-window saves block repeated taps and edits until the captured write completes',async()=>{
  const pending=deferred<SavedQueueWorkloadLimits>();let writes=0;
  const controller=createSavedQueueWorkloadSettings({
    async load(){return settings;},async save(){writes++;return pending.promise;}
  });
  await controller.activate(context);controller.edit('workdayFinish','16:00');
  const saving=controller.save();
  assert.equal(controller.edit('workdayStart','09:00'),false);
  assert.equal(await controller.save(),false);
  assert.equal(workloadSettingsReadyForApproval(controller.getState()),false);
  pending.resolve({...settings,workdayFinish:'16:00'});
  assert.equal(await saving,true);assert.equal(writes,1);
  assert.equal(controller.getState().saved?.workdayFinish,'16:00');
});

test('an uncertain window write requires readback without automatically writing a second time',async()=>{
  const f=fixture();await f.store.save(context,settings);
  const uncertain:WorkloadSettingsStore={
    load:f.store.load,async save(scope,value){await f.store.save(scope,value);throw Error('ack lost');}
  };
  const controller=createSavedQueueWorkloadSettings(uncertain);
  await controller.activate(context);controller.edit('workdayStart','09:00');
  assert.equal(await controller.save(),false);
  assert.equal(workloadSettingsReadyForApproval(controller.getState()),false);
  const writes=f.writes();await controller.retry();
  assert.equal(f.writes(),writes);
  assert.equal(controller.getState().saved?.workdayStart,'09:00');
  assert.equal(workloadSettingsReadyForApproval(controller.getState()),true);
});

test('late window restoration and save results cannot cross work-date scopes',async()=>{
  const pending=deferred<SavedQueueWorkloadLimits|null>(),saveResult=deferred<SavedQueueWorkloadLimits>();
  const next={...context,date:'2026-10-14'},nextSettings={...limits,workdayStart:'10:00',workdayFinish:'14:00'};
  const controller=createSavedQueueWorkloadSettings({
    async load(scope){return scope.date===context.date?pending.promise:nextSettings;},
    async save(){return saveResult.promise;}
  });
  const loading=controller.activate(context);
  await controller.activate(next);pending.resolve(settings);await loading;
  assert.equal(controller.getState().scopeKey,workloadSettingsScope(next));
  assert.deepEqual(controller.getState().draft,nextSettings);
  controller.edit('workdayFinish','15:00');const saving=controller.save();
  await controller.activate(context);
  saveResult.resolve({...nextSettings,workdayFinish:'15:00'});assert.equal(await saving,false);
  assert.deepEqual(controller.getState().draft,settings);
});
