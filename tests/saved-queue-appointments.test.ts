import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessSavedQueueAppointments,describeSavedQueueAppointments,describeAppointmentCheckAssumptions,APPOINTMENT_CHECK_ASSUMPTIONS,type AppointmentVisit} from '../src/domain/saved-queue-appointments';
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

test('between-stop travel estimates propagate to fixed appointments and stay tied to their queue leg',()=>{
  const rows=[visit('a',{estimatedMinutes:60}),visit('b',{fixedStartMinute:600,est