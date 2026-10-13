import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessWorkdayBreak,normalizeWorkdayBreak,type WorkdayTimingInput} from '../src/domain/workday-break';
import {formatServiceClock} from '../src/domain/service-time';
import {assessSavedQueueAppointments,describeSavedQueueAppointments,describeAppointmentCheckAssumptions} from '../src/domain/saved-queue-appointments';
import {createSavedQueueReview,canApproveSavedQueueReview,savedQueueApprovalAction,type QueueReviewVisit} from '../src/domain/saved-queue-review';
import {createLocalSavedQueueWorkloadStore,normalizeWorkloadLimits,workloadSettingsScope,type WorkloadSettingsStore} from '../src/data/local-saved-queue-workload';
import {createSavedQueueWorkloadSettings,workloadSettingsHaveUnsavedChanges,workloadSettingsReadyForApproval} from '../src/data/saved-queue-workload-settings';
import {createLocalSavedQueueApprovalStore} from '../src/data/local-saved-queue-approval';
import type {SavedQueueWorkloadLimits} from '../src/domain/saved-queue-workload';

const context={subject:'operator-a',businessId:'business-a',date:'2026-10-13'};
const limits={hours:'8',maxJobs:'6'};
const window={workdayStart:'08:00',workdayFinish:'17:00'};
const pause={breakStart:'12:00',breakFinish:'12:30'};
const settings={...limits,...window,...pause};
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

test('optional break clocks canonicalize without inventing a work window',()=>{
  assert.deepEqual(normalizeWorkdayBreak({}),{});
  assert.deepEqual(normalizeWorkdayBreak({breakStart:' ',breakFinish:''}),{});
  assert.deepEqual(normalizeWorkloadLimits({...limits,breakStart:' 9:05 ',breakFinish:'9:15'}),{...limits,breakStart:'09:05',breakFinish:'09:15'});
  assert.deepEqual(assessWorkdayBreak({breakStart:'00:00',breakFinish:'24:00'}),{status:'set',startMinute:0,finishMinute:1440,error:''});
  assert.equal(assessWorkdayBreak({breakStart:'23:59',breakFinish:'24:00'}).status,'set');
});

test('partial, malformed, reversed and oversized break inputs reject',()=>{
  for(const input of [
    {breakStart:'12:00'},{breakFinish:'12:30'},{breakStart:'12:00',breakFinish:''},
    {breakStart:'12:00',breakFinish:'12:00'},{breakStart:'23:00',breakFinish:'01:00'},
    {breakStart:'24:00',breakFinish:'24:00'},{breakStart:'12:60',breakFinish:'13:00'},
    {breakStart:'noon',breakFinish:'13:00'},{breakStart:null,breakFinish:'13:00'},
    {breakStart:720,breakFinish:'13:00'},{breakStart:' '.repeat(33),breakFinish:'13:00'}
  ]){
    assert.equal(assessWorkdayBreak(input as WorkdayTimingInput).status,'invalid');
    assert.throws(()=>normalizeWorkloadLimits({...limits,...input} as SavedQueueWorkloadLimits));
  }
});

test('break must fit a valid remaining window and can be cleared after that window moves',()=>{
  assert.equal(assessWorkdayBreak({...window,breakStart:'08:00',breakFinish:'17:00'}).status,'set');
  for(const input of [
    {...pause,workdayStart:'08:00'},
    {...pause,workdayStart:'13:00',workdayFinish:'17:00'},
    {...window,breakStart:'07:59',breakFinish:'08:30'},
    {...window,breakStart:'16:30',breakFinish:'17:01'}
  ])assert.equal(assessWorkdayBreak(input).status,'invalid');
  assert.deepEqual(normalizeWorkloadLimits({...settings,workdayStart:'13:00',breakStart:'',breakFinish:''}),{...limits,workdayStart:'13:00',workdayFinish:'17:00'});
});

test('flexible service crossing the break waits until it can run uninterrupted',()=>{
  const rows=[visit('long',{preferredStartMinute:705,estimatedMinutes:30,preferredFinishMinute:750})];
  const before=JSON.stringify(rows);
  assert.equal(assessSavedQueueAppointments(rows,window).status,'no_conflicts_detected');
  const result=assessSavedQueueAppointments(rows,settings);
  assert.equal(result.issues[0].kind,'finish_window_conflict');
  assert.match(result.issues[0].message,/30 min over/);
  assert.match(result.issues[0].message,/without travel or any other breaks/);
  assert.equal(JSON.stringify(rows),before);
});

test('a service may end at break start and the next start at break finish',()=>{
  const result=assessSavedQueueAppointments([
    visit('before',{fixedStartMinute:690}),visit('after',{fixedStartMinute:750})
  ],settings);
  assert.equal(result.status,'no_conflicts_detected');
  assert.deepEqual(result.issues,[]);
});

test('fixed starts inside the break or services spanning its start warn explicitly',()=>{
  for(const fixedStartMinute of [691,720,749]){
    const result=assessSavedQueueAppointments([visit('fixed',{fixedStartMinute})],settings);
    assert.equal(result.status,'conflicts');
    assert.deepEqual(result.issues.map(issue=>issue.kind),['fixed_break_conflict']);
    assert.match(result.issues[0].message,/12:00–12:30 break/);
    assert.match(result.issues[0].message,/without interruption/);
  }
});

test('waiting until after the break does not count the break a second time',()=>{
  const result=assessSavedQueueAppointments([
    visit('wait',{preferredStartMinute:780}),visit('next',{fixedStartMinute:810})
  ],settings);
  assert.equal(result.status,'no_conflicts_detected');
});

test('break-delayed service propagates to later fixed appointments without moving backward',()=>{
  const result=assessSavedQueueAppointments([
    visit('first',{preferredStartMinute:705}),visit('second',{fixedStartMinute:765}),visit('third',{fixedStartMinute:810})
  ],settings);
  assert.equal(result.issues.length,1);
  assert.equal(result.issues[0].visitId,'second');
  assert.equal(result.issues[0].kind,'fixed_start_conflict');
  assert.match(result.issues[0].message,/15 min short/);
});

test('a planned break consumes the work window while leaving the service budget separate',()=>{
  const rows=[visit('a',{estimatedMinutes:60})];
  const input={...limits,workdayStart:'11:30',workdayFinish:'13:00',...pause};
  const result=review(rows,input);
  assert.equal(result.workload?.estimatedServiceMinutes,60);
  assert.equal(result.workload?.availableMinutes,480);
  assert.equal(result.workload?.status,'within_limits');
  assert.equal(result.appointments.issues[0].kind,'workday_finish_conflict');
  assert.match(result.appointments.issues[0].message,/30 min over/);
  assert.equal(canApproveSavedQueueReview(result),true);
  assert.equal(savedQueueApprovalAction(result),'Approve with appointment warnings');
});

test('updated service estimates can expose a break overlap without editing the appointment',()=>{
  const row=visit('learned',{fixedStartMinute:660,estimatedMinutes:60});
  assert.equal(review([row]).appointments.status,'no_conflicts_detected');
  assert.equal(review([{...row,estimatedMinutes:61}]).appointments.issues[0].kind,'fixed_break_conflict');
});

test('midnight and 24:00 breaks preserve half-open interval boundaries',()=>{
  assert.equal(assessSavedQueueAppointments([visit('start',{fixedStartMinute:30})],{breakStart:'00:00',breakFinish:'00:30'}).status,'no_conflicts_detected');
  const wholeDay=assessSavedQueueAppointments([visit('a',{estimatedMinutes:1})],{breakStart:'00:00',breakFinish:'24:00'});
  assert.equal(wholeDay.issues[0].kind,'day_boundary_conflict');
  assert.match(wholeDay.issues[0].message,/at least 1 min/);
  const end=assessSavedQueueAppointments([visit('a',{fixedStartMinute:1438,estimatedMinutes:1})],{breakStart:'23:59',breakFinish:'24:00'});
  assert.equal(end.status,'no_conflicts_detected');
});

test('copy names only the configured break and states the remaining timing assumptions',()=>{
  const result=assessSavedQueueAppointments([visit('a')],settings);
  const copy=describeAppointmentCheckAssumptions(result);
  assert.match(copy,/planned 08:00–17:00 work window/);
  assert.match(copy,/planned 12:00–12:30 break is reserved/);
  assert.match(copy,/services are not split/);
  assert.match(copy,/Travel and any other breaks are excluded/);
  assert.match(copy,/device clock is not used/);
  assert.match(copy,/not arrival times/);
  const noWindow=describeAppointmentCheckAssumptions(assessSavedQueueAppointments([visit('a')],pause));
  assert.match(noWindow,/best-case start at 00:00/);
  assert.match(noWindow,/actual workday start is not set/);
  assert.equal(assessSavedQueueAppointments([visit('a')],pause).status,'no_conflicts_detected');
});

test('invalid break blocks approval and preserves previously approved bytes',async()=>{
  const f=fixture(),approvals=createLocalSavedQueueApprovalStore(f.storage,digest);
  await approvals.approve(context.subject,review([visit('a')]));
  const before=[...f.records];
  const invalid=review([visit('a')],{...settings,breakFinish:''});
  assert.equal(invalid.appointments.status,'invalid_break');
  assert.deepEqual(invalid.appointments.issues,[]);
  assert.match(describeSavedQueueAppointments(invalid.appointments),/both a break/);
  assert.match(describeAppointmentCheckAssumptions(invalid.appointments),/Correct the planned break/);
  assert.equal(canApproveSavedQueueReview(invalid),false);
  assert.equal(await approvals.isApproved(context.subject,invalid),false);
  await assert.rejects(()=>approvals.approve(context.subject,invalid),/valid planned break/);
  assert.deepEqual([...f.records],before);
});

test('break check agrees with exhaustive schedules across 400 bounded synthetic cases',()=>{
  let seed=63,fitCount=0,conflictCount=0;
  const next=(max:number)=>{seed=(seed*1664525+1013904223)>>>0;return Math.floor(seed/4294967296*max);};
  function fits(rows:QueueReviewVisit[],finish:number,breakStart:number,breakFinish:number,index:number,free:number):boolean{
    if(index===rows.length)return true;
    const row=rows[index],latest=Math.min(finish,row.preferredFinishMinute??1440)-row.estimatedMinutes;
    for(let start=Math.max(free,row.preferredStartMinute??0);start<=latest;start++){
      if(row.fixedStartMinute!==undefined&&row.fixedStartMinute!==start)continue;
      // Enumerate every occupied minute, independent of the production interval test.
      const occupied=Array.from({length:row.estimatedMinutes},(_,offset)=>start+offset);
      if(occupied.some(minute=>minute>=breakStart&&minute<breakFinish))continue;
      if(fits(rows,finish,breakStart,breakFinish,index+1,start+row.estimatedMinutes))return true;
    }
    return false;
  }
  for(let example=0;example<400;example++){
    const start=next(4),finish=start+5+next(12),breakStart=start+next(finish-start),breakFinish=breakStart+1+next(finish-breakStart);
    const rows=Array.from({length:2},(_,index)=>visit(String(index),{
      estimatedMinutes:1+next(4),preferredStartMinute:next(9),preferredFinishMinute:1+next(20),
      ...(next(3)===0?{fixedStartMinute:next(16)}:{})
    }));
    const feasible=fits(rows,finish,breakStart,breakFinish,0,start);
    if(feasible)fitCount++;else conflictCount++;
    const result=assessSavedQueueAppointments(rows,{
      workdayStart:formatServiceClock(start),workdayFinish:formatServiceClock(finish),
      breakStart:formatServiceClock(breakStart),breakFinish:formatServiceClock(breakFinish)
    });
    assert.equal(result.status==='conflicts',!feasible,JSON.stringify({rows,start,finish,breakStart,breakFinish,result}));
  }
  assert.ok(fitCount>0&&conflictCount>0);
});

test('either break clock and clearing a break require fresh approval but equivalent formatting does not',async()=>{
  const f=fixture(),approvals=createLocalSavedQueueApprovalStore(f.storage,digest),rows=[visit('a')];
  const original=review(rows);
  await approvals.approve(context.subject,original);
  assert.equal(await approvals.isApproved(context.subject,review(rows,{...settings,breakStart:' 12:00 ',breakFinish:'12:30'})),true);
  for(const change of [{breakStart:'12:05'},{breakFinish:'12:45'},{breakStart:'',breakFinish:''}]){
    const changed=review(rows,{...settings,...change});
    assert.notEqual(changed.approvalKey,original.approvalKey);
    assert.equal(await approvals.isApproved(context.subject,changed),false);
  }
  const noBreak=review(rows,{...limits,...window}),oldParts=JSON.parse(noBreak.approvalKey);
  oldParts[0]='saved-queue-appointments-v2';oldParts.pop();
  await approvals.approve(context.subject,{...noBreak,approvalKey:JSON.stringify(oldParts)});
  assert.equal(await approvals.isApproved(context.subject,noBreak),false);
});

test('version-three settings round trip breaks under hashed isolated operator/business/day scopes',async()=>{
  const f=fixture();
  await f.store.save(context,{...settings,breakStart:' 12:00 '});
  assert.deepEqual(await createLocalSavedQueueWorkloadStore(f.storage,digest).load(context),settings);
  for(const other of [{...context,subject:'operator-b'},{...context,businessId:'business-b'},{...context,date:'2026-10-14'}]){
    assert.equal(await f.store.load(other),null);
    await f.store.save(other,{...settings,breakStart:'13:00',breakFinish:'13:30'});
    assert.deepEqual(await f.store.load(context),settings);
  }
  for(const raw of f.records.values()){
    assert.equal(JSON.parse(raw).version,3);
    assert.ok(raw.length<=512);
    for(const identity of [context.subject,context.businessId,context.date])assert.equal(raw.includes(identity),false);
  }
});

test('version-one and version-two settings restore without inventing a break or writing on read',async()=>{
  const f=fixture();await f.store.save(context,limits);
  const [key,value]=[...f.records][0],identity=JSON.parse(value).contextDigest;
  for(const [version,expected] of [[1,limits],[2,{...limits,...window}]] as const){
    const raw=JSON.stringify({version,contextDigest:identity,...expected});
    f.records.set(key,raw);const writes=f.writes();
    assert.deepEqual(await f.store.load(context),expected);
    assert.equal(f.records.get(key),raw);assert.equal(f.writes(),writes);
  }
  await f.store.save(context,settings);
  assert.equal(JSON.parse(f.records.get(key)!).version,3);
});

test('corrupt break records and legacy versions with break fields fail without replacing bytes',async()=>{
  const f=fixture();await f.store.save(context,settings);
  const [key,value]=[...f.records][0],record=JSON.parse(value);
  for(const invalid of [
    {...record,breakFinish:undefined},{...record,breakStart:null},{...record,breakFinish:750},
    {...record,breakFinish:'11:59'},{...record,breakFinish:'17:01'},
    {...record,version:2},{...record,version:1},
    {version:1,contextDigest:record.contextDigest,...limits,breakStart:'',breakFinish:''}
  ]){
    const raw=JSON.stringify(invalid);f.records.set(key,raw);
    await assert.rejects(()=>f.store.load(context),/could not be read/);
    assert.equal(f.records.get(key),raw);
  }
});

test('break-only edits stay unsaved until explicit save, survive restart and can be cleared',async()=>{
  const f=fixture();await f.store.save(context,settings);await f.controller.activate(context);
  for(const field of ['breakStart','breakFinish'] as const){
    f.controller.edit(field,field==='breakStart'?'12:05':'12:45');
    assert.equal(workloadSettingsHaveUnsavedChanges(f.controller.getState()),true);
    assert.equal(workloadSettingsReadyForApproval(f.controller.getState()),false);
    assert.equal(await f.controller.save(),true);
  }
  const restored=createSavedQueueWorkloadSettings(f.store);await restored.activate(context);
  assert.deepEqual(restored.getState().draft,{...settings,breakStart:'12:05',breakFinish:'12:45'});
  restored.edit('breakStart','');restored.edit('breakFinish','');
  assert.equal(await restored.save(),true);
  assert.deepEqual(await f.store.load(context),{...limits,...window});
});

test('invalid break edits preserve saved settings and cannot become approval-ready',async()=>{
  const f=fixture();await f.store.save(context,settings);await f.controller.activate(context);
  const writes=f.writes();f.controller.edit('breakFinish','');
  assert.equal(await f.controller.save(),false);
  assert.equal(workloadSettingsReadyForApproval(f.controller.getState()),false);
  assert.equal(f.writes(),writes);assert.deepEqual(await f.store.load(context),settings);
  assert.match(f.controller.getState().error,/both a break/);
});

test('pending break saves capture inputs, reject edits and repeated taps, and ignore late scopes',async()=>{
  const f=fixture(),input={...settings};
  const writing=f.store.save(context,input);input.breakStart='13:00';input.breakFinish='14:00';
  await writing;assert.deepEqual(await f.store.load(context),settings);
  const pending=deferred<SavedQueueWorkloadLimits>();let writes=0;
  const controller=createSavedQueueWorkloadSettings({
    async load(){return settings;},async save(){writes++;return pending.promise;}
  });
  await controller.activate(context);controller.edit('breakFinish','12:45');
  const saving=controller.save();
  assert.equal(controller.edit('breakStart','13:00'),false);
  assert.equal(await controller.save(),false);
  const other={...context,date:'2026-10-14'};await controller.activate(other);
  pending.resolve({...settings,breakFinish:'12:45'});
  assert.equal(await saving,false);assert.equal(writes,1);
  assert.equal(controller.getState().scopeKey,workloadSettingsScope(other));
  assert.deepEqual(controller.getState().draft,settings);
});

test('uncertain break writes require readback and late restoration cannot cross scopes',async()=>{
  const f=fixture();await f.store.save(context,settings);
  const uncertain:WorkloadSettingsStore={
    load:f.store.load,async save(scope,value){await f.store.save(scope,value);throw Error('ack lost');}
  };
  const controller=createSavedQueueWorkloadSettings(uncertain);
  await controller.activate(context);controller.edit('breakFinish','12:45');
  assert.equal(await controller.save(),false);
  assert.equal(workloadSettingsReadyForApproval(controller.getState()),false);
  const writes=f.writes();await controller.retry();
  assert.equal(f.writes(),writes);assert.equal(controller.getState().saved?.breakFinish,'12:45');
  const pending=deferred<SavedQueueWorkloadLimits|null>(),other={...context,date:'2026-10-14'};
  const delayed=createSavedQueueWorkloadSettings({
    async load(scope){return scope.date===context.date?pending.promise:{...limits,...window};},save:f.store.save
  });
  const loading=delayed.activate(context);await delayed.activate(other);
  pending.resolve(settings);await loading;
  assert.equal(delayed.getState().scopeKey,workloadSettingsScope(other));
  assert.deepEqual(delayed.getState().draft,{...limits,...window});
});
