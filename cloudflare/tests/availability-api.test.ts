import test from 'node:test';
import assert from 'node:assert/strict';
import {createAvailabilityApi} from '../src/availability-api';
import type {Env} from '../src/auth';
const meta={OIDC_ISSUER:'https://example.test',OIDC_AUDIENCE:'api',OIDC_JWKS_URL:'https://example.test/jwks'};
function fixture(role:'owner'|'admin'|'worker'|null='worker'){
 const queries:Array<{sql:string;values:unknown[]}>=[],writes:string[]=[];
 const row={business_id:'business-a',event_id:'event-1',work_date:'2026-10-13',member_subject:'worker-a',reported_by:'worker-a',kind:'break',start_minute:720,end_minute:750,created_at:'2026-10-13 12:00:00'};
 const DB={prepare(sql:string){return {bind(...values:unknown[]){queries.push({sql,values});return {
  async first(){if(sql.includes('business_memberships'))return values[1]==='worker-b'?{role:'worker'}:role?{role}:null;if(sql.includes('crew_availability_events'))return row;return null;},
  async all(){return {results:[row]};},
  async run(){writes.push(sql);return {success:true};}
 };}};}};
 return {env:{...meta,DB} as unknown as Env,queries,writes};
}
const api=createAvailabilityApi(async()=> 'worker-a');
const request=(method:'GET'|'POST',body?:unknown,url='https://api.example.test/v1/availability')=>new Request(url,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
const entry={businessId:'business-a',eventId:'event-1',workDate:'2026-10-13',kind:'break',startMinute:720,endMinute:750};
test('worker can report own lunch break; write is an event only',async()=>{
 const f=fixture(),response=await api(request('POST',entry),f.env,new URL('https://api.example.test/v1/availability'));
 assert.equal(response.status,201);const body=await response.json() as {availability:{memberSubject:string;kind:string}};
 assert.equal(body.availability.memberSubject,'worker-a');assert.equal(body.availability.kind,'break');
 assert.equal(f.writes.length,1);assert.ok(f.writes[0].startsWith('INSERT OR IGNORE INTO crew_availability_events'));
 assert.equal(f.writes.some(q=>q.includes('jobs')||q.includes('service_agreements')),false);
});
test('worker sees only own entries while owner may review team entries',async()=>{
 const f=fixture('worker'),response=await api(request('GET',undefined,'https://api.example.test/v1/availability?business_id=business-a&date=2026-10-13'),f.env,new URL('https://api.example.test/v1/availability?business_id=business-a&date=2026-10-13'));
 assert.equal(response.status,200);assert.deepEqual(f.queries.find(q=>q.sql.includes('crew_availability_events')&&q.sql.startsWith('SELECT'))?.values,['business-a','2026-10-13','worker-a']);
 const manager=fixture('owner');const res=await api(request('GET',undefined,'https://api.example.test/v1/availability?business_id=business-a&date=2026-10-13'),manager.env,new URL('https://api.example.test/v1/availability?business_id=business-a&date=2026-10-13'));
 assert.equal(res.status,200);assert.deepEqual(manager.queries.find(q=>q.sql.includes('crew_availability_events')&&q.sql.startsWith('SELECT'))?.values,['business-a','2026-10-13']);
});
test('worker cannot report for another member; manager target must belong to business',async()=>{
 const f=fixture('worker'),url=new URL('https://api.example.test/v1/availability');
 assert.equal((await api(request('POST',{...entry,memberSubject:'worker-b'}),f.env,url)).status,403);
 const manager=fixture('owner');assert.equal((await api(request('POST',{...entry,memberSubject:'worker-b'}),manager.env,url)).status,201);
});
test('rejects invalid date, interval, kind, and unknown business',async()=>{
 const f=fixture('worker'),url=new URL('https://api.example.test/v1/availability');
 for(const body of [{...entry,workDate:'2026-02-30'},{...entry,startMinute:800,endMinute:700},{...entry,kind:'diagnosis'},{...entry,startMinute:0,endMinute:1440}])
  assert.equal((await api(request('POST',body),f.env,url)).status,400);
 assert.equal((await api(request('POST',entry),fixture(null).env,url)).status,403);
});
