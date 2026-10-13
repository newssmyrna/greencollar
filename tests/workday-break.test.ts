import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessWorkdayBreak,normalizeWorkdayBreak,type WorkdayTimingInput,type WorkdayBreakInterval} from '../src/domain/workday-break';
import {formatServiceClock} from '../src/domain/service-time';
import {assessSavedQueueAppointments,describeSavedQueueAppointments,describeAppointmentCheckAssumptions} from '../src/domain/saved-queue-appointments';
import {createSavedQueueReview,canApproveSavedQueueReview,type QueueReviewVisit} from '../src/domain/saved-queue-review';
import {createLocalSavedQueueWorkloadStore,normalizeWorkloadLimits,workloadSettingsScope,type WorkloadSettingsStore} from '../src/data/local-saved-queue-workload';
import {createSavedQueueWorkloadSettings,workloadSettingsHaveUnsavedChanges,workloadSettingsReadyForApproval} from '../src/data/saved-queue-workload-settings';
import {createLocalSavedQueueApprovalStore} from '../src/data/local-saved-queue-approval';
import type {SavedQueueWorkloadLimits} from '../src/domain/saved-queue-workload';

const context={subject:'operator-a',businessId:'business-a',date:'2026-10-13'};
const limits={hours:'8',maxJobs:'6'};
const window={workdayStart:'08:00',workdayFinish:'17:00'};
const breaks={breaks:'12:00-12:30\n10:00-10:15'};
const normalizedBreaks={breaks:'10:00-10:15\n12:00-12:30'};
const settings={...limits,...window,...normalizedBreaks};
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
const intervals:WorkdayBreakInterval[]=[
  {startMinute:600,finishMinute:615},{startMinute:720,finishMinute:750}
];

test('multiple intervals canonicalize in clock order and preserve blank input',()=>{
  assert.deepEqual(normalizeWorkdayBreak({}),{});
  assert.deepEqual(normalizeWorkdayBreak({breaks:' \n  \n'}),{});
  assert.deepEqual(normalizeWorkdayBreak({breaks:' 12:00 - 12:30 \n10:00-10:15'}),normalizedBreaks);
  assert.deepEqual(normalizeWorkloadLimits({...limits,...breaks}),{...limits,...normalizedBreaks});
  const result=assessWorkdayBreak({...window,...breaks});
  assert.equal(result.status,'set');
  if(result.status==='set')assert.deepEqual(result.intervals,intervals);
});

test('break parser rejects malformed, partial, reversed and oversized schedules',()=>{
  for(const breaks of [
    '12:00','12:00-','-12:30','12:00-13:00-extra','12:00 - 12:00',
    '23:00-01:00','24:00-24:00','12:60-13:00','noon-13:00',
    '12:00-13:00\nnoon-14:00','12:00-13:00\n'.repeat(9),
    '12:00-13:00'.repeat(14)
  ]){
    assert.equal(assessWorkdayBreak({breaks}).status,'invalid',breaks);
    assert.throws(()=>normalizeWorkloadLimits({...limits,breaks}));
  }
});

test('overlapping breaks reject while touching boundaries remain valid',()=>{
  for(const breaks of [
    '10:00-10:30\n10:15-10:45',
    '10:00-11:00\n10:30-10:45',
    '12:00-13:00\n12:00-12:30'
  ])assert.match(assessWorkdayBreak({breaks}).error,/cannot overlap/);
  assert.equal(assessWorkdayBreak({breaks:'10:00-10:30\n10:30-10:45'}).status,'set');
});

test('every interval must fit the saved work window and may span its endpoints exactly',()=>{
  assert.equal(assessWorkdayBreak({...window,breaks:'08:00-08:30\n16:30-17:00'}).status,'set');
  assert.equal(assessWorkdayBreak({...window,breaks:'07:59-08:15'}).status,'invalid');
  assert.equal(assessWorkdayBreak({...window,breaks:'16:30-17:01'}).status,'invalid');
  assert.equal(assessWorkdayBreak({workdayStart:'08:00',breaks:'12:00-12:15'}).status,'invalid');
});

test('a long flexible service moves beyond every break it would overlap',()=>{
  const input={...limits,...window,breaks:'12:00-12:15\n13:00-13:30'};
  const result=assessSavedQueueAppointments([visit('long',{
    preferredStartMinute:705,preferredFinishMinute:840,estimatedMinutes:46
  })],input);
  assert.equal(result.issues[0].kind,'finish_window_conflict');
  assert.match(result.issues[0].message,/14:00.*16 min over/);
  assert.match(result.issues[0].message,/without travel or any other breaks/);
});

test('services may touch a break end or start without overlapping it',()=>{
  const result=assessSavedQueueAppointments([
    visit('before',{fixedStartMinute:570}),
    visit('middle',{fixedStartMinute:615}),
    visit('after',{fixedStartMinute:750})
  ],{...window,...normalizedBreaks});
  assert.equal(result.status,'no_conflicts_detected');
  assert.deepEqual(result.issues,[]);
});

test('fixed appointments overlapping separate breaks identify the affected interval',()=>{
  for(const [fixedStartMinute,expected] of [[605,'10:00–10:15'],[730,'12:00–12:30']] as const){
    const result=assessSavedQueueAppointments([visit('fixed',{fixedStartMinute,estimatedMinutes:20})],{...window,...normalizedBreaks});
    assert.equal(result.issues[0].kind,'fixed_break_conflict');
    assert.match(result.issues[0].message,new RegExp(expected));
    assert.match(result.issues[0].message,/without interruption/);
  }
});

test('fixed service spanning two touching break intervals reports both',()=>{
  const result=assessSavedQueueAppointments([visit('fixed',{fixedStartMinute:610,estimatedMinutes:50})],{
    breaks:'10:00-10:15\n10:15-10:45'
  });
  assert.equal(result.issues[0].kind,'fixed_break_conflict');
  assert.match(result.issues[0].message,/10:00–10:15, 10:15–10:45/);
});

test('waiting that already spans a break is not counted twice',()=>{
  const result=assessSavedQueueAppointments([
    visit('wait',{preferredStartMinute:780}),
    visit('next',{fixedStartMinute:810})
  ],{...window,...normalizedBreaks});
  assert.equal(result.status,'no_conflicts_detected');
});

test('a delayed service carries its lower bound into the next fixed start',()=>{
  const result=assessSavedQueueAppointments([
    visit('first',{preferredStartMinute:705}),
    visit('second',{fixedStartMinute:765}),
    visit('third',{fixedStartMinute:810})
  ],{...window,...normalizedBreaks});
  assert.equal(result.issues[0].visitId,'second');
  assert.equal(result.issues[0].kind,'fixed_start_conflict');
  assert.match(result.issues[0].message,/15 min short/);
});

test('breaks affect appointment timing without reducing the service-hour budget',()=>{
  const result=review([visit('a',{estimatedMinutes:60})],{
    ...limits,workdayStart:'11:30',workdayFinish:'13:00',breaks:'12:00-12:30'
  });
  assert.equal(result.workload?.estimatedServiceMinutes,60);
  assert.equal(result.workload?.availableMinutes,480);
  assert.equal(result.workload?.status,'within_limits');
  assert.equal(result.appointments.issues[0].kind,'workday_finish_conflict');
  assert.equal(canApproveSavedQueueReview(result),true);
});

test('updated predicted durations can reveal any configured break overlap',()=>{
  const row=visit('learned',{fixedStartMinute:660,estimatedMinutes:59});
  assert.equal(review([row]).appointments.status,'no_conflicts_detected');
  assert.equal(review([{...row,estimatedMinutes:61}]).appointments.issues[0].kind,'fixed_break_conflict');
});

test('24:00 is allowed only as a finish and the break covers a half-open minute range',()=>{
  assert.equal(assessSavedQueueAppointments([visit('start',{fixedStartMinute:30})],{breaks:'00:00-00:30'}).status,'no_conflicts_detected');
  const whole=assessSavedQueueAppointments([visit('a',{estimatedMinutes:1})],{breaks:'00:00-24:00'});
  assert.equal(whole.issues[0].kind,'day_boundary_conflict');
  const end=assessSavedQueueAppointments([visit('a',{fixedStartMinute:1438,estimatedMinutes:1})],{breaks:'23:59-24:00'});
  assert.equal(end.status,'no_conflicts_detected');
});

test('review copy names all configured intervals and says other travel/breaks are excluded',()=>{
  const result=assessSavedQueueAppointments([visit('a')],{...window,...normalizedBreaks});
  const copy=describeAppointmentCheckAssumptions(result);
  assert.match(copy,/planned breaks 10:00–10:15, 12:00–12:30/);
  assert.match(copy,/services are not split around them/);
  assert.match(copy,/Travel and any other breaks are excluded/);
  assert.match(copy,/device clock is not used/);
  assert.equal(assessSavedQueueAppointments([visit('a')],normalizedBreaks).status,'no_conflicts_detected');
  assert.match(describeAppointmentCheckAssumptions(assessSavedQueueAppointments([visit('a')],normalizedBreaks)),/best-case start at 00:00/);
  assert.equal(describeSavedQueueAppointments(assessSavedQueueAppointments([visit('a')])).includes('No appointment times'),true);
});

test('invalid schedule blocks approval and preserves previously approved device bytes',async()=>{
  const f=fixture(),approvals=createLocalSavedQueueApprovalStore(f.storage,digest);
  const previous=review([visit('a')]);await approvals.approve(context.subject,previous);
  const before=[...f.records];
  const invalid=review([visit('a')],{...settings,breaks:'12:00-'});
  assert.equal(invalid.appointments.status,'invalid_break');
  assert.match(describeSavedQueueAppointments(invalid.appointments),/HH:MM-HH:MM/);
  assert.equal(canApproveSavedQueueReview(invalid),false);
  assert.equal(await approvals.isApproved(context.subject,invalid),false);
  await assert.rejects(()=>approvals.approve(context.subject,invalid),/planned break list/);
  assert.deepEqual([...f.records],before);
});

test('multi-break scheduler agrees with exhaustive schedules across 400 bounded cases',()=>{
  let seed=64,fitCount=0,conflictCount=0;
  const next=(max:number)=>{seed=(seed*1664525+1013904223)>>>0;return Math.floor(seed/4294967296*max);};
  function fits(rows:QueueReviewVisit[],finish:number,pauses:WorkdayBreakInterval[],index:number,free:number):boolean{
    if(index===rows.length)return true;
    const row=rows[index],latest=Math.min(finish,row.preferredFinishMinute??1440)-row.estimatedMinutes;
    for(let start=Math.max(free,row.preferredStartMinute??0);start<=latest;start++){
      if(row.fixedStartMinute!==undefined&&row.fixedStartMinute!==start)continue;
      const occupied=Array.from({length:row.estimatedMinutes},(_,offset)=>start+offset);
      if(occupied.some(minute=>pauses.some(pause=>minute>=pause.startMinute&&minute<pause.finishMinute)))continue;
      if(fits(rows,finish,pauses,index+1,start+row.estimatedMinutes))return true;
    }
    return false;
  }
  for(let example=0;example<400;example++){
    const start=next(4),finish=start+8+next(10);
    const firstStart=start+next(4),firstEnd=firstStart+1+next(2);
    const secondStart=firstEnd+next(finish-firstEnd);
    const pauses:WorkdayBreakInterval[]=[
      {startMinute:firstStart,finishMinute:firstEnd},
      {startMinute:secondStart,finishMinute:Math.min(finish,secondStart+1+next(finish-secondStart))}
    ];
    const rows=Array.from({length:2},(_,index)=>visit(String(index),{
      estimatedMinutes:1+next(4),preferredStartMinute:next(10),preferredFinishMinute:1+next(23),
      ...(next(3)===0?{fixedStartMinute:next(18)}:{})
    }));
    const feasible=fits(rows,finish,pauses,0,start);
    if(feasible)fitCount++;else conflictCount++;
    const result=assessSavedQueueAppointments(rows,{
      workdayStart:formatServiceClock(start),workdayFinish:formatServiceClock(finish),
      breaks:pauses.map(pause=>formatServiceClock(pause.startMinute)+'-'+formatServiceClock(pause.finishMinute)).join('\n')
    });
    assert.equal(result.status==='conflicts',!feasible,JSON.stringify({rows,start,finish,pauses,result}));
  }
  assert.ok(fitCount>0&&conflictCount>0);
});

test('approval binds every normalized break and legacy policy needs a new review',async()=>{
  const f=fixture(),approvals=createLocalSavedQueueApprovalStore(f.storage,digest),rows=[visit('a')];
  const original=review(rows);
  await approvals.approve(context.subject,original);
  const equivalent=review(rows,{...settings,breaks:' 12:00-12:30 \n10:00-10:15'});
  assert.equal(await approvals.isApproved(context.subject,equivalent),true);
  for(const breaks of ['10:00-10:15\n12:05-12:30','10:00-10:15','10:00-10:15\n12:00-12:30\n15:00-15:15','']){
    const changed=review(rows,{...limits,...window,breaks});
    assert.notEqual(changed.approvalKey,original.approvalKey);
    assert.equal(await approvals.isApproved(context.subject,changed),false);
  }
  const key=review(rows,{...limits,...window,...normalizedBreaks}).approvalKey;
  const legacy=JSON.parse(key);legacy[0]='saved-queue-appointments-v3';
  await approvals.approve(context.subject,{...review(rows,{...limits,...window,...normalizedBreaks}),approvalKey:JSON.stringify(legacy)});
  assert.equal(await approvals.isApproved(context.subject,review(rows,{...limits,...window,...normalizedBreaks})),false);
});

test('version-four settings round trip sorted intervals under hashed isolated scopes',async()=>{
  const f=fixture();await f.store.save(context,{...settings,...breaks});
  assert.deepEqual(await f.store.load(context),settings);
  for(const other of [{...context,subject:'operator-b'},{...context,businessId:'business-b'},{...context,date:'2026-10-14'}]){
    assert.equal(await f.store.load(other),null);
    await f.store.save(other,{...settings,breaks:'13:00-13:30'});
    assert.deepEqual(await f.store.load(context),settings);
  }
  for(const raw of f.records.values()){
    assert.equal(JSON.parse(raw).version,4);
    assert.ok(raw.length<=512);
    for(const identity of [context.subject,context.businessId,context.date])assert.equal(raw.includes(identity),false);
  }
});

test('versions one and two restore without inventing breaks or writing on read',async()=>{
  const f=fixture();await f.store.save(context,limits);
  const [key,value]=[...f.records][0],identity=JSON.parse(value).contextDigest;
  for(const [version,expected] of [[1,limits],[2,{...limits,...window}]] as const){
    const raw=JSON.stringify({version,contextDigest:identity,...expected});
    f.records.set(key,raw);const writes=f.writes();
    assert.deepEqual(await f.store.load(context),expected);
    assert.equal(f.records.get(key),raw);assert.equal(f.writes(),writes);
  }
});

test('version-three single breaks migrate to the list on read without changing stored bytes',async()=>{
  const f=fixture();await f.store.save(context,settings);
  const [key,value]=[...f.records][0],current=JSON.parse(value);
  const legacy={version:3,contextDigest:current.contextDigest,hours:settings.hours,maxJobs:settings.maxJobs,
    workdayStart:settings.workdayStart,workdayFinish:settings.workdayFinish,breakStart:'12:00',breakFinish:'12:30'};
  const raw=JSON.stringify(legacy);f.records.set(key,raw);const writes=f.writes();
  assert.deepEqual(await f.store.load(context),{...limits,...window,breaks:'12:00-12:30'});
  assert.equal(f.records.get(key),raw);assert.equal(f.writes(),writes);
  await f.store.save(context,settings);
  assert.equal(JSON.parse(f.records.get(key)!).version,4);
});

test('legacy version-three records without a break remain blank and partial legacy pairs fail safely',async()=>{
  const f=fixture();await f.store.save(context,settings);
  const [key,value]=[...f.records][0],current=JSON.parse(value);
  const legacy={version:3,contextDigest:current.contextDigest,...limits,...window};
  const raw=JSON.stringify(legacy);f.records.set(key,raw);
  assert.deepEqual(await f.store.load(context),{...limits,...window});
  for(const malformed of [
    {...legacy,breakStart:'12:00'},
    {...legacy,breakStart:'12:00',breakFinish:750},
    {...legacy,breakStart:'18:00',breakFinish:'18:30'},
    {...legacy,breakStart:'14:00',breakFinish:'13:00'},
    {...legacy,breakStart:'12:00',breakFinish:'12:30',breaks:'13:00-13:30'}
  ]){
    const bad=JSON.stringify(malformed);f.records.set(key,bad);
    await assert.rejects(()=>f.store.load(context),/could not be read/);
    assert.equal(f.records.get(key),bad);
  }
});

test('invalid version-four break lists and breaks on earlier formats fail without modifying bytes',async()=>{
  const f=fixture();await f.store.save(context,settings);
  const [key,value]=[...f.records][0],current=JSON.parse(value);
  for(const invalid of [
    {...current,breaks:'12:00-'},{...current,breaks:'12:00-13:00\n12:30-13:30'},
    {...current,breaks:'07:00-08:15'},{...current,breakStart:'12:00'},
    {...current,version:2,breaks:'12:00-12:30'},{...current,version:1,breaks:'12:00-12:30'}
  ]){
    const raw=JSON.stringify(invalid);f.records.set(key,raw);
    await assert.rejects(()=>f.store.load(context),/could not be read/);
    assert.equal(f.records.get(key),raw);
  }
});

test('any break-list edit stays unsaved until explicitly persisted and can be cleared',async()=>{
  const f=fixture();await f.store.save(context,settings);await f.controller.activate(context);
  for(const breaks of ['09:00-09:15\n12:00-12:30','09:00-09:15\n12:00-12:35']){
    f.controller.edit('breaks',breaks);
    assert.equal(workloadSettingsHaveUnsavedChanges(f.controller.getState()),true);
    assert.equal(workloadSettingsReadyForApproval(f.controller.getState()),false);
    assert.equal(await f.controller.save(),true);
  }
  const restored=createSavedQueueWorkloadSettings(f.store);await restored.activate(context);
  assert.deepEqual(restored.getState().draft,{...settings,breaks:'09:00-09:15\n12:00-12:35'});
  restored.edit('breaks','');assert.equal(await restored.save(),true);
  assert.deepEqual(await f.store.load(context),{...limits,...window});
});

test('invalid interval edit leaves saved bytes unchanged and blocks approval readiness',async()=>{
  const f=fixture();await f.store.save(context,settings);await f.controller.activate(context);
  const writes=f.writes();f.controller.edit('breaks','12:00-');
  assert.equal(await f.controller.save(),false);
  assert.equal(workloadSettingsReadyForApproval(f.controller.getState()),false);
  assert.equal(f.writes(),writes);assert.deepEqual(await f.store.load(context),settings);
  assert.match(f.controller.getState().error,/start and finish/);
});

test('pending interval writes capture text, reject duplicate taps and ignore a changed scope',async()=>{
  const f=fixture(),input={...settings};
  const writing=f.store.save(context,input);input.breaks='14:00-14:30';
  await writing;assert.deepEqual(await f.store.load(context),settings);
  const pending=deferred<SavedQueueWorkloadLimits>();let writes=0;
  const controller=createSavedQueueWorkloadSettings({
    async load(){return settings;},async save(){writes++;return pending.promise;}
  });
  await controller.activate(context);controller.edit('breaks','09:00-09:15\n12:00-12:45');
  const saving=controller.save();
  assert.equal(controller.edit('breaks','13:00-13:30'),false);
  assert.equal(await controller.save(),false);
  const next={...context,date:'2026-10-14'};await controller.activate(next);
  pending.resolve({...settings,breaks:'09:00-09:15\n12:00-12:45'});
  assert.equal(await saving,false);assert.equal(writes,1);
  assert.equal(controller.getState().scopeKey,workloadSettingsScope(next));
});

test('an uncertain interval write is read back once without a retry write',async()=>{
  const f=fixture();await f.store.save(context,settings);
  const uncertain:WorkloadSettingsStore={
    load:f.store.load,async save(scope,value){await f.store.save(scope,value);throw Error('ack lost');}
  };
  const controller=createSavedQueueWorkloadSettings(uncertain);
  await controller.activate(context);controller.edit('breaks','09:00-09:15\n12:00-12:45');
  assert.equal(await controller.save(),false);
  const writes=f.writes();await controller.retry();
  assert.equal(f.writes(),writes);
  assert.deepEqual(controller.getState().saved,{...settings,breaks:'09:00-09:15\n12:00-12:45'});
  assert.equal(workloadSettingsReadyForApproval(controller.getState()),true);
});

test('late restoration results cannot enter another work-date scope',async()=>{
  const pending=deferred<SavedQueueWorkloadLimits|null>(),next={...context,date:'2026-10-14'};
  const controller=createSavedQueueWorkloadSettings({
    async load(scope){return scope.date===context.date?pending.promise:{...limits,...window};},
    async save(scope,value){return value;}
  });
  const first=controller.activate(context);await controller.activate(next);pending.resolve(settings);await first;
  assert.equal(controller.getState().scopeKey,workloadSettingsScope(next));
  assert.deepEqual(controller.getState().draft,{...limits,...window});
});
