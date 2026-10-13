import test from 'node:test';
import assert from 'node:assert/strict';
import {requestRoadTable} from '../src/road-provider';
const points=[{id:'start',lon:-80.9,lat:29},{id:'stop',lon:-80.92,lat:29.07}];
test('routing adapter obtains validated provider durations and distances',async()=>{
 let called='';
 const fake=async(request:RequestInfo|URL,options?:RequestInit)=>{
  called=String(request);assert.equal(options?.method,'GET');
  return new Response(JSON.stringify({code:'Ok',durations:[[0,641],[777,0]],distances:[[0,3218.688],[4828.032,0]]}),{status:200});
 };
 const result=await requestRoadTable('https://router.example.test/',points,fake as typeof fetch);
 assert.deepEqual(result.durations,[[0,641],[777,0]]);
 assert.deepEqual(result.distances,[[0,3218.688],[4828.032,0]]);
 assert.equal(called,'https://router.example.test/table/v1/driving/-80.9,29;-80.92,29.07?annotations=duration,distance');
});
test('unreachable route legs remain null for both duration and distance',async()=>{
 const fake=async()=>new Response(JSON.stringify({code:'Ok',durations:[[0,null],[500,0]],distances:[[0,null],[1200,0]]}));
 const result=await requestRoadTable('https://router.example.test/',points,fake as typeof fetch);
 assert.equal(result.durations[0][1],null);assert.equal(result.distances[0][1],null);
});
test('rejects unsafe or malformed provider configuration before network calls',async()=>{
 const never=async()=>{throw new Error('No fetch expected')};
 await assert.rejects(requestRoadTable('http://router.example.test/',points,never as typeof fetch),/Invalid routing server/);
 await assert.rejects(requestRoadTable('https://router.example.test:443/path',points,never as typeof fetch),/Invalid routing server/);
 await assert.rejects(requestRoadTable('https://router.example.test/',[points[0],points[0]],never as typeof fetch),/Duplicate node/);
});
test('rejects invalid durations, distances, matrix shapes, and failed requests',async()=>{
 const badDuration=async()=>new Response(JSON.stringify({code:'Ok',durations:[[0,3]],distances:[[0,100]]}));
 await assert.rejects(requestRoadTable('https://router.example.test/',points,badDuration as typeof fetch),/invalid duration matrix/);
 const badDistance=async()=>new Response(JSON.stringify({code:'Ok',durations:[[0,3],[3,0]],distances:[[0,-1],[3,0]]}));
 await assert.rejects(requestRoadTable('https://router.example.test/',points,badDistance as typeof fetch),/Invalid road distance/);
 const fail=async()=>new Response('offline',{status:503});
 await assert.rejects(requestRoadTable('https://router.example.test/',points,fail as typeof fetch),/unavailable/);
});
