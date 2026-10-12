import test from 'node:test';
import assert from 'node:assert/strict';
import {startWork,pauseWork,resumeWork,completeWork,getElapsedMinutes,completionRecord} from '../src/domain/work-session';

test('pause time does not count toward work duration',()=>{
 const a=startWork('visit-1',100000);
 const b=pauseWork(a,220000);
 assert.equal(getElapsedMinutes(b,520000),2);
 const c=resumeWork(b,520000);
 const d=completeWork(c,640000);
 assert.equal(getElapsedMinutes(d,1000000),4);
 assert.deepEqual(completionRecord(d),{jobId:'visit-1',startedAt:100000,completedAt:640000,actualMinutes:4});
});

test('unfinished sessions cannot be posted as completed',()=>{
 assert.throws(()=>completionRecord(startWork('job',0)),/Completion required/);
});

test('invalid transitions are rejected',()=>{
 const a=startWork('job',100);
 assert.throws(()=>resumeWork(a,200),/not paused/);
 assert.throws(()=>pauseWork(a,99),/Time before job start/);
 const b=pauseWork(a,200);
 assert.throws(()=>pauseWork(b,300),/not running/);
 const c=completeWork(b,350);
 assert.throws(()=>completeWork(c,400),/already completed/);
});

test('short visits round up to whole minute when completed',()=>{
 assert.equal(completionRecord(completeWork(startWork('job',1000),1001)).actualMinutes,1);
});

test('timer can survive serializing to offline storage',()=>{
 const a=pauseWork(startWork('job',100),60100);
 const b=JSON.parse(JSON.stringify(a)) as typeof a;
 assert.equal(completionRecord(completeWork(resumeWork(b,90000),120000)).actualMinutes,2);
});

test('resume and completion reject times before the last timer transition',()=>{
 const paused=pauseWork(startWork('job',1000),5000);
 assert.throws(()=>resumeWork(paused,2000),/Clock moved backwards/);
 assert.throws(()=>completeWork(paused,4000),/Clock moved backwards/);
 assert.equal(resumeWork(paused,5000).lastResumedAt,5000);
});

test('scheduled visit identity and save status survive serialization',()=>{
 const session=startWork('agreement-1:2026-10-12',1000,{businessId:'business-1',serviceDate:'2026-10-12'});
 const restored=JSON.parse(JSON.stringify({...completeWork(session,2000),completionSaved:true})) as typeof session;
 assert.equal(restored.businessId,'business-1');
 assert.equal(restored.serviceDate,'2026-10-12');
 assert.equal(restored.completionSaved,true);
});

test('scheduled visit identity must be valid',()=>{
 assert.throws(()=>startWork('agreement-1:bad-date',1000,{businessId:'business-1',serviceDate:'2026-02-30'}),/Invalid scheduled visit/);
 assert.throws(()=>startWork('agreement-1:date',1000,{businessId:' ',serviceDate:'2026-10-12'}),/Invalid scheduled visit/);
});
