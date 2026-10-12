import test from 'node:test';
import assert from 'node:assert/strict';
import { roadTravelMinutes, osrmTableRequest } from '../src/domain/road-matrix';

const locations=[
 {id:'home',lat:29.00,lon:-80.90},
 {id:'client',lat:29.07,lon:-80.92}
];

test('road durations become rounded-up planner minutes in both directions',()=>{
 const matrix=roadTravelMinutes(locations,{durations:[[0,631],[721,0]]});
 assert.deepEqual(matrix,{home:{home:0,client:11},client:{home:13,client:0}});
});

test('unreachable legs remain unavailable rather than guessed from distance',()=>{
 const matrix=roadTravelMinutes(locations,{durations:[[0,null],[450,0]]});
 assert.equal(matrix.home.client,undefined);
 assert.equal(matrix.client.home,8);
});

test('matrix dimensions and missing or negative values fail closed',()=>{
 assert.throws(()=>roadTravelMinutes(locations,{durations:[[0,10]]}),/dimensions/);
 assert.throws(()=>roadTravelMinutes(locations,{durations:[[0,-3],[1,0]]}),/duration/);
 assert.throws(()=>roadTravelMinutes(locations,{durations:[[0,NaN],[1,0]]}),/duration/);
});

test('duplicate node identifiers and invalid coordinates are rejected',()=>{
 assert.throws(()=>roadTravelMinutes([locations[0],{...locations[1],id:'home'}],{durations:[[0,2],[2,0]]}),/Duplicate/);
 assert.throws(()=>roadTravelMinutes([{...locations[0],lat:91}],{durations:[[0]]}),/coordinates/);
});

test('HTTPS road-table request preserves location order and longitude latitude convention',()=>{
 const url=osrmTableRequest('https://routing.example.org',locations);
 assert.equal(url,'https://routing.example.org/table/v1/driving/-80.9,29;-80.92,29.07?annotations=duration,distance');
 assert.throws(()=>osrmTableRequest('http://routing.example.org',locations),/HTTPS/);
});
