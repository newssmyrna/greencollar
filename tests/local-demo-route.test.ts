import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIllustrativeTravelMatrix,
  estimateIllustrativeRoute,
  findIllustrativeLunchSlots,
  SAMPLE_DEPOT_ID,
  SAMPLE_RETURN_ID,
  type IllustrativeRouteStop,
} from '../src/demo/local-demo-route';

const date='2026-10-14';
const locationIds=['preview-location-1','preview-location-2','preview-location-3'];
const stops:IllustrativeRouteStop[]=[
  {id:`preview-agreement-1:${date}`,locationId:locationIds[0],serviceMinutes:45},
  {id:`preview-agreement-2:${date}`,locationId:locationIds[1],serviceMinutes:35},
  {id:`preview-agreement-3:${date}`,locationId:locationIds[2],serviceMinutes:90},
];
const matrix=buildIllustrativeTravelMatrix(locationIds);

function route(startMinute=8*60,duration:30|60=30,extra:Partial<Parameters<typeof estimateIllustrativeRoute>[0]>={}){
  return estimateIllustrativeRoute({
    stops,travelMinutes:matrix,startMinute,endMinute:16*60,
    lunchDurationMinutes:duration,lunchAfterVisitId:stops[2].id,
    ...extra,
  });
}

test('builds the explicit sample matrix and includes depot, inter-stop, and return travel',()=>{
  assert.equal(matrix[SAMPLE_DEPOT_ID][locationIds[0]],12);
  assert.equal(matrix[locationIds[0]][locationIds[1]],14);
  assert.equal(matrix[locationIds[1]][locationIds[2]],15);
  const result=route(8*60,30);
  assert.equal(result.totalServiceMinutes,170);
  assert.equal(result.totalDriveMinutes,65);
  assert.equal(result.returnDriveMinutes,24);
  assert.deepEqual(result.legs.map(leg=>leg.driveMinutes),[12,14,15,24]);
  assert.equal(result.lunch?.startMinute,11*60+31);
  assert.equal(result.finishMinute,12*60+25);
  assert.equal(result.feasible,true);
  assert.equal(result.legs.at(-1)?.toId,SAMPLE_DEPOT_ID,'the finish estimate includes the return-to-depot leg');
});

test('lunch is a scheduled stop gap and never creates or changes a visit timer',()=>{
  const result=route(8*60,60);
  assert.equal(result.lunch?.durationMinutes,60);
  assert.equal(result.lunch?.startMinute,11*60+31);
  assert.equal(result.lunch?.finishMinute,12*60+31);
  assert.equal(result.finishMinute,12*60+55);
});

test('late chosen starts recalculate lunch, stop arrivals, and finish',()=>{
  const result=route(10*60,60);
  assert.equal(result.stops[0].arrivalMinute,10*60+12);
  assert.equal(result.lunch?.startMinute,13*60+31);
  assert.equal(result.finishMinute,14*60+55);
  assert.equal(result.feasible,true);
});

test('offers only lunch slots that meet the sample midday rule and fit capacity',()=>{
  const options=findIllustrativeLunchSlots({stops,travelMinutes:matrix,startMinute:8*60,endMinute:12*60+30,durationMinutes:30});
  assert.deepEqual(options.map(option=>[option.afterVisitId,option.feasible]),[
    [stops[0].id,false],[stops[1].id,false],[stops[2].id,true],
  ]);
  assert.equal(options[2].finishMinute,12*60+1);
  const sixty=findIllustrativeLunchSlots({stops,travelMinutes:matrix,startMinute:8*60,endMinute:12*60+30,durationMinutes:60});
  assert.equal(sixty[2].feasible,false);
  assert.match(sixty[2].reason??'',/workday limit/);
});

test('flags a late lunch choice that leaves no feasible slot instead of moving an appointment',()=>{
  const options=findIllustrativeLunchSlots({stops,travelMinutes:matrix,startMinute:11*60+15,endMinute:16*60,durationMinutes:60});
  assert.equal(options.some(option=>option.feasible),false);
  assert.match(options[2].reason??'',/workday limit/);
});

test('flags fixed-start and latest-finish conflicts after route changes',()=>{
  const fixedStops=[stops[0],{...stops[1],fixedStartMinute:11*60},stops[2]];
  const result=estimateIllustrativeRoute({stops:fixedStops,travelMinutes:matrix,startMinute:10*60,endMinute:16*60,
    lunchDurationMinutes:30,lunchAfterVisitId:stops[2].id});
  assert.ok(result.conflicts.some(conflict=>conflict.kind==='fixed_start'&&conflict.stopId===stops[1].id));
  const latestStops=[stops[0],{...stops[1],latestFinishMinute:9*60+30},stops[2]];
  const latest=estimateIllustrativeRoute({stops:latestStops,travelMinutes:matrix,startMinute:8*60,endMinute:16*60});
  assert.ok(latest.conflicts.some(conflict=>conflict.kind==='latest_finish'&&conflict.stopId===stops[1].id));
});

test('delay before the next stop shifts downstream arrivals and can expose a fixed-start conflict',()=>{
  const delayed=estimateIllustrativeRoute({stops:[stops[0],{...stops[1],fixedStartMinute:9*60+30},stops[2]],
    travelMinutes:matrix,startMinute:8*60,endMinute:16*60,delayMinutes:30,delayBeforeId:stops[1].id});
  assert.equal(delayed.delay?.durationMinutes,30);
  assert.equal(delayed.stops[1].arrivalMinute,9*60+41);
  assert.ok(delayed.conflicts.some(conflict=>conflict.kind==='fixed_start'));
});

test('a delay after the last service is included before the depot return',()=>{
  const delayed=estimateIllustrativeRoute({stops,travelMinutes:matrix,startMinute:8*60,endMinute:16*60,
    delayMinutes:15,delayBeforeId:SAMPLE_RETURN_ID});
  assert.equal(delayed.delay?.beforeId,SAMPLE_RETURN_ID);
  assert.equal(delayed.finishMinute,12*60+10);
});

test('remaining estimates start at the last sample position and still include the depot return',()=>{
  const result=estimateIllustrativeRoute({
    stops:[stops[2]],travelMinutes:matrix,startMinute:10*60,endMinute:16*60,
    startNodeId:locationIds[1],
  });
  assert.equal(result.totalServiceMinutes,90);
  assert.equal(result.totalDriveMinutes,39);
  assert.equal(result.legs[0].fromId,locationIds[1]);
  assert.equal(result.legs[0].driveMinutes,15);
  assert.equal(result.legs[1].isReturn,true);
  assert.equal(result.legs[1].toId,SAMPLE_DEPOT_ID);
  assert.equal(result.finishMinute,10*60+15+90+24);
});

test('lunch can be placed at the current sample position before the remaining return leg',()=>{
  const options=findIllustrativeLunchSlots({
    stops:[],travelMinutes:matrix,startMinute:11*60,endMinute:16*60,durationMinutes:30,
    startNodeId:locationIds[1],startAfterVisitId:stops[1].id,lunchNotBeforeMinute:11*60,
  });
  assert.equal(options.length,1);
  assert.equal(options[0].afterVisitId,stops[1].id);
  assert.equal(options[0].feasible,true);
  const route=estimateIllustrativeRoute({
    stops:[],travelMinutes:matrix,startMinute:11*60,endMinute:16*60,
    startNodeId:locationIds[1],lunchNotBeforeMinute:11*60,
    lunchDurationMinutes:30,lunchAfterVisitId:stops[1].id,lunchAtStartAfterVisitId:stops[1].id,
  });
  assert.equal(route.totalServiceMinutes,0);
  assert.equal(route.lunch?.startMinute,11*60);
  assert.equal(route.returnDriveMinutes,18);
  assert.equal(route.finishMinute,11*60+30+18);
});

