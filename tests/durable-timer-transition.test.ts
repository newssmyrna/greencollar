import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableTimerTransition} from '../src/domain/durable-timer-transition';
import {startWork} from '../src/domain/work-session';
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
test('display changes only after device save resolves',async()=>{
 const writer=createDurableTimerTransition(),gate=deferred(),next=startWork('visit',1000);let applied=false;
 const task=writer.run(next,()=>gate.promise,()=>true,()=>{applied=true;});
 assert.equal(writer.busy,true);assert.equal(applied,false);
 gate.resolve();assert.equal(await task,true);assert.equal(applied,true);assert.equal(writer.busy,false);
});
test('repeated taps cannot enqueue a second transition while saving',async()=>{
 const writer=createDurableTimerTransition(),gate=deferred(),next=startWork('visit',1000);let saves=0;
 const first=writer.run(next,()=>{saves++;return gate.promise;},()=>true,()=>{});
 assert.equal(await writer.run(next,async()=>{saves++;},()=>true,()=>{}),false);
 assert.equal(saves,1);gate.resolve();await first;
});
test('failed saves do not apply a transition and release the busy guard',async()=>{
 const writer=createDurableTimerTransition(),next=startWork('visit',1000);let applied=0;
 await assert.rejects(writer.run(next,async()=>{throw Error('storage failed');},()=>true,()=>{applied++;}),/storage failed/);
 assert.equal(applied,0);assert.equal(writer.busy,false);
 assert.equal(await writer.run(next,async()=>{},()=>true,()=>{applied++;}),true);assert.equal(applied,1);
});
test('sign-out or changed session suppresses a late save result',async()=>{
 const writer=createDurableTimerTransition(),gate=deferred(),next=startWork('visit',1000);let current=true,applied=false;
 const task=writer.run(next,()=>gate.promise,()=>current,()=>{applied=true;});
 current=false;gate.resolve();assert.equal(await task,false);assert.equal(applied,false);
});
test('pending transition snapshots are isolated from caller mutation',async()=>{
 const writer=createDurableTimerTransition(),gate=deferred(),next=startWork('visit',1000);let savedId='',appliedId='';
 const task=writer.run(next,async snapshot=>{await gate.promise;savedId=snapshot.jobId;},()=>true,snapshot=>{appliedId=snapshot.jobId;});
 next.jobId='changed';gate.resolve();await task;assert.equal(savedId,'visit');assert.equal(appliedId,'visit');
});
