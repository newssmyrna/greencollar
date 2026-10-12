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

test('job cap zero schedules no work and explains the cap',()=>{
  const result=planDay({...sampleDay,maxJobs:0});
  assert.equal(result.stops.length,0);
  assert.equal(result.excluded.length,50);
  assert.ok(result.excluded.every(item=>item.reason==='job cap reached'));
});

test('travel and service time consume a bounded workday',()=>{
  const result=planDay({...sampleDay,endMinute:9*60});
  assert.ok(result.plannedFinishMinute<=9*60);
});

test('missing travel edges exclude unreachable jobs with a useful reason',()=>{
  const result=planDay({...sampleDay,travelMinutes:{base:{base:0}}});
  assert.equal(result.stops.length,0);
  assert.equal(result.excluded.length,50);
  assert.equal(result.excluded[0].reason,'no travel route to this location');
});

test('scheduled break shifts overlapping service to after the break',()=>{
  const input={...sampleDay,jobs:[{...sampleDay.jobs[0],estimatedMinutes:25}],
    locations:[sampleDay.locations[0]],maxJobs:1,startMinute:8*60+30,endMinute:11*60,
    travelMinutes:{base:{loc1:10},loc1:{base:10}},breaks:[{startMinute:9*60,durationMinutes:30}]};
  const result=planDay(input);
  assert.equal(result.stops.length,1);
  assert.equal(result.stops[0].startMinute,9*60+30);
  assert.equal(result.stops[0].finishMinute,10*60);
  assert.ok(result.feasible);
});

test('fixed appointment that conflicts with a scheduled break is explained',()=>{
  const input={...sampleDay,jobs:[{...sampleDay.jobs[0],fixedStartMinute:9*60,estimatedMinutes:30}],
    locations:[sampleDay.locations[0]],maxJobs:1,startMinute:8*60+40,endMinute:11*60,
    travelMinutes:{base:{loc1:10},loc1:{base:10}},breaks:[{startMinute:9*60,durationMinutes:45}]};
  const result=planDay(input);
  assert.equal(result.stops.length,0);
  assert.equal(result.excluded[0].reason,'fixed appointment overlaps a scheduled break');
});

test('narrow service windows are selected before less urgent jobs',()=>{
  const jobs=[
    {...sampleDay.jobs[0],id:'broad-window',locationId:'loc1',estimatedMinutes:20,earliestStartMinute:undefined,latestFinishMinute:10*60,priority:0},
    {...sampleDay.jobs[1],id:'closing-window',locationId:'loc2',estimatedMinutes:20,earliestStartMinute:undefined,latestFinishMinute:9*60+30,priority:0}
  ];
  const result=planDay({...sampleDay,jobs,locations:sampleDay.locations.slice(0,2),maxJobs:1});
  assert.equal(result.stops[0].jobId,'closing-window');
});

test('due work beats a closer optional job when time-window urgency is equal',()=>{
  const jobs=[
    {...sampleDay.jobs[0],id:'optional-near',locationId:'loc1',estimatedMinutes:20,earliestStartMinute:undefined,due:false,latestFinishMinute:10*60},
    {...sampleDay.jobs[1],id:'recurring-due',locationId:'loc2',estimatedMinutes:20,earliestStartMinute:undefined,due:true,latestFinishMinute:10*60+10}
  ];
  const travelMinutes={base:{loc1:2,loc2:12},loc1:{base:2},loc2:{base:12}};
  const result=planDay({...sampleDay,jobs,locations:sampleDay.locations.slice(0,2),travelMinutes,maxJobs:1});
  assert.equal(result.stops[0].jobId,'recurring-due');
});

test('higher numeric priority wins after appointment and urgency ties',()=>{
  const jobs=[
    {...sampleDay.jobs[0],id:'low-priority',locationId:'loc1',estimatedMinutes:20,earliestStartMinute:undefined,due:false,priority:1,latestFinishMinute:10*60},
    {...sampleDay.jobs[1],id:'high-priority',locationId:'loc2',estimatedMinutes:20,earliestStartMinute:undefined,due:false,priority:5,latestFinishMinute:10*60}
  ];
  const travelMinutes={base:{loc1:5,loc2:5},loc1:{base:5},loc2:{base:5}};
  const result=planDay({...sampleDay,jobs,locations:sampleDay.locations.slice(0,2),travelMinutes,maxJobs:1});
  assert.equal(result.stops[0].jobId,'high-priority');
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
