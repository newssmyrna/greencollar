import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationConfirmationApi} from '../src/location-confirmation-api';
import type {Env} from '../src/auth';
const meta={OIDC_ISSUER:'https://example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:'https://example.test/jwks'};
const payload={eventId:'evt-1',businessId:'business-a',agreementId:'agreement-a',date:'2026-10-12',kind:'arrival',source:'gps_suggestion',proximity:'within_radius',confirmedAt:1791763200000};
function fixture(role:'owner'|'admin'|'worker'|null='worker',existing:Record<string,unknown>|null=null,rows:Record<string,unknown>[]=[]){
 const queries:Array<{sql:string;values:unknown[]}>=[];
 const DB={prepare(sql:string){return {bind(...values:unknown[]){queries.push({sql,values});return {
  async first(){
   if(sql.includes('business_memberships'))return role?{role}:null;
   if(sql.startsWith('SELECT id FROM service_agreements'))return {id:'agreement-a'};
   if(sql.startsWith('INSERT INTO location_confirmations'))return existing?null:{id:'evt-1'};
   if(sql.includes('FROM location_confirmations WHERE id=?'))return existing;
   return null;
  },
  async all(){return {results:rows};}
 };}};}};
 return {env:{...meta,DB} as unknown as Env,queries};
}
const api=createLocationConfirmationApi(async()=> 'verified-subject');
const request=(method:'GET'|'POST'='POST',value:unknown=payload)=>new Request('https://api.example.test/v1/location-confirmations?business_id=business-a'+(method==='GET'?'&date=2026-10-12':''),{method,headers:{'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(value)}:{})});
test('requires configured and verified identity before database access',async()=>{
 const denied=createLocationConfirmationApi(async()=>null);
 assert.equal((await denied(request(),{...meta,get DB(){throw Error('unexpected database access');}} as unknown as Env)).status,401);
});
test('requires membership and validates event fields before writing',async()=>{
 const none=fixture(null);assert.equal((await api(request(),none.env)).status,403);
 const f=fixture();assert.equal((await api(request('POST',{...payload,date:'2026-02-30'}),f.env)).status,400);
 assert.equal((await api(request('POST',{...payload,proximity:'outside_radius'}),f.env)).status,400);
 assert.equal((await api(request('POST',{...payload,kind:'departure'}),f.env)).status,400);
 assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT INTO location_confirmations')),false);
});
test('accepts a tenant-scoped worker confirmation and stores no exact coordinates',async()=>{
 const f=fixture();const response=await api(request(),f.env);
 assert.equal(response.status,201);assert.deepEqual(await response.json(),{eventId:'evt-1',duplicate:false});
 const write=f.queries.find(q=>q.sql.startsWith('INSERT INTO location_confirmations'))!;
 assert.match(write.sql,/ON CONFLICT\(id\) DO NOTHING RETURNING id/);
 assert.deepEqual(write.values,['evt-1','business-a','agreement-a','2026-10-12','arrival','verified-subject',payload.confirmedAt,'gps_suggestion','within_radius',null]);
 assert.equal(JSON.stringify(write.values).includes('latitude'),false);
});
test('manual event requires a short reason',async()=>{
 const f=fixture();
 assert.equal((await api(request('POST',{...payload,source:'manual',proximity:'manual'}),f.env)).status,400);
 const response=await api(request('POST',{...payload,source:'manual',proximity:'manual',manualReason:'Gate was open'}),f.env);
 assert.equal(response.status,201);
 const reason=await api(request('POST',{...payload,source:'manual',proximity:'manual',manualReason:'x'.repeat(281)}),f.env);
 assert.equal(reason.status,400);
});
test('idempotent retries return success only for the exact same event',async()=>{
 const existing={id:'evt-1',business_id:'business-a',agreement_id:'agreement-a',service_date:'2026-10-12',kind:'arrival',operator_subject:'verified-subject',confirmed_at:payload.confirmedAt,source:'gps_suggestion',proximity:'within_radius',manual_reason:null,created_at:'2026-10-12'};
 const same=fixture('worker',existing);
 assert.equal((await api(request(),same.env)).status,200);
 assert.deepEqual(await (await api(request(),same.env)).json(),{eventId:'evt-1',duplicate:true});
 const clash=fixture('worker',{...existing,kind:'departure'});
 assert.equal((await api(request(),clash.env)).status,409);
});

test('GET paginates with an exclusive timestamp and ID cursor',async()=>{
 const rows=Array.from({length:51},(_,i)=>({id:'evt-'+String(i).padStart(2,'0'),agreement_id:'agreement-a',service_date:'2026-10-12',kind:'arrival',operator_subject:'verified-subject',confirmed_at:100,source:'gps_suggestion',proximity:'within_radius',manual_reason:null,created_at:'2026-10-12T10:00:00Z'}));
 const f=fixture('worker',null,rows);
 const next=new Request('https://api.example.test/v1/location-confirmations?business_id=business-a&date=2026-10-12&before=200.evt-new');
 const response=await api(next,f.env);assert.equal(response.status,200);
 const body=await response.json() as {events:unknown[];hasMore:boolean;nextCursor:string|null};
 assert.equal(body.events.length,50);assert.equal(body.hasMore,true);assert.equal(body.nextCursor,'100.evt-49');
 const listing=f.queries.find(q=>q.sql.includes('FROM location_confirmations WHERE business_id=? AND service_date=?'))!;
 assert.match(listing.sql,/confirmed_at<\\? OR \\(confirmed_at=\\? AND id<\\?\\)/);
 assert.deepEqual(listing.values,['business-a','2026-10-12',200,200,'evt-new']);
 const invalid=new Request('https://api.example.test/v1/location-confirmations?business_id=business-a&date=2026-10-12&before=bad');
 assert.equal((await api(invalid,f.env)).status,400);
});

test('GET lists only the requested business day and rejects invalid dates',async()=>{
 const f=fixture();assert.equal((await api(request('GET'),f.env)).status,200);
 const listing=f.queries.find(q=>q.sql.includes('FROM location_confirmations WHERE business_id=? AND service_date=?'))!;
 assert.match(listing.sql,/ORDER BY confirmed_at DESC,id DESC LIMIT 51/);
 assert.deepEqual(await (await api(request('GET'),f.env)).json(),{events:[],hasMore:false,nextCursor:null});
 const invalid=new Request('https://api.example.test/v1/location-confirmations?business_id=business-a&date=2026-02-30');
 assert.equal((await api(invalid,f.env)).status,400);
});
