import test from 'node:test';
import assert from 'node:assert/strict';
import {requestMapboxRoadTable} from '../src/mapbox-road-provider';
const points=[{id:'start',lon:-80.9,lat:29},{id:'stop',lon:-80.92,lat:29.07}];
test('Mapbox adapter requests driving durations and distances server-side',async()=>{
 let requestedUrl='';
 const fake=async(request:RequestInfo|URL,options?:RequestInit)=>{
  requestedUrl=String(request);assert.equal(options?.method,'GET');
  return new Response(JSON.stringify({code:'Ok',durations:[[0,641],[777,0]],distances:[[0,3218.688],[4828.032,0]]}));
 };
 const result=await requestMapboxRoadTable('server-secret',points,fake as typeof fetch);
 const url=new URL(requestedUrl);
 assert.equal(url.origin,'https://api.mapbox.com');
 assert.equal(url.pathname,'/directions-matrix/v1/mapbox/driving/-80.9,29;-80.92,29.07');
 assert.equal(url.searchParams.get('annotations'),'duration,distance');
 assert.equal(url.searchParams.get('access_token'),'server-secret');
 assert.deepEqual(result.durations,[[0,641],[777,0]]);
 assert.deepEqual(result.distances,[[0,3218.688],[4828.032,0]]);
});
test('Mapbox adapter rejects missing credentials and over-limit matrices before fetch',async()=>{
 const never=async()=>{throw new Error('No fetch expected')};
 await assert.rejects(requestMapboxRoadTable(' ',points,never as typeof fetch),/token is required/);
 const tooMany=Array.from({length:26},(_,i)=>({id:String(i),lat:29,lon:-80}));
 await assert.rejects(requestMapboxRoadTable('token',tooMany,never as typeof fetch),/2–25/);
});
test('unreachable and malformed route entries remain explicit',async()=>{
 const unreachable=async()=>new Response(JSON.stringify({code:'Ok',durations:[[0,null],[1,0]],distances:[[0,null],[10,0]]}));
 assert.equal((await requestMapboxRoadTable('token',points,unreachable as typeof fetch)).distances[0][1],null);
 const malformed=async()=>new Response(JSON.stringify({code:'Ok',durations:[[0,-1],[1,0]],distances:[[0,10],[10,0]]}));
 await assert.rejects(requestMapboxRoadTable('token',points,malformed as typeof fetch),/Invalid Mapbox duration/);
});
