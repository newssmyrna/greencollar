import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDailyWorkflow} from '../src/domain/daily-workflow';
import {sampleDay} from '../src/demo/fixture';
import type {Agreement} from '../src/domain/recurrence';

const agreements:Agreement[]=[
  {id:'pool',customerId:'c1',locationId:'loc1',serviceName:'Pool',
    startsOn:'2026-10-05',frequency:'weekly',active:true,rateCents:7000,estimatedMinutes:45},
  {id:'clean',customerId:'c2',locationId:'loc2',serviceName:'Cleaning',
    startsOn:'2026-10-12',frequency:'biweekly',active:true,rateCents:11000,estimatedMinutes:70},
  {id:'future',customerId:'c3',locationId:'loc3',serviceName:'Detailing',
    startsOn:'2026-10-13',frequency:'daily',active:true,rateCents:9000,estimatedMinutes:50}
];
const input={...sampleDay,date:'2026-10-12',agreements,maxJobs:5};
test('weekly and biweekly services flow into the daily plan',()=>{
 const r=buildDailyWorkflow(input);
 assert.equal(r.dueCount,2);
 assert.deepEqual(r.stops.map(s=>s.jobId).sort(),['clean:2026-10-12','pool:2026-10-12']);
 assert.equal(r.revenueCents,18000);
 assert.ok(r.feasible);
});
test('a completed recurring visit is not scheduled again',()=>{
 const r=buildDailyWorkflow({...input,completedVisitIds:['pool:2026-10-12']});
 assert.equal(r.alreadyHandledCount,1);
 assert.deepEqual(r.stops.map(s=>s.jobId),['clean:2026-10-12']);
});
test('unfittable visits remain visible rather than disappearing',()=>{
 const r=buildDailyWorkflow({...input,maxJobs:1});
 assert.equal(r.dueCount,2);
 assert.equal(r.stops.length,1);
 assert.equal(r.unscheduledVisitIds.length,1);
});
test('different service date selects different visits',()=>{
 const r=buildDailyWorkflow({...input,date:'2026-10-13'});
 assert.deepEqual(r.stops.map(s=>s.jobId),['future:2026-10-13']);
});
test('rejects duplicate id across one-off and recurring jobs',()=>{
 assert.throws(()=>buildDailyWorkflow({...input,extraJobs:[{
   id:'pool:2026-10-12',customerId:'c1',locationId:'loc1',serviceName:'Repair',
   estimatedMinutes:25,rateCents:2500
 }]}),/Duplicate/);
});

test('uses actual completed job durations to improve recurring route estimates',()=>{
 const baseline=buildDailyWorkflow(input);
 const learned=buildDailyWorkflow({...input,durationHistoryByAgreement:{
   pool:[20,21,22,23,24,25,26,27],clean:[80,82,81]
 }});
 const pool=learned.predictions.find(p=>p.agreementId==='pool');
 assert.equal(pool?.confidence,'high');
 assert.equal(pool?.samples,8);
 assert.ok((pool?.minutes??100)<45);
 assert.notEqual(learned.totalServiceMinutes,baseline.totalServiceMinutes);
 assert.equal(learned.revenueCents,baseline.revenueCents);
});
test('invalid historic durations are ignored and estimates stay unchanged without valid history',()=>{
 const r=buildDailyWorkflow({...input,durationHistoryByAgreement:{pool:[-2,0,Number.NaN,2000]}});
 assert.equal(r.predictions.find(p=>p.agreementId==='pool')?.minutes,45);
 assert.equal(r.predictions.find(p=>p.agreementId==='pool')?.confidence,'low');
});
