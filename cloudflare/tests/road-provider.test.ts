import test from 'node:test';
import assert from 'node:assert/strict';
import {requestRoadTable} from '../src/road-provider';
const points=[{id:'start',lon:-80.9,lat:29},{id:'stop',lon:-80.92,lat:29.07}];
test('routing adapter obtains validated provider durations',async()=>{
 let called='';
 const fake=async (request:RequestInfo|URL, options?:RequestInit)=>{
   called=String(request);
   assert.equal(options?.method,'GET');
   return new Response(JSON.stringify({code:'Ok',durations:[[0,641],[777,0]]}),{status:200});
 };
 const result=await requestRoadTable('https://router.example.test/',points,fake as typeof fetch);
 assert.deepEqual(result.durations,[[0,641],[777,0]]);
 assert.equal(called,'https://router.example.test/table/v1/driving/-80.9,29;-80.92,29.07?annotations=duration');
});
test('unreachable routes remain explicitly null',async()=>{
 const fake=async()=>new Response(JSON.stringify({code:'Ok',durations:[[0,null],[500,0]]}));
 assert.equal((await requestRoadTable('https://router.example.test/',points,fake as typeof fetch)).durations[0][1],null);
});
test('rejects unsafe or malformed provider configuration before network calls',async()=>{
 const never=async()=>{throw new Error('No fetch expected')};
 await assert.rejects(requestRoadTable('http://router.example.test/',points,never as typeof fetch),/Invalid routing server/);
 await assert.rejects(requestRoadTable('https://router.example.test:443/path',points,never as typeof fetch),/Invalid routing server/);
 await assert.rejects(requestRoadTable('https://router.example.test/',[points[0],points[0]],never as typeof fetch),/Duplicate node/);
});
test('rejects bad provider response rather than fabricating travel times',async()=>{
 const invalid=async()=>new Response(JSON.stringify({code:'Ok',durations:[[0,3]]}));
 await assert.rejects(requestRoadTable('https://router.example.test/',points,invalid as typeof fetch),/matrix shape/);
 const fail=async()=>new Response('offline',{status:503});
 await assert.rejects(requestRoadTable('https://router.example.test/',points,fail as typeof fetch),/unavailable/);
});
