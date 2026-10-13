import test from 'node:test';
import assert from 'node:assert/strict';
import {createServiceAgreementApi,serviceAgreementApi} from '../src/service-agreement-api';
import type {Env} from '../src/auth';
const metadata={OIDC_ISSUER:'https://identity.example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:'https://identity.example.test/jwks'};
const input={locationId:'location-a',serviceName:'Synthetic service',rateCents:7500,estimatedMinutes:45,startsOn:'2026-10-12',frequency:'weekly'};
function fixture(role:'owner'|'admin'|'worker'|null='owner',locationAllowed=true){
 const queries:Array<{sql:string;values:unknown[]}>=[];
 const DB={prepare(sql:string){return {bind(...values:unknown[]){
  queries.push({sql,values});return {
   async first(){
    if(sql.includes('business_memberships'))return role&&values[0]==='business-a'?{role}:null;
    if(sql.includes('FROM customers'))return {id:'customer-a'};
    return locationAllowed&&values.join('|')==='location-a|business-a|customer-a'?{id:'location-a',address:'Synthetic street',preferences:null}:null;
   },
   async all(){return {results:[]};},
   async run(){return {meta:{changes:1}};}
  };
 }};}};
 return {env:{...metadata,DB} as unknown as Env,queries};
}
const api=createServiceAgreementApi(async()=> 'verified-user');
function req(method='POST',body=JSON.stringify(input),business='business-a'){
 const url=new URL('https://api.example.test/v1/agreements?business_id='+business+'&customer_id=customer-a');
 return {url,request:new Request(url,{method,...(method==='POST'?{body}:{})})};
}
test('production endpoint fails closed without configured verified identity',async()=>{
 const r=req();const noDb={get DB(){throw Error('unexpected DB');}} as unknown as Env;
 assert.equal((await serviceAgreementApi(r.request,noDb,r.url)).status,503);
 const missing={...metadata,get DB(){throw Error('unexpected DB');}} as unknown as Env;
 assert.equal((await serviceAgreementApi(r.request,missing,r.url)).status,401);
});
test('business membership and location/customer relationship are required',async()=>{
 const other=req('POST',JSON.stringify(input),'business-b');assert.equal((await api(other.request,fixture().env,other.url)).status,403);
 const r=req();const f=fixture('owner',false);
 assert.equal((await api(r.request,f.env,r.url)).status,404);
 assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')),false);
});
test('workers may read but cannot create schedules',async()=>{
 const r=req();assert.equal((await api(r.request,fixture('worker').env,r.url)).status,403);
 const read=req('GET');assert.equal((await api(read.request,fixture('worker').env,read.url)).status,200);
});
test('owner saves a due-queue-compatible agreement with SQL ownership predicate',async()=>{
 const f=fixture();const r=req();const response=await api(r.request,f.env,r.url);
 assert.equal(response.status,201);
 const body=await response.json() as {agreement:{id:string;service_name:string;rate_cents:number;frequency:string;active:number}};
 assert.equal(body.agreement.service_name,input.serviceName);assert.equal(body.agreement.rate_cents,7500);
 assert.equal(body.agreement.frequency,'weekly');assert.equal(body.agreement.active,1);
 const insertion=f.queries.find(q=>q.sql.startsWith('INSERT'))!;
 assert.match(insertion.sql,/WHERE EXISTS.*l.id=\? AND l.business_id=\? AND l.customer_id=\?/);
 assert.deepEqual(insertion.values.slice(-3),['location-a','business-a','customer-a']);
});
test('rejects invalid recurrence and bounded-body violations without inserting',async()=>{
 for(const [body,status] of [
  [JSON.stringify({...input,frequency:'custom',intervalDays:0}),400],
  [JSON.stringify({...input,serviceName:'x'.repeat(9000)}),413],
  ['{',400]
 ] as const){
  const f=fixture();const r=req('POST',body);
  assert.equal((await api(r.request,f.env,r.url)).status,status);
  assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')),false);
 }
});

test('appointment minutes are bound to the correct columns and returned, including midnight',async()=>{
 for(const timing of [
  {preferredStartMinute:540,preferredFinishMinute:660,fixedStartMinute:600},
  {preferredStartMinute:0,preferredFinishMinute:60,fixedStartMinute:0}
 ]){
  const f=fixture();const r=req('POST',JSON.stringify({...input,...timing}));
  const response=await api(r.request,f.env,r.url);assert.equal(response.status,201);
  const body=await response.json() as {agreement:{preferred_start_minute:number;preferred_finish_minute:number;fixed_start_minute:number}};
  assert.equal(body.agreement.preferred_start_minute,timing.preferredStartMinute);
  assert.equal(body.agreement.preferred_finish_minute,timing.preferredFinishMinute);
  assert.equal(body.agreement.fixed_start_minute,timing.fixedStartMinute);
  const insertion=f.queries.find(q=>q.sql.startsWith('INSERT'))!;
  assert.match(insertion.sql,/interval_days,preferred_start_minute,preferred_finish_minute,fixed_start_minute,active/);
  assert.equal((insertion.sql.match(/\?/g)??[]).length,insertion.values.length);
  assert.deepEqual(insertion.values.slice(11,14),[timing.preferredStartMinute,timing.preferredFinishMinute,timing.fixedStartMinute]);
  assert.deepEqual(insertion.values.slice(-3),['location-a','business-a','customer-a']);
 }
});

test('inconsistent, fractional and out-of-range appointment constraints reject before insertion',async()=>{
 for(const timing of [
  {fixedStartMinute:1440},{fixedStartMinute:1.5},{fixedStartMinute:null},
  {preferredStartMinute:600,preferredFinishMinute:630},
  {preferredStartMinute:600,fixedStartMinute:599},
  {fixedStartMinute:1439},{preferredFinishMinute:0}
 ]){
  const f=fixture();const r=req('POST',JSON.stringify({...input,...timing}));
  assert.equal((await api(r.request,f.env,r.url)).status,400);
  assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')),false);
 }
});

test('optional appointment fields preserve flexible schedules and existing authorization boundaries',async()=>{
 const f=fixture();const r=req();const response=await api(r.request,f.env,r.url);
 const body=await response.json() as {agreement:{preferred_start_minute:null;preferred_finish_minute:null;fixed_start_minute:null}};
 assert.equal(body.agreement.preferred_start_minute,null);
 assert.equal(body.agreement.preferred_finish_minute,null);
 assert.equal(body.agreement.fixed_start_minute,null);
 assert.deepEqual(f.queries.find(q=>q.sql.startsWith('INSERT'))!.values.slice(11,14),[null,null,null]);
 for(const denied of [fixture('worker'),fixture(null),fixture('owner',false)]){
  const request=req('POST',JSON.stringify({...input,fixedStartMinute:600}));
  assert.ok([403,404].includes((await api(request.request,denied.env,request.url)).status));
  assert.equal(denied.queries.some(q=>q.sql.startsWith('INSERT')),false);
 }
});
