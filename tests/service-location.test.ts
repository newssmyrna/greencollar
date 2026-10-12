import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {serviceLocationInput} from '../src/domain/service-location';
import {createServiceLocation,listServiceLocations} from '../src/data/service-location-api';
const originalFetch=globalThis.fetch;afterEach(()=>{globalThis.fetch=originalFetch;});
test('address input trims text and rejects missing or excessive values',()=>{
 assert.deepEqual(serviceLocationInput({address:' Sample street ',preferences:' Side gate '}),{address:'Sample street',preferences:'Side gate'});
 for(const value of [null,[],{address:''},{address:'x'.repeat(501)},{address:'x',preferences:123},{address:'x',preferences:'x'.repeat(2001)}])
   assert.throws(()=>serviceLocationInput(value));
});
test('customer location request carries the exact business and customer context',async()=>{
 let target='';let sent:RequestInit|undefined;
 globalThis.fetch=async(url,init)=>{target=String(url);sent=init;return new Response(JSON.stringify({location:{id:'location-1',customer_id:'customer-a',address:'Sample street',preferences:null,lat:null,lon:null}}),{status:201});};
 const saved=await createServiceLocation('https://api.example.test','business-a','customer-a','token',{address:' Sample street '});
 assert.equal(saved.id,'location-1');
 assert.equal(target,'https://api.example.test/v1/locations?business_id=business-a&customer_id=customer-a');
 assert.equal((sent?.headers as Record<string,string>).Authorization,'Bearer token');
 assert.deepEqual(JSON.parse(String(sent?.body)),{address:'Sample street'});
});
test('client preserves a failed save and partial list as explicit states',async()=>{
 globalThis.fetch=async()=>new Response('{}',{status:403});
 await assert.rejects(()=>createServiceLocation('https://api.example.test','business-a','customer-a','token',{address:'Sample street'}),/403/);
 globalThis.fetch=async()=>new Response(JSON.stringify({locations:[],hasMore:true}));
 assert.deepEqual(await listServiceLocations('https://api.example.test','business-a','customer-a','token'),{locations:[],hasMore:true});
 await assert.rejects(()=>listServiceLocations('http://api.example.test','business-a','customer-a','token'),/HTTPS/);
});
