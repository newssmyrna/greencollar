import test from 'node:test';
import assert from 'node:assert/strict';
import { planDay, predictDuration } from '../src/domain/planner';
import { sampleDay } from '../src/demo/fixture';

test('50-customer test fixture creates a feasible day within configured capacity',()=>{
  const result=planDay(sampleDay);
  assert.ok(result.feasible);
  assert.ok(result.stops.length>0 && result.stops.length<=8);
  assert.equal(result.stops.length+result.excluded.length,50);
  assert.ok(result.plannedFinishMinute<=sampleDay.endMinute);
  assert.ok(result.revenueCents>0);
});

test('job cap zero schedules no work',()=>{
  const result=planDay({...sampleDay,maxJobs:0});
  assert.equal(result.stops.length,0);
  assert.equal(result.excluded.length,50);
});

test('travel and service time consume a bounded workday',()=>{
  const result=planDay({...sampleDay,endMinute:9*60});
  assert.ok(result.plannedFinishMinute<=9*60);
});

test('missing travel edges exclude unreachable jobs',()=>{
  const result=planDay({...sampleDay,travelMinutes:{base:{base:0}}});
  assert.equal(result.stops.length,0);
  assert.equal(result.excluded.length,50);
});

test('duration forecast learns without overreacting to one outlier',()=>{
  const p=predictDuration([45,46,47,48,49,50,51,110],60);
  assert.equal(p.confidence,'high');
  assert.ok(p.minutes<60);
  assert.equal(p.samples,8);
});

test('duration forecast starts at the declared estimate',()=>{
  assert.deepEqual(predictDuration([],45),{minutes:45,samples:0,confidence:'low'});
});
