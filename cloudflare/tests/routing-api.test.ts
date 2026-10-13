import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoutingApi} from '../src/routing-api';
import type {Env} from '../src/auth';

const now=new Date('2026-10-13T12:00:00.000Z');
const config:Partial<Env>={
 OIDC_ISSUER:'https://identity.example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:'https://identity.example.test/jwks',
 ROAD_ROUTING_PROVIDER_ENABLED:'true',ROAD_ROUTING_POLICY_PUBLIC:'true',ROAD_ROUTING_NOTICE_VERSION:'notice-1',
 ROAD_ROUTING_TERMS_URL:'https://greencollar.example/terms',ROAD_ROUTING_PRIVACY_URL:'https://greencollar.example/privacy',
 ROAD_ROUTING_RATE_CARD_MONTH:'2026-10',ROAD_ROUTING_RATE_REVIEWED_ON:'2026-10-13',ROAD_ROUTING_RATE_MICRO_USD_PER_1000:'5000000',
 GOOGLE_ROUTES_API_KEY:'test-google-api-key-123'
};

function fixture({enabled=1,noticeVersion='notice-1',acknowledged=1,role='worker' as 'owner'|'admin'|'worker'}={}){
 const sql:string[]=[];let writes=0;
 const DB={prepare(query:string){sql.push(query);return {bind(..._values:unknown[]){return {
  async first(){
   if(query.includes('business_routing_settings'))return {enabled,notice_version:noticeVersion};
   if(query.includes('routing_notice_acknowledgements'))return acknowledged?{acknowledged:1}:null;
   return null;
  },
  async run(){writes++;return {success:true};}
 };}};}} as unknown as D1Database;
 return {env:{...config,DB} as Env,sql,writes:()=>writes};
}
const post=(path:string,body:unknown)=>new Request('https://api.example.test'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const points=[{id:'start',lat:29,lon:-80.9},{id:'stop',lat:29.07,lon:-80.92}];

test('routing endpoints fail closed before DB access when authentication is unconfigured',async()=>{
 const env={get DB(){throw new Error('Database must not be used');}} as unknown as Env;
 const api=createRoutingApi();
 const response=await api(new Request('https://api.example.test/v1/routing/settings?business_id=business-a'),env);
 assert.equal(response.status,503);
});

test('an unset activation configuration prevents reservation and provider calls',async()=>{
 const f=fixture();let reservations=0,providerCalls=0;
 const env={...f.env,ROAD_ROUTING_PROVIDER_ENABLED:undefined,GOOGLE_ROUTES_API_KEY:undefined} as Env;
 const api=createRoutingApi({authenticate:async()=> 'operator-1',membership:async()=> 'worker',now:()=>now,
  reserve:async()=>{reservations++;return true;},provider:async()=>{providerCalls++;return {durations:[[0,60],[70,0]]};}});
 const response=await api(post('/v1/routing/matrix',{businessId:'business-a',points}),env);
 assert.equal(response.status,503);assert.equal(reservations,0);assert.equal(providerCalls,0);
});

test('operator must acknowledge the current location notice before a route reservation',async()=>{
 const f=fixture({acknowledged:0});let reservations=0,providerCalls=0;
 const api=createRoutingApi({authenticate:async()=> 'operator-1',membership:async()=> 'worker',now:()=>now,
  reserve:async()=>{reservations++;return true;},provider:async()=>{providerCalls++;return {durations:[[0,60],[70,0]]};}});
 const response=await api(post('/v1/routing/matrix',{businessId:'business-a',points}),f.env);
 assert.equal(response.status,428);assert.equal(reservations,0);assert.equal(providerCalls,0);
});

test('monthly stop blocks the provider and returns the manual fallback',async()=>{
 const f=fixture();let providerCalls=0,reserved=0;
 const api=createRoutingApi({authenticate:async()=> 'operator-1',membership:async()=> 'worker',now:()=>now,
  reserve:async()=>{reserved++;return false;},provider:async()=>{providerCalls++;return {durations:[[0,60],[70,0]]};}});
 const response=await api(post('/v1/routing/matrix',{businessId:'business-a',points}),f.env);
 assert.equal(response.status,429);assert.equal(reserved,1);assert.equal(providerCalls,0);
 assert.equal((await response.json() as {manualFallback:boolean}).manualFallback,true);
});

test('successful estimates are returned ephemerally and admin-only settings stay protected',async()=>{
 const f=fixture();let providerCalls=0;
 const api=createRoutingApi({authenticate:async()=> 'operator-1',membership:async()=> 'worker',now:()=>now,
  reserve:async()=>true,provider:async()=>{providerCalls++;return {durations:[[0,60],[70,0]]};}});
 const response=await api(post('/v1/routing/matrix',{businessId:'business-a',points}),f.env);
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual((await response.json() as {durations:number[][]}).durations,[[0,60],[70,0]]);
 assert.equal(providerCalls,1);assert.equal(f.writes(),0);
 const adminResponse=await api(post('/v1/routing/settings',{businessId:'business-a',enabled:true,noticeAcknowledged:true,noticeVersion:'notice-1'}),f.env);
 assert.equal(adminResponse.status,403);assert.equal(f.writes(),0);
});

test('admin activation requires a persisted notice acknowledgment, while disable works without provider setup',async()=>{
 const unacknowledged=fixture({acknowledged:0});
 const adminApi=createRoutingApi({authenticate:async()=> 'admin-1',membership:async()=> 'admin',now:()=>now,
  reserve:async()=>true,provider:async()=>({durations:[[0,0],[0,0]]})});
 const enable=await adminApi(post('/v1/routing/settings',{businessId:'business-a',enabled:true,noticeAcknowledged:true,noticeVersion:'notice-1'}),unacknowledged.env);
 assert.equal(enable.status,428);assert.equal(unacknowledged.writes(),0);
 const f=fixture();
 const env={...f.env,ROAD_ROUTING_PROVIDER_ENABLED:undefined,GOOGLE_ROUTES_API_KEY:undefined} as Env;
 const disable=await adminApi(post('/v1/routing/settings',{businessId:'business-a',enabled:false,noticeAcknowledged:false,noticeVersion:'notice-1'}),env);
 assert.equal(disable.status,200);assert.equal((await disable.json() as {enabled:boolean}).enabled,false);assert.equal(f.writes(),1);
});


test('settings distinguish provider readiness, business activation, and this operator acknowledgment',async()=>{
 const f=fixture({enabled:1,acknowledged:0});
 const api=createRoutingApi({authenticate:async()=> 'worker-1',membership:async()=> 'worker',now:()=>now});
 const disabledEnv={...f.env,ROAD_ROUTING_PROVIDER_ENABLED:undefined,GOOGLE_ROUTES_API_KEY:undefined} as Env;
 const response=await api(new Request('https://api.example.test/v1/routing/settings?business_id=business-a'),disabledEnv);
 assert.equal(response.status,200);
 const state=await response.json() as {available:boolean;enabled:boolean;businessEnabled:boolean;noticeAcknowledged:boolean;termsUrl:string|null;manualFallback:boolean};
 assert.equal(state.available,false);
 assert.equal(state.enabled,false);
 assert.equal(state.businessEnabled,true);
 assert.equal(state.noticeAcknowledged,false);
 assert.equal(state.termsUrl,'https://greencollar.example/terms');
 assert.equal(state.manualFallback,true);
});


test('a stale stored business toggle remains visible so an admin can turn it off',async()=>{
 const f=fixture({enabled:1,noticeVersion:'old-notice',acknowledged:0});
 const api=createRoutingApi({authenticate:async()=> 'admin-1',membership:async()=> 'admin',now:()=>now});
 const env={...f.env,ROAD_ROUTING_NOTICE_VERSION:''} as Env;
 const response=await api(new Request('https://api.example.test/v1/routing/settings?business_id=business-a'),env);
 const state=await response.json() as {available:boolean;enabled:boolean;businessEnabled:boolean;noticeVersion:string|null};
 assert.equal(state.available,false);
 assert.equal(state.enabled,false);
 assert.equal(state.businessEnabled,true);
 assert.equal(state.noticeVersion,null);
});
