import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessSavedQueueWorkload,describeSavedQueueWorkload} from '../src/domain/saved-queue-workload';
import {createSavedQueueReview,canApproveSavedQueueReview,isSavedQueueApproved} from '../src/domain/saved-queue-review';
import {createLocalSavedQueueApprovalStore} from '../src/data/local-saved-queue-approval';
import {summarizeSavedDay} from '../src/data/saved-day';
import {orderSavedQueue} from '../src/domain/saved-queue-order';
import type {DayData} from '../src/data/greencollar-api';

const visits=[
  {id:'a:2026-10-13',customer:'A',service:'Pool',rateCents:5000,estimatedMinutes:45},
  {id:'b:2026-10-13',customer:'B',service:'Cleaning',rateCents:8000,estimatedMinutes:90},
  {id:'c:2026-10-13',customer:'C',service:'Maintenance',rateCents:10000,estimatedMinutes:120}
];
const review=(hours='4.25',maxJobs='3')=>createSavedQueueReview('business-a','2026-10-13',visits,{hours,maxJobs});

test('saved workload counts every visit above the cap without changing source data',()=>{
  const frozen=visits.map(visit=>Object.freeze({...visit}));
  Object.freeze(frozen);
  const result=assessSavedQueueWorkload(frozen,{hours:'4',maxJobs:'2'});
  assert.deepEqual(result,{
    status:'over_limits',availableMinutes:240,maxJobs:2,visitCount:3,
    estimatedServiceMinutes:255,serviceOverageMinutes:15,jobsOverCap:1
  });
  assert.deepEqual(frozen,visits);
  assert.match(describeSavedQueueWorkload(result),/15 service minutes over/);
  assert.match(describeSavedQueueWorkload(result),/1 visit above/);
});

test('either hours or visit count can be set independently',()=>{
  const byHours=assessSavedQueueWorkload(visits,{hours:'4.25',maxJobs:''});
  assert.equal(byHours.status,'within_limits');
  assert.equal(byHours.maxJobs,null);
  assert.match(describeSavedQueueWorkload(byHours),/Visit limit not set/);
  const byCount=assessSavedQueueWorkload(visits,{hours:'',maxJobs:'3'});
  assert.equal(byCount.status,'within_limits');
  assert.equal(byCount.availableMinutes,null);
  assert.match(describeSavedQueueWorkload(byCount),/Service-hour limit not set/);
});

test('exact service and count boundaries pass, overruns remain visible',()=>{
  assert.equal(review().workload?.status,'within_limits');
  assert.equal(review('4','3').workload?.serviceOverageMinutes,15);
  assert.equal(review('5','2').workload?.jobsOverCap,1);
  assert.equal(review('5','2').visitCount,3);
  assert.deepEqual(review('5','2').visitIds,visits.map(v=>v.id));
});

test('decimal hour budgets use whole minutes without floating point undercount',()=>{
  assert.equal(assessSavedQueueWorkload(visits,{hours:'4.10',maxJobs:''}).availableMinutes,246);
  assert.equal(assessSavedQueueWorkload(visits,{hours:'0.26',maxJobs:''}).availableMinutes,15);
});

test('requires a limit and rejects malformed or out-of-range values',()=>{
  assert.equal(assessSavedQueueWorkload(visits,{hours:' ',maxJobs:''}).status,'needs_limits');
  for(const hours of ['0','0.24','24.01','-1','Infinity','1e1','8hours','4.123'])
    assert.equal(assessSavedQueueWorkload(visits,{hours,maxJobs:'3'}).status,'invalid_hours');
  for(const maxJobs of ['0','201','-1','2.5','Infinity','3jobs'])
    assert.equal(assessSavedQueueWorkload(visits,{hours:'8',maxJobs}).status,'invalid_job_cap');
});

test('invalid identities and service durations cannot appear as a valid workload',()=>{
  for(const estimatedMinutes of [0,-1,1.5,1441,NaN,Infinity]){
    assert.equal(assessSavedQueueWorkload([{id:'a',estimatedMinutes}],{hours:'8',maxJobs:'3'}).status,'invalid_visits');
  }
  for(const invalid of [[visits[0],visits[0]],[{...visits[0],id:' '}]])
    assert.equal(assessSavedQueueWorkload(invalid,{hours:'8',maxJobs:'3'}).status,'invalid_visits');
});

test('empty queues have zero workload and cannot be approved',()=>{
  const empty=createSavedQueueReview('business-a','2026-10-13',[],{hours:'8',maxJobs:''});
  assert.equal(empty.workload?.estimatedServiceMinutes,0);
  assert.equal(empty.workload?.visitCount,0);
  assert.equal(canApproveSavedQueueReview(empty),false);
  assert.equal(isSavedQueueApproved(empty,empty.approvalKey),false);
});

test('approval binds normalized limits and invalidates changes to either limit',()=>{
  const original=review();
  assert.equal(isSavedQueueApproved(original,original.approvalKey),true);
  assert.equal(review(' 4.25 ','03').approvalKey,original.approvalKey);
  assert.equal(isSavedQueueApproved(review('5','3'),original.approvalKey),false);
  assert.equal(isSavedQueueApproved(review('4.25','4'),original.approvalKey),false);
  assert.equal(isSavedQueueApproved(review('4.25',''),original.approvalKey),false);
  const legacy=createSavedQueueReview('business-a','2026-10-13',visits);
  assert.equal(isSavedQueueApproved(original,legacy.approvalKey),false);
});

test('invalid or missing workload limits fail approval even with a matching key',()=>{
  for(const current of [review('',''),review('invalid','3'),review('8','0'),createSavedQueueReview('business-a','2026-10-13',[{...visits[0],estimatedMinutes:1.5}],{hours:'8',maxJobs:''})]){
    assert.equal(canApproveSavedQueueReview(current),false);
    assert.equal(isSavedQueueApproved(current,current.approvalKey),false);
  }
});

test('warning review remains an explicit operator choice with the entire queue',()=>{
  const over=review('1','1');
  assert.equal(canApproveSavedQueueReview(over),true);
  assert.equal(isSavedQueueApproved(over,null),false);
  assert.equal(isSavedQueueApproved(over,over.approvalKey),true);
  assert.equal(over.visitCount,3);
  assert.equal(over.estimatedServiceMinutes,255);
});

test('stored approvals restore only with matching workload and operator context',async()=>{
  const memory=new Map<string,string>();
  const storage={async getItemAsync(key:string){return memory.get(key)??null;},async setItemAsync(key:string,value:string){memory.set(key,value);}};
  const digest=async(value:string)=>createHash('sha256').update(value).digest('hex');
  const store=createLocalSavedQueueApprovalStore(storage,digest);
  await store.approve('operator-a',review());
  const restored=createLocalSavedQueueApprovalStore(storage,digest);
  assert.equal(await restored.isApproved('operator-a',review()),true);
  assert.equal(await restored.isApproved('operator-b',review()),false);
  assert.equal(await restored.isApproved('operator-a',review('5','3')),false);
  assert.equal(await restored.isApproved('operator-a',review('','')),false);
  const before=[...memory];
  await assert.rejects(()=>store.approve('operator-a',review('invalid','3')),/valid workload/);
  assert.deepEqual([...memory],before);
});

test('saved day integration assesses remaining predicted visits in the operator order',()=>{
  const data:DayData={
    date:'2026-10-13',planningStatus:'source-data-only',roadOptimization:false,
    customers:[{id:'customer-a',name:'Synthetic Customer',phone:null,notes:null}],
    agreements:visits.map((visit,index)=>({
      id:String.fromCharCode(97+index),customer_id:'customer-a',location_id:'location-'+index,
      service_name:visit.service,rate_cents:visit.rateCents,estimated_minutes:visit.estimatedMinutes,
      starts_on:'2026-10-13',ends_on:null,frequency:'daily',interval_days:null,days_of_week:null,
      preferred_start_minute:null,preferred_finish_minute:null,fixed_start_minute:null,
      active:1,address:'Synthetic address',preferences:null,lat:null,lon:null
    })),
    visits:[{agreement_id:'a',scheduled_date:'2026-10-13',status:'completed',actual_minutes:45}],
    durationHistory:[{agreement_id:'b',actual_minutes:30},{agreement_id:'b',actual_minutes:30},{agreement_id:'b',actual_minutes:30}]
  };
  const snapshot=JSON.stringify(data);
  const due=summarizeSavedDay(data);
  const ordered=orderSavedQueue(due.due,'scope',{scopeKey:'scope',visitIds:['c:2026-10-13','b:2026-10-13']});
  const current=createSavedQueueReview('business-a',data.date,ordered,{hours:'2',maxJobs:'1'});
  assert.deepEqual(current.visitIds,['c:2026-10-13','b:2026-10-13']);
  assert.equal(current.estimatedServiceMinutes,180);
  assert.equal(current.workload?.serviceOverageMinutes,60);
  assert.equal(current.workload?.jobsOverCap,1);
  const previous=createSavedQueueReview('business-a',data.date,visits,{hours:'2',maxJobs:'1'});
  assert.equal(isSavedQueueApproved(current,previous.approvalKey),false);
  assert.equal(JSON.stringify(data),snapshot);
});
