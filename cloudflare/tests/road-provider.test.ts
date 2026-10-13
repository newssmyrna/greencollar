import test from 'node:test';
import assert from 'node:assert/strict';
import {requestRoadTable,requestGoogleRouteTable} from '../src/road-provider';
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
 await assert.rejects(requestRoadTable('https://router.example.test/',points,invalid as typeof fetch),/invalid matrix/);
 const fail=async()=>new Response('offline',{status:503});
 await assert.rejects(requestRoadTable('https://router.example.test/',points,fail as typeof fetch),/unavailable/);
});

test('Google adapter sends coordinates only and maps unordered matrix elements by index',async()=>{
 let sentUrl='',sentInit:RequestInit|undefined;
 const fake=async(input:RequestInfo|URL,init?:RequestInit)=>{
  sentUrl=String(input);sentInit=init;
  return new Response(JSON.stringify([
   {originIndex:1,destinationIndex:0,duration:'75.25s',condition:'ROUTE_EXISTS',status:{code:0}},
   {originIndex:0,destinationIndex:1,duration:'60s',condition:'ROUTE_EXISTS',status:{code:0}},
   {originIndex:1,destinationIndex:1,duration:'0s',condition:'ROUTE_EXISTS',status:{code:0}},
   {originIndex:0,destinationIndex:0,duration:'0s',condition:'ROUTE_EXISTS',status:{code:0}}
  ]),{status:200});
 };
 const result=await requestGoogleRouteTable(points,'test-google-api-key-123',fake as typeof fetch);
 assert.equal(sentUrl,'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix');
 const headers=new Headers(sentInit?.headers);
 assert.equal(headers.get('X-Goog-Api-Key'),'test-google-api-key-123');
 assert.equal(headers.get('X-Goog-FieldMask'),'originIndex,destinationIndex,duration,status,condition');
 const body=JSON.parse(String(sentInit?.body)) as Record<string,unknown>;
 assert.equal(body.travelMode,'DRIVE');assert.equal(body.routingPreference,'TRAFFIC_UNAWARE');
 assert.equal(JSON.stringify(body).includes('start'),false);
 assert.deepEqual(result.durations,[[0,60],[75.25,0]]);
});

test('Google adapter preserves unreachable cells and rejects incomplete, duplicate, or oversized results',async()=>{
 const unreachable=async()=>new Response(JSON.stringify([
  {originIndex:0,destinationIndex:0,duration:'0s',condition:'ROUTE_EXISTS'},
  {originIndex:0,destinationIndex:1,condition:'ROUTE_NOT_FOUND'},
  {originIndex:1,destinationIndex:0,duration:'5s',condition:'ROUTE_EXISTS'},
  {originIndex:1,destinationIndex:1,duration:'0s',condition:'ROUTE_EXISTS'}
 ]));
 assert.equal((await requestGoogleRouteTable(points,'test-google-api-key-123',unreachable as typeof fetch)).durations[0][1],null);
 const incomplete=async()=>new Response(JSON.stringify([{originIndex:0,destinationIndex:0,condition:'ROUTE_EXISTS',duration:'0s'}]));
 await assert.rejects(requestGoogleRouteTable(points,'test-google-api-key-123',incomplete as typeof fetch),/Invalid routing matrix/);
 const duplicate=async()=>new Response(JSON.stringify(Array.from({length:4},()=>({originIndex:0,destinationIndex:0,condition:'ROUTE_EXISTS',duration:'0s'}))));
 await assert.rejects(requestGoogleRouteTable(points,'test-google-api-key-123',duplicate as typeof fetch),/Duplicate routing element/);
 const oversized=async()=>new Response('[]',{headers:{'content-length':'262145'}});
 await assert.rejects(requestGoogleRouteTable(points,'test-google-api-key-123',oversized as typeof fetch),/Invalid routing response/);
});
