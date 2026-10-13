import test from 'node:test';
import assert from 'node:assert/strict';
import {parseServiceClock,formatServiceClock,describeServiceTimeConstraints} from '../src/domain/service-time';
import {serviceAgreementInput} from '../src/domain/service-agreement';
import {summarizeSavedDay} from '../src/data/saved-day';
import {createSavedQueueReview,isSavedQueueApproved} from '../src/domain/saved-queue-review';
import {buildDailyWorkflow} from '../src/domain/daily-workflow';
import type {DayData} from '../src/data/greencollar-api';

const input={locationId:'location-a',serviceName:'Synthetic service',rateCents:7500,estimatedMinutes:45,startsOn:'2026-10-13',frequency:'weekly' as const};
const timing={preferredStartMinute:540,preferredFinishMinute:660,fixedStartMinute:600};
const row={
  id:'agreement-a',customer_id:'customer-a',location_id:'location-a',service_name:input.serviceName,
  rate_cents:7500,estimated_minutes:45,starts_on:input.startsOn,ends_on:null,frequency:'weekly',interval_days:null,
  days_of_week:null,preferred_start_minute:540,preferred_finish_minute:660,fixed_start_minute:600,
  active:1,address:'Synthetic address',preferences:null,lat:null,lon:null
};
const day:DayData={date:'2026-10-13',planningStatus:'source-data-only',roadOptimization:false,
  customers:[{id:'customer-a',name:'Synthetic Customer',phone:null,notes:null}],agreements:[row],visits:[],durationHistory:[]};

test('clock input preserves local midnight and accepts end-of-day only for latest finish',()=>{
  assert.equal(parseServiceClock(''),undefined);
  assert.equal(parseServiceClock(' 09:05 '),545);
  assert.equal(parseServiceClock('9:05'),545);
  assert.equal(parseServiceClock('00:00'),0);
  assert.equal(parseServiceClock('23:59'),1439);
  assert.equal(parseServiceClock('24:00',true),1440);
  assert.throws(()=>parseServiceClock('24:00'));
  assert.equal(formatServiceClock(0),'00:00');
  assert.equal(formatServiceClock(1440),'24:00');
});

test('malformed, out-of-range and overnight clock values reject',()=>{
  for(const clock of ['09:60','24:01','25:00','-1:00','9:5','9am','09.30','1e1:00','12:30:00'])
    assert.throws(()=>parseServiceClock(clock,true));
  for(const value of [-1,1441,1.5,NaN,Infinity])assert.equal(formatServiceClock(value),'Invalid time');
});

test('validated agreement supports fixed, one-sided, full and absent service windows',()=>{
  assert.deepEqual(serviceAgreementInput(input),input);
  for(const times of [timing,{fixedStartMinute:0},{preferredStartMinute:0},{preferredFinishMinute:1440},{preferredStartMinute:1395,preferredFinishMinute:1440}]){
    assert.deepEqual(serviceAgreementInput({...input,...times}),{...input,...times});
  }
});

test('invalid minute types and bounds cannot enter the saved agreement',()=>{
  for(const times of [
    {fixedStartMinute:-1},{fixedStartMinute:1440},{fixedStartMinute:12.5},{fixedStartMinute:'600'},
    {preferredStartMinute:null},{preferredStartMinute:1440},{preferredFinishMinute:0},
    {preferredFinishMinute:1441},{preferredFinishMinute:Infinity},{fixedStartMinute:NaN}
  ])assert.throws(()=>serviceAgreementInput({...input,...times}));
});

test('service estimate and fixed start must fit a same-day window',()=>{
  for(const times of [
    {preferredStartMinute:600,preferredFinishMinute:600},
    {preferredStartMinute:660,preferredFinishMinute:600},
    {preferredStartMinute:600,fixedStartMinute:599},
    {preferredStartMinute:600,preferredFinishMinute:630},
    {fixedStartMinute:630,preferredFinishMinute:660},
    {fixedStartMinute:1439},{preferredStartMinute:1439}
  ])assert.throws(()=>serviceAgreementInput({...input,...times}));
  assert.equal(serviceAgreementInput({...input,fixedStartMinute:615,preferredFinishMinute:660}).fixedStartMinute,615);
});

test('appointment description preserves midnight and distinguishes flexible services',()=>{
  assert.match(describeServiceTimeConstraints({fixedStartMinute:0,preferredFinishMinute:1440}),/Fixed start 00:00.*Finish by 24:00/);
  assert.match(describeServiceTimeConstraints(timing),/Fixed start 10:00.*Start no earlier than 09:00.*Finish by 11:00/);
  assert.equal(describeServiceTimeConstraints({}),'Flexible timing · no appointment window saved');
});

test('saved day carries every appointment field without changing order, values or source rows',()=>{
  const before=JSON.stringify(day);
  const summary=summarizeSavedDay(day);
  assert.deepEqual(summary.due[0],{
    id:'agreement-a:2026-10-13',service:input.serviceName,address:row.address,customer:'Synthetic Customer',
    rateCents:7500,estimatedMinutes:45,lat:null,lon:null,...timing
  });
  assert.equal(JSON.stringify(day),before);
  const midnight=summarizeSavedDay({...day,agreements:[{...row,preferred_start_minute:0,preferred_finish_minute:60,fixed_start_minute:0}]});
  assert.equal(midnight.due[0].fixedStartMinute,0);
  assert.equal(midnight.due[0].preferredStartMinute,0);
});

test('an appointment-only change invalidates approval with the same prices, order and estimates',()=>{
  const visits=summarizeSavedDay(day).due,limits={hours:'8',maxJobs:'6'};
  const original=createSavedQueueReview('business-a',day.date,visits,limits);
  assert.equal(isSavedQueueApproved(original,original.approvalKey),true);
  for(const change of [{preferredStartMinute:541},{preferredFinishMinute:661},{fixedStartMinute:601}]){
    const updated=createSavedQueueReview('business-a',day.date,[{...visits[0],...change}],limits);
    assert.equal(updated.estimatedServiceMinutes,original.estimatedServiceMinutes);
    assert.equal(updated.expectedRevenueCents,original.expectedRevenueCents);
    assert.equal(isSavedQueueApproved(updated,original.approvalKey),false);
  }
  const previousKey=JSON.stringify(['saved-queue-workload-v1','business-a',day.date,visits.map(v=>[v.id,v.rateCents,v.estimatedMinutes]),'within_limits',480,6]);
  assert.equal(isSavedQueueApproved(original,previousKey),false);
});

test('saved appointment fields reach the existing baseline planner using a synthetic travel matrix',()=>{
  const agreement={...serviceAgreementInput({...input,...timing}),id:'agreement-a',customerId:'customer-a',active:true};
  const planInput={
    date:day.date,agreements:[agreement],startNodeId:'base',endNodeId:'base',
    startMinute:480,endMinute:1080,maxJobs:6,minimumBufferMinutes:0,
    locations:[
      {id:'base',customerId:'operator',label:'Base',address:'Synthetic base',lat:0,lon:0},
      {id:'location-a',customerId:'customer-a',label:'Service',address:'Synthetic address',lat:0,lon:0}
    ],
    travelMinutes:{base:{base:0,'location-a':30},'location-a':{base:30,'location-a':0}}
  };
  const planned=buildDailyWorkflow(planInput);
  assert.equal(planned.stops[0].startMinute,600);
  assert.equal(planned.stops[0].finishMinute,645);
  assert.equal(planned.unscheduledVisitIds.length,0);
  const late=buildDailyWorkflow({...planInput,startMinute:590});
  assert.equal(late.stops.length,0);
  assert.deepEqual(late.unscheduledVisitIds,['agreement-a:2026-10-13']);
  const longer=buildDailyWorkflow({...planInput,durationHistoryByAgreement:{'agreement-a':[120,120,120]}});
  assert.equal(longer.stops.length,0);
  assert.deepEqual(longer.unscheduledVisitIds,['agreement-a:2026-10-13']);
});
