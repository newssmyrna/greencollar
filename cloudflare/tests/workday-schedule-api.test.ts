import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkdayScheduleApi} from '../src/workday-schedule-api';
import type {Env} from '../src/auth';
const meta={OIDC_ISSUER:'https://example.test',OIDC_AUDIENCE:'api',OIDC_JWKS_URL:'https://example.test/jwks'};
const base={businessId:'business-a',workDate:'2026-10-13',expectedVersion:0,routes:[{routeId:'route-1',truckId:'truck-1',startMinute:480,endMinute:1020,workers:[{subject:'worker-a',startMinute:480,endMinute:1020},{subject:'worker-b',startMinute:480,endMinute:1020}],stops:[{visitId:'agreement-a:2026-10-13',order:1,tasks:[{taskId:'mow',label:'Mow',assignedSubjects:['worker-a'],estimatedMinutes:30},{taskId:'trim',label:'Weed whack',assignedSubjects:['worker-b'],estimatedMinutes:20}]}]}]};
function fixture(role:'owner'|'admin'|'worker'|null='owner',conflict=false,availability:Array<{kind:string;start_minute:number;end_minute:number}>=[]){
 const queries:Array<{sql:string;values:unknown[]}>=[],writes:string[]=[];
 const saved={business_id:'business-a',work_date:'2026-10-13',version:1,schedule_json:JSON.stringify(base.routes),updated_by:'owner-a',updated_at:'2026-10-13T12:00:00Z'};
 const DB={prepare(sql:string){return {bind(...values:unknown[]){queries.push({sql,values});return {
 async first(){if(sql.includes('business_memberships'))return role?{role:values[1]==='worker-a'||values[1]==='worker-b'?'worker':role}:null;if(sql.includes('workday_schedule_drafts'))return saved;return null;},
 async all(){if(sql.includes('service_agreements'))return {results:[{id:'agreement-a'}]};if(sql.includes('business_memberships'))return {results:[{subject:'owner-a',role:'owner'},{subject:'worker-a',role:'worker'},{subject:'worker-b',role:'worker'}]};if(sql.includes('crew_availability_events'))return {results:availability};return {results:[]};},
 async run(){writes.push(sql);return {meta:{changes:conflict?0:1}};}
 };}};}};
 return {env:{...meta,DB} as unknown as Env,queries,writes};
}
const api=createWorkdayScheduleApi(async()=> 'owner-a');
const req=(method:'GET'|'POST',body?:unknown)=>new Request('https://api.test/v1/workday-schedules',{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
test('owner can draft a route with two workers and separate stop tasks',async()=>{
 const f=fixture(),r=await api(req('POST',base),f.env,new URL('https://api.test/v1/workday-schedules'));
 assert.equal(r.status,201);const b=await r.json() as {schedule:{version:number;routes:Array<{workers:unknown[];stops:Array<{tasks:Array<{assignedSubjects:string[]}>}>}>}};
 assert.equal(b.schedule.version,1);assert.equal(b.schedule.routes[0].workers.length,2);assert.deepEqual(b.schedule.routes[0].stops[0].tasks.map(t=>t.assignedSubjects),[['worker-a'],['worker-b']]);
 assert.equal(f.writes.length,1);assert.ok(f.writes[0].includes('workday_schedule_drafts'));
});
test('worker cannot write a schedule and assigned worker read is route-scoped',async()=>{
 const f=fixture('worker');assert.equal((await api(req('POST',base),f.env,new URL('https://api.test/v1/workday-schedules'))).status,403);
 const get=new Request('https://api.test/v1/workday-schedules?business_id=business-a&date=2026-10-13');
 const r=await api(get,f.env,new URL(get.url));assert.equal(r.status,200);
});
test('rejects overlapping truck/worker routes and task assignments outside the crew',async()=>{
 const f=fixture(),url=new URL('https://api.test/v1/workday-schedules');
 const conflict={...base,routes:[...base.routes,{...base.routes[0],routeId:'route-2',stops:[]}]};
 assert.equal((await api(req('POST',conflict),f.env,url)).status,400);
 const bad={...base,routes:[{...base.routes[0],stops:[{...base.routes[0].stops[0],tasks:[{...base.routes[0].stops[0].tasks[0],assignedSubjects:['not-on-crew']}]}]}]};
 assert.equal((await api(req('POST',bad),f.env,url)).status,400);
});
test('stale draft version and foreign stops do not write',async()=>{
 const f=fixture('owner',true),url=new URL('https://api.test/v1/workday-schedules');
 assert.equal((await api(req('POST',{...base,expectedVersion:1}),f.env,url)).status,409);
 assert.equal((await api(req('POST',{...base,routes:[{...base.routes[0],stops:[{...base.routes[0].stops[0],visitId:'missing:2026-10-13'}]}]}),f.env,url)).status,409);
});

test('owner and admin can load verified business members; workers cannot',async()=>{
 const owner=fixture('owner'),membersUrl=new URL('https://api.test/v1/workday-schedules?business_id=business-a&members=1');
 const ownerResponse=await api(new Request(membersUrl),owner.env,membersUrl);
 assert.equal(ownerResponse.status,200);
 const ownerBody=await ownerResponse.json() as {members:Array<{subject:string;role:string}>};
 assert.deepEqual(ownerBody.members.map(member=>member.subject),['owner-a','worker-a','worker-b']);
 const admin=fixture('admin'),adminResponse=await api(new Request(membersUrl),admin.env,membersUrl);
 assert.equal(adminResponse.status,200);
 const worker=fixture('worker'),workerResponse=await api(new Request(membersUrl),worker.env,membersUrl);
 assert.equal(workerResponse.status,403);
 assert.equal((await workerResponse.json() as {error:string}).error,'manager_required');
});

test('draft save rejects a crew member whose sick or unavailable interval overlaps the shift',async()=>{
 const url=new URL('https://api.test/v1/workday-schedules');
 for(const kind of ['sick','unavailable']){
  const f=fixture('owner',false,[{kind,start_minute:600,end_minute:660}]);
  const response=await api(req('POST',base),f.env,url);
  assert.equal(response.status,409);
  assert.equal((await response.json() as {error:string}).error,'worker_unavailable');
  assert.equal(f.writes.length,0);
 }
});
test('draft save allows shifts outside absence and does not treat lunch as a full shift absence',async()=>{
 const url=new URL('https://api.test/v1/workday-schedules');
 const before=fixture('owner',false,[{kind:'sick',start_minute:300,end_minute:450}]);
 assert.equal((await api(req('POST',base),before.env,url)).status,201);
 const lunch=fixture('owner',false,[{kind:'break',start_minute:720,end_minute:750}]);
 assert.equal((await api(req('POST',base),lunch.env,url)).status,201);
});

test('supports a per-worker lunch block inside the shift and returns it in the saved draft',async()=>{
 const routes=structuredClone(base.routes);
 routes[0].workers[0]={...routes[0].workers[0],breaks:[{startMinute:720,endMinute:750}]};
 const f=fixture(),url=new URL('https://api.test/v1/workday-schedules');
 const response=await api(req('POST',{...base,routes}),f.env,url);
 assert.equal(response.status,201);
 const body=await response.json() as {schedule:{routes:Array<{workers:Array<{breaks:Array<{startMinute:number;endMinute:number}>}>}>}};
 assert.deepEqual(body.schedule.routes[0].workers[0].breaks,[{startMinute:720,endMinute:750}]);
});
test('rejects lunch outside a shift, overlapping lunch blocks, or too many breaks',async()=>{
 const url=new URL('https://api.test/v1/workday-schedules');
 const lunchCases=[
  [{startMinute:450,endMinute:480}],
  [{startMinute:720,endMinute:780},{startMinute:750,endMinute:810}],
  [{startMinute:600,endMinute:610},{startMinute:620,endMinute:630},{startMinute:640,endMinute:650},{startMinute:660,endMinute:670}]
 ];
 for(const breaks of lunchCases){
  const routes=structuredClone(base.routes);routes[0].workers[0]={...routes[0].workers[0],breaks};
  const response=await api(req('POST',{...base,routes}),fixture().env,url);
  assert.equal(response.status,400);
 }
});
