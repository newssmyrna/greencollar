import test from 'node:test';
import assert from 'node:assert/strict';
import {exportJWK,generateKeyPair,SignJWT} from 'jose';
import {locationsApi} from '../src/locations-api';
import {agreementsApi} from '../src/agreements-api';
import type {Env} from '../src/auth';

async function signedEnv(role:'owner'|'admin'|'worker'='owner',changes=1){
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const jwk=await exportJWK(publicKey);Object.assign(jwk,{kid:'location-api-key',alg:'RS256',use:'sig'});
 const jwksUrl='https://location-validation.example.test/'+crypto.randomUUID()+'/jwks.json';
 const token=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'location-api-key'})
  .setIssuer('https://clerk.validation.example.test').setAudience('greencollar-api')
  .setSubject('user_123').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json'}});
 const queries:string[]=[];const writes:string[]=[];
 const db={
  prepare(sql:string){queries.push(sql);return {bind(..._values:unknown[]){
   return {
    async first(){return sql.includes('business_memberships')?{role}:null;},
    async all(){return {results:[]};},
    async run(){writes.push(sql);return {meta:{changes}};}
   };
  }};}
 };
 return {token,env:{DB:db,OIDC_ISSUER:'https://clerk.validation.example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:jwksUrl} as unknown as Env,
  queries,writes,restore:()=>{globalThis.fetch=originalFetch;}};
}
const customerId='00000000-0000-4000-8000-000000000001';
const locationId='00000000-0000-4000-8000-000000000002';
const request=(path:string,token:string,body:unknown)=>new Request('https://api.example.test'+path,{
 method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)
});
const locationBody={customerId,address:'123 Main Street, Edgewater, FL',preferences:'Gate code in customer file'};
const agreementBody={customerId,locationId,serviceName:'Lawn maintenance',rateCents:6500,estimatedMinutes:45,
 startsOn:'2026-10-12',frequency:'weekly',daysOfWeek:[1,4],preferredStartMinute:480,preferredFinishMinute:720};

test('location creation is tenant-scoped and requires a customer in the same business',async()=>{
 const auth=await signedEnv('owner',1);
 try{
  const response=await locationsApi(request('/v1/locations?business_id=business_1',auth.token,locationBody),auth.env,new URL('https://api.example.test/v1/locations?business_id=business_1'));
  assert.equal(response.status,201);
  assert.match(auth.queries.find(q=>q.includes('INSERT INTO service_locations'))??'',/SELECT \?,business_id,id,\?,\? FROM customers WHERE business_id=\? AND id=\?/);
  assert.equal(auth.writes.length,1);
 }finally{auth.restore();}
});

test('location creation does not write when the customer is outside the business',async()=>{
 const auth=await signedEnv('owner',0);
 try{
  const url=new URL('https://api.example.test/v1/locations?business_id=business_1');
  const response=await locationsApi(request('/v1/locations?business_id=business_1',auth.token,locationBody),auth.env,url);
  assert.equal(response.status,404);
  assert.equal(auth.writes.length,1);
 }finally{auth.restore();}
});

test('malformed location data is rejected before writes',async()=>{
 const auth=await signedEnv();
 try{
  const url=new URL('https://api.example.test/v1/locations?business_id=business_1');
  const response=await locationsApi(request('/v1/locations?business_id=business_1',auth.token,{...locationBody,address:' '.repeat(301)}),auth.env,url);
  assert.equal(response.status,400);
  assert.equal(auth.writes.length,0);
 }finally{auth.restore();}
});

test('workers can read locations but cannot create them',async()=>{
 const auth=await signedEnv('worker');
 try{
  const url=new URL('https://api.example.test/v1/locations?business_id=business_1');
  const response=await locationsApi(request('/v1/locations?business_id=business_1',auth.token,locationBody),auth.env,url);
  assert.equal(response.status,403);
  assert.equal(auth.writes.length,0);
 }finally{auth.restore();}
});

test('agreement creation validates recurrence and links customer, location, and business in one insert',async()=>{
 const auth=await signedEnv('admin',1);
 try{
  const url=new URL('https://api.example.test/v1/agreements?business_id=business_1');
  const response=await agreementsApi(request('/v1/agreements?business_id=business_1',auth.token,agreementBody),auth.env,url);
  assert.equal(response.status,201);
  assert.match(auth.queries.find(q=>q.includes('INSERT INTO service_agreements'))??'',/JOIN service_locations l[\s\S]+l\.customer_id=c\.id AND l\.business_id=c\.business_id[\s\S]+c\.business_id=\?/);
  assert.equal(auth.writes.length,1);
 }finally{auth.restore();}
});

test('invalid agreement recurrence is rejected before database writes',async()=>{
 const auth=await signedEnv();
 try{
  const url=new URL('https://api.example.test/v1/agreements?business_id=business_1');
  const body={...agreementBody,frequency:'custom',intervalDays:0,daysOfWeek:[1]};
  const response=await agreementsApi(request('/v1/agreements?business_id=business_1',auth.token,body),auth.env,url);
  assert.equal(response.status,400);
  assert.equal(auth.writes.length,0);
 }finally{auth.restore();}
});

test('reversed agreement time windows are rejected',async()=>{
 const auth=await signedEnv();
 try{
  const url=new URL('https://api.example.test/v1/agreements?business_id=business_1');
  const response=await agreementsApi(request('/v1/agreements?business_id=business_1',auth.token,{...agreementBody,preferredStartMinute:800,preferredFinishMinute:700}),auth.env,url);
  assert.equal(response.status,400);
  assert.equal((await response.json() as {error:string}).error,'invalid_time_window');
  assert.equal(auth.writes.length,0);
 }finally{auth.restore();}
});

test('workers cannot create recurring agreements',async()=>{
 const auth=await signedEnv('worker');
 try{
  const url=new URL('https://api.example.test/v1/agreements?business_id=business_1');
  const response=await agreementsApi(request('/v1/agreements?business_id=business_1',auth.token,agreementBody),auth.env,url);
  assert.equal(response.status,403);
  assert.equal(auth.writes.length,0);
 }finally{auth.restore();}
});
