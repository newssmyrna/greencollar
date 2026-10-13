import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherInterruptionApi} from '../src/weather-interruption-api';
import type {Env} from '../src/auth';

const metadata={OIDC_ISSUER:'https://example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:'https://example.test/jwks'};
const payload={businessId:'business-a',eventId:'event-1',workDate:'2026-10-13',reportedAt:'2026-10-13T15:00:00.000Z',reason:'rain',
 completedVisitIds:['agreement-a:2026-10-13'],remainingVisitIds:['agreement-b:2026-10-13']};
const rows=[{id:'agreement-a'},{id:'agreement-b'}];
const stored={business_id:'business-a',event_id:'event-1',work_date:'2026-10-13',reported_at:payload.reportedAt,
 reporter_subject:'verified-worker',reason:'rain',completed_visit_ids:JSON.stringify(payload.completedVisitIds),
 remaining_visit_ids:JSON.stringify(payload.remainingVisitIds),created_at:'2026-10-13 15:00:00'};
function fixture(role:'owner'|'admin'|'worker'|null='worker',agreements=rows){
 const queries:Array<{sql:string;values:unknown[]}>=[],writes:Array<string>=[];
 const DB={prepare(sql:string){return {bind(...values:unknown[]){queries.push({sql,values});return {
  async first(){if(sql.includes('business_memberships'))return role?{role}:null;if(sql.includes('FROM weather_interruption_events'))return stored;return null;},
  async all(){if(sql.startsWith('SELECT id FROM service_agreements'))return {results:agreements};if(sql.includes('FROM weather_interruption_events'))return {results:[stored]};return {results:[]};},
  async run(){writes.push(sql);return {success:true};}
 };}};}};
 return {env:{...metadata,DB} as unknown as Env,queries,writes};
}
const api=createWeatherInterruptionApi(async()=> 'verified-worker');
const post=(value:unknown=payload)=>new Request('https://api.example.test/v1/weather-interruptions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
const get=()=>new Request('https://api.example.test/v1/weather-interruptions?business_id=business-a&date=2026-10-13');

test('field workers and owners can report; reports do not mutate visits',async()=>{
 for(const role of ['worker','owner'] as const){
  const f=fixture(role),response=await api(post(),f.env,new URL('https://api.example.test/v1/weather-interruptions'));
  assert.equal(response.status,201);
  const body=await response.json() as {interruption:{remainingVisitIds:string[]}};
  assert.deepEqual(body.interruption.remainingVisitIds,payload.remainingVisitIds);
  assert.equal(f.writes.length,1);
  assert.ok(f.writes[0].startsWith('INSERT OR IGNORE INTO weather_interruption_events'));
  assert.equal(f.writes.some(sql=>sql.includes('service_visits')||sql.includes('service_agreements')),false);
 }
});

test('admins cannot submit field reports; workers cannot read the manager inbox',async()=>{
 const admin=fixture('admin');
 assert.equal((await api(post(),admin.env,new URL('https://api.example.test/v1/weather-interruptions'))).status,403);
 const worker=fixture('worker');
 assert.equal((await api(get(),worker.env,new URL('https://api.example.test/v1/weather-interruptions?business_id=business-a&date=2026-10-13'))).status,403);
 assert.equal(worker.queries.some(q=>q.sql.includes('FROM weather_interruption_events')),false);
});

test('only owners and admins can read same-business reports',async()=>{
 const f=fixture('owner');
 const response=await api(get(),f.env,new URL('https://api.example.test/v1/weather-interruptions?business_id=business-a&date=2026-10-13'));
 assert.equal(response.status,200);
 const body=await response.json() as {interruptions:Array<{eventId:string}>};
 assert.equal(body.interruptions[0].eventId,'event-1');
});

test('validates visit IDs, dates, completion overlap, and tenant agreements before insert',async()=>{
 const f=fixture();
 assert.equal((await api(post({...payload,workDate:'2026-02-30'}),f.env,new URL('https://api.example.test'))).status,400);
 assert.equal((await api(post({...payload,remainingVisitIds:['agreement-b:2026-10-12']}),f.env,new URL('https://api.example.test'))).status,400);
 assert.equal((await api(post({...payload,remainingVisitIds:['missing:2026-10-13']}),f.env,new URL('https://api.example.test'))).status,409);
 assert.equal(f.writes.length,0);
});
