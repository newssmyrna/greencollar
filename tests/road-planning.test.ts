import test from 'node:test';
import assert from 'node:assert/strict';
import {planWithRoadMatrix} from '../src/domain/road-planning';
import type {RoadPoint} from '../src/domain/road-matrix';
const points:RoadPoint[]=[{id:'base',lat:29,lon:-80.9},{id:'a',lat:29.05,lon:-80.91},{id:'b',lat:29.06,lon:-80.92}];
const input={
 locations:[
  {id:'a',customerId:'c1',label:'A',address:'A',lat:29.05,lon:-80.91},
  {id:'b',customerId:'c2',label:'B',address:'B',lat:29.06,lon:-80.92}
 ],
 jobs:[
  {id:'jobA',customerId:'c1',locationId:'a',serviceName:'Pool',rateCents:7000,estimatedMinutes:30},
  {id:'jobB',customerId:'c2',locationId:'b',serviceName:'Lawn',rateCents:5000,estimatedMinutes:30}
 ],
 startNodeId:'base',endNodeId:'base',startMinute:480,endMinute:960,maxJobs:2
};
const durations=[[0,1200,300],[1200,0,900],[300,900,0]];
test('road durations determine job order and planned travel time',()=>{
 const result=planWithRoadMatrix(input,points,{durations});
 assert.deepEqual(result.stops.map(s=>s.jobId),['jobB','jobA']);
 assert.equal(result.totalDriveMinutes,40);assert.equal(result.revenueCents,12000);
 assert.equal(result.totalDriveDistanceMiles,null);assert.equal(result.fuelEstimate,null);
});
test('provider distances produce route mileage and editable towing fuel estimate',()=>{
 const assumptions={vehicleMpg:20,towingMpg:10,trailerAttached:true,fuelPriceCentsPerGallon:350};
 const result=planWithRoadMatrix({...input,fuelAssumptions:assumptions},points,{durations,distances:[
  [0,16093.44,8046.72],[16093.44,0,14484.096],[24140.16,14484.096,0]
 ]});
 assert.equal(result.totalDriveDistanceMiles,24);
 assert.deepEqual(result.fuelEstimate,{distanceMiles:24,mpgUsed:10,gallons:2.4,estimatedCostCents:840});
});
test('missing road distances do not fabricate mileage or fuel',()=>{
 const result=planWithRoadMatrix({...input,fuelAssumptions:{vehicleMpg:20,towingMpg:10,trailerAttached:true}},points,{durations,distances:[
  [0,16093.44,8046.72],[16093.44,0,null],[24140.16,14484.096,0]
 ]});
 assert.equal(result.totalDriveDistanceMiles,null);assert.equal(result.fuelEstimate,null);
});
test('missing required road nodes prevent planning',()=>{
 assert.throws(()=>planWithRoadMatrix(input,points.slice(0,2),{durations:[[0,20],[20,0]]}),/Missing road point/);
});
test('unreachable roads exclude stops rather than fabricating travel times',()=>{
 const result=planWithRoadMatrix(input,points,{durations:[[0,1200,null],[1200,0,null],[null,null,0]]});
 assert.deepEqual(result.stops.map(s=>s.jobId),['jobA']);assert.deepEqual(result.excluded.map(s=>s.jobId),['jobB']);
});
