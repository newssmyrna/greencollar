import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessSavedQueueAppointments,describeSavedQueueAppointments,APPOINTMENT_CHECK_ASSUMPTIONS,type AppointmentVisit} from '../src/domain/saved-queue-appointments';
import {createSavedQueueReview,canApproveSavedQueueReview,isSavedQueueApproved,savedQueueApprovalAction,type QueueReviewVisit} from '../src/domain/saved-queue-review';
import {createLocalSavedQueueApprovalStore} from '../src/data/local-saved-queue-approval';
import {summarizeSavedDay} from '../src/data/saved-day';
import {orderSavedQueue} from '../src/domain/saved-queue-order';
import type {DayData} from '../src/data/greencollar-api';

const visit=(id:string,extra:Partial<QueueReviewVisit>={}):QueueReviewVisit=>({
  id,customer:'Synthetic '+id,service:'Synthetic service',rateCents:5000,estimatedMinutes:30,...extra
});
const limits={hours:'8',maxJobs:'10'};
const review=(visits:QueueReviewVisit[])=>createSavedQueueReview('business-a','2026-10-13',visits,limits);
const digest=async(value:string)=>createHash('sha256').update(value).digest('hex');
function memoryStore(){
  const records=new Map<string,string>();
  const storage={async getItemAsync(key:string){return records.get(key)??null;},async setItemAsync(key:string,value:string){records.set(key,value);}};
  return {records,storage,store:createLocalSavedQueueApprovalStore(storage,digest)};
}

test('empty and flexible queues are explicit without claiming road feasibility',()=>{
  const empty=assessSavedQueueAppointments([]);
  assert.equal(empty.status,'no_constraints');
  assert.equal(describeSavedQueueAppointments(empty),'No remaining visits to check.');
  const flexible=assessSavedQueueAppointments([visit('a'),visit('b')]);
  assert.equal(flexible.status,'no_constraints');
  assert.equal(flexible.constrainedVisitCount,0);
  assert.deepEqual(flexible.issues,[]);
  assert.match(describeSavedQueueAppointments(flexible),/No appointment times/);
  assert.match(APPOINTMENT_CHECK_ASSUMPTIONS,/one shared local clock/);
  assert.match(APPOINTMENT_CHECK_ASSUMPTIONS,/00:00/);
  assert.match(APPOINTMENT_CHECK_ASSUMPTIONS,/actual workday start are excluded/);
});

test('touching appointment boundaries, midnight and latest finish 24:00 fit exactly',()=>{
  const result=assessSavedQueueAppointments([
    visit('a',{fixedStartMinute:0,preferredStartMinute:0,preferredFinishMinute:30}),
    visit('b',{fixedStartMinute:30,preferredFinishMinute:60}),
    visit('c',{fixedStartMinute:1410,preferredFinishMinute:1440})
  ]);
  assert.equal(result.status,'no_conflicts_detected');
  assert.equal(result.constrainedVisitCount,3);
  assert.deepEqual(result.issues,[]);
  assert.match(describeSavedQueueAppointments(result),/does not establish an achievable schedule/);
});

test('overlapping fixed appointments identify the affected visit and minimum shortfall',()=>{
  const result=assessSavedQueueAppointments([
    visit('a',{fixedStartMinute:540,estimatedMinutes:60}),
    visit('b',{fixedStartMinute:570})
  ]);
  assert.equal(result.status,'conflicts');
  assert.deepEqual(result.issues.map(i=>[i.visitId,i.kind]),[['b','fixed_start_conflict']]);
  assert.match(result.issues[0].message,/09:30.*30 min short/);
});

test('manual order can cause or resolve a fixed-time conflict without moving appointments',()=>{
  const rows=[visit('late',{fixedStartMinute:600}),visit('early',{fixedStartMinute:540})];
  const before=JSON.stringify(rows);
  const original=review(rows);
  assert.equal(original.appointments.status,'conflicts');
  const reordered=orderSavedQueue(rows,'scope',{scopeKey:'scope',visitIds:['early','late']});
  const current=review(reordered);
  assert.equal(current.appointments.status,'no_conflicts_detected');
  assert.equal(isSavedQueueApproved(current,original.approvalKey),false);
  assert.equal(JSON.stringify(rows),before);
  assert.deepEqual(reordered.map(v=>v.fixedStartMinute),[540,600]);
});

test('a current service estimate longer than its window remains a visible conflict',()=>{
  const result=assessSavedQueueAppointments([visit('a',{
    estimatedMinutes:45,preferredStartMinute:600,preferredFinishMinute:630
  })]);
  assert.equal(result.status,'conflicts');
  assert.equal(result.issues[0].kind,'finish_window_conflict');
  assert.match(result.issues[0].message,/45-minute.*10:30.*15 min over/);
});

test('earliest-start waiting propagates to later fixed visits',()=>{
  const result=assessSavedQueueAppointments([
    visit('a',{preferredStartMinute:600,estimatedMinutes:60}),visit('b',{fixedStartMinute:630})
  ]);
  assert.equal(result.issues[0].visitId,'b');
  assert.equal(result.issues[0].kind,'fixed_start_conflict');
  assert.match(result.issues[0].message,/30 min short/);
});

test('latest-finish-only windows account for earlier flexible service and respond to reordering',()=>{
  const a=visit('a',{estimatedMinutes:45}),b=visit('b',{preferredFinishMinute:60});
  assert.equal(assessSavedQueueAppointments([a,b]).status,'conflicts');
  assert.equal(assessSavedQueueAppointments([b,a]).status,'no_conflicts_detected');
});

test('the local calendar-day limit includes flexible services and never wraps past midnight',()=>{
  const allDay=visit('a',{estimatedMinutes:1440});
  assert.equal(assessSavedQueueAppointments([allDay]).status,'no_constraints');
  const result=assessSavedQueueAppointments([allDay,visit('b',{estimatedMinutes:1})]);
  assert.equal(result.status,'conflicts');
  assert.equal(result.issues[0].kind,'day_boundary_conflict');
  assert.match(result.issues[0].message,/at least 1 min/);
});

test('malformed minute data, invalid estimates and duplicate identities fail closed',()=>{
  for(const extra of [
    {fixedStartMinute:null},{fixedStartMinute:'600'},{fixedStartMinute:1440},
    {preferredStartMinute:NaN},{preferredStartMinute:1.5},{preferredFinishMinute:0},
    {preferredFinishMinute:1441},{estimatedMinutes:0},{estimatedMinutes:1441},
    {estimatedMinutes:Infinity},{id:' '}
  ]){
    const invalid={...visit('a'),...extra} as unknown as AppointmentVisit;
    const result=assessSavedQueueAppointments([invalid]);
    assert.equal(result.status,'invalid_visits');
    assert.equal(result.issues[0].kind,'invalid_data');
  }
  assert.equal(assessSavedQueueAppointments([visit('a'),visit('a')]).status,'invalid_visits');
});

test('invalid data stops the timing assessment instead of presenting partial conflict clearance',()=>{
  const result=assessSavedQueueAppointments([
    visit('a',{fixedStartMinute:600}),visit('b',{fixedStartMinute:610}),
    {...visit('bad'),preferredFinishMinute:null} as unknown as AppointmentVisit
  ]);
  assert.equal(result.status,'invalid_visits');
  assert.deepEqual(result.issues.map(i=>i.kind),['invalid_data']);
  assert.match(describeSavedQueueAppointments(result),/checks stopped/);
});

test('bounded timing check agrees with exhaustive same-order schedules across 200 synthetic cases',()=>{
  let seed=61;
  const next=(max:number)=>{seed=(seed*1664525+1013904223)>>>0;return seed%max;};
  function fits(rows:AppointmentVisit[],index=0,free=0):boolean{
    if(index===rows.length)return true;
    const row=rows[index],earliest=Math.max(free,row.preferredStartMinute??0);
    const latestStart=(row.preferredFinishMinute??12)-row.estimatedMinutes;
    for(let start=earliest;start<=latestStart;start++){
      if(row.fixedStartMinute!==undefined&&start!==row.fixedStartMinute)continue;
      if(fits(rows,index+1,start+row.estimatedMinutes))return true;
    }
    return false;
  }
  let feasibleCases=0,conflictingCases=0;
  for(let example=0;example<200;example++){
    const rows=Array.from({length:3},(_,index)=>visit(String(index),{
      estimatedMinutes:1+next(4),preferredStartMinute:next(9),preferredFinishMinute:1+next(12),
      ...(next(3)===0?{fixedStartMinute:next(11)}:{})
    }));
    const feasible=fits(rows);
    if(feasible)feasibleCases++;else conflictingCases++;
    const frozen=Object.freeze(rows.map(row=>Object.freeze({...row})));
    const result=assessSavedQueueAppointments(frozen);
    assert.equal(result.status==='conflicts',!feasible,'case '+example);
    assert.deepEqual(frozen,rows);
  }
  assert.ok(feasibleCases>0&&conflictingCases>0,'oracle exercises both feasible and conflicting orders');
});

test('approval button names make appointment and workload warnings explicit',()=>{
  const clear=review([visit('a',{fixedStartMinute:600})]);
  const appointment=review([visit('a',{fixedStartMinute:1430})]);
  const workload=createSavedQueueReview('business-a','2026-10-13',[visit('a')],{hours:'0.25',maxJobs:''});
  const both=createSavedQueueReview('business-a','2026-10-13',[visit('a',{fixedStartMinute:1430})],{hours:'0.25',maxJobs:''});
  assert.equal(savedQueueApprovalAction(clear),'Approve work queue');
  assert.equal(savedQueueApprovalAction(appointment),'Approve with appointment warnings');
  assert.equal(savedQueueApprovalAction(workload),'Approve with workload warnings');
  assert.equal(savedQueueApprovalAction(both),'Approve with warnings');
  assert.equal(canApproveSavedQueueReview(appointment),true);
  assert.equal(isSavedQueueApproved(appointment,null),false);
});

test('predicted duration and changed appointment times both require a fresh warning review',()=>{
  const original=review([visit('a',{fixedStartMinute:600,preferredFinishMinute:660})]);
  const longer=review([visit('a',{estimatedMinutes:83,fixedStartMinute:600,preferredFinishMinute:660})]);
  assert.equal(longer.appointments.status,'conflicts');
  assert.equal(isSavedQueueApproved(longer,original.approvalKey),false);
  const changed=review([visit('a',{fixedStartMinute:590,preferredFinishMinute:660})]);
  assert.equal(isSavedQueueApproved(changed,original.approvalKey),false);
});

test('invalid appointment data blocks matching and durable approval without replacing the previous record',async()=>{
  const {records,store}=memoryStore();
  await store.approve('operator-a',review([visit('a')]));
  const previous=[...records];
  const invalid=review([{...visit('a'),fixedStartMinute:null} as unknown as QueueReviewVisit]);
  assert.equal(canApproveSavedQueueReview(invalid),false);
  assert.equal(isSavedQueueApproved(invalid,invalid.approvalKey),false);
  assert.equal(await store.isApproved('operator-a',invalid),false);
  await assert.rejects(()=>store.approve('operator-a',invalid),/invalid appointment/);
  assert.deepEqual([...records],previous);
});

test('previous approval policy requires a fresh review even when saved visit values match',async()=>{
  for(const useLimits of [true,false]){
    const {store}=memoryStore();
    const rows=[visit('a',{fixedStartMinute:600})];
    const current=createSavedQueueReview('business-a','2026-10-13',rows,useLimits?limits:undefined);
    const snapshot=['business-a','2026-10-13',rows.map(v=>[v.id,v.rateCents,v.estimatedMinutes,v.preferredStartMinute??null,v.preferredFinishMinute??null,v.fixedStartMinute??null])];
    const oldKey=JSON.stringify(useLimits?['saved-queue-workload-v2',...snapshot,'within_limits',480,10]:snapshot);
    await store.approve('operator-a',{...current,approvalKey:oldKey});
    assert.equal(await store.isApproved('operator-a',current),false);
  }
});

test('explicit warning approval restores only for the same operator, order and estimates',async()=>{
  const {storage,store}=memoryStore();
  const rows=[visit('late',{fixedStartMinute:600}),visit('early',{fixedStartMinute:540})];
  const current=review(rows);
  assert.equal(await store.isApproved('operator-a',current),false);
  await store.approve('operator-a',current);
  const restored=createLocalSavedQueueApprovalStore(storage,digest);
  assert.equal(await restored.isApproved('operator-a',review(rows)),true);
  assert.equal(await restored.isApproved('operator-b',current),false);
  assert.equal(await restored.isApproved('operator-a',review([...rows].reverse())),false);
  assert.equal(await restored.isApproved('operator-a',review([{...rows[0],estimatedMinutes:31},rows[1]])),false);
});

test('saved-day readback checks predicted remaining service without completed or skipped visits',()=>{
  const row={
    id:'a',customer_id:'customer-a',location_id:'location-a',service_name:'Synthetic service',
    rate_cents:5000,estimated_minutes:45,starts_on:'2026-10-13',ends_on:null,frequency:'daily',
    interval_days:null,days_of_week:null,preferred_start_minute:540,preferred_finish_minute:660,
    fixed_start_minute:600,active:1,address:'Synthetic address',preferences:null,lat:null,lon:null
  };
  const data:DayData={
    date:'2026-10-13',planningStatus:'source-data-only',roadOptimization:false,
    customers:[{id:'customer-a',name:'Synthetic Customer',phone:null,notes:null}],
    agreements:[row,{...row,id:'done'},{...row,id:'skipped'}],
    visits:[
      {agreement_id:'done',scheduled_date:'2026-10-13',status:'completed',actual_minutes:45},
      {agreement_id:'skipped',scheduled_date:'2026-10-13',status:'skipped',actual_minutes:null}
    ],
    durationHistory:[{agreement_id:'a',actual_minutes:120},{agreement_id:'a',actual_minutes:120},{agreement_id:'a',actual_minutes:120}]
  };
  const before=JSON.stringify(data);
  const summary=summarizeSavedDay(data);
  assert.deepEqual(summary.due.map(v=>v.id),['a:2026-10-13']);
  const current=review(summary.due);
  assert.equal(current.estimatedServiceMinutes,83);
  assert.equal(current.appointments.status,'conflicts');
  assert.deepEqual(current.appointments.issues.map(i=>i.visitId),['a:2026-10-13']);
  assert.match(current.appointments.issues[0].message,/83-minute.*23 min over/);
  assert.equal(JSON.stringify(data),before);
});
