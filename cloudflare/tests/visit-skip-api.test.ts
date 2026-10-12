import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisitSkipApi} from '../src/visit-skip-api';
import type {Env} from '../src/auth';

const metadata={OIDC_ISSUER:'https://example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:'https://example.test/jwks'};
const body={businessId:'business-a',agreementId:'agreement-a',date:'2026-10-12'};
function fixture(role:'owner'|'admin'|'worker'|null='worker',skippable=true){
 const queries:Array<{sql:string;values:unknown[]}>= [];
 const DB={prepare(sql:string){return {bind(...values:unknown[]){queries.push({sql,values});return {
  async first(){
   if(sql.includes('business_memberships'))return role?{role}:null;
   if(sql.startsWith('SELECT id FROM service_agreements'))return {id:'agreement-a'};
   if(sql.startsWith('INSERT INTO service_visits'))return skippable?{id:'visit-a'}:null;
   return null;
  }
 };}};}};
 return {env:{...metadata,DB} as unknown as Env,queries};
}
const api=createVisitSkipApi(async()=> 'verified-subject');
const request=(value:unknown=body)=>new Request('https://api.example.test/v1/visits/skip',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});

test('requires verified authentication and business membership',async()=>{
 const denied=createVisitSkipApi(async()=>null);
 const noDb={...metadata,get DB(){throw Error('unexpected database access');}} as unknown as Env;
 assert.equal((await denied(request(),noDb)).status,401);
 const f=fixture(null);assert.equal((await api(request(),f.env)).status,403);
});

test('validates tenant, agreement, and date before writing',async()=>{
 const f=fixture();
 assert.equal((await api(request({...body,date:'2026-02-30'}),f.env)).status,400);
 assert.equal((await api(request({...body,businessId:'other business'}),f.env)).status,400);
 assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT INTO service_visits')),false);
});

test('marks only eligible visits skipped and leaves completed work protected',async()=>{
 const f=fixture('worker');
 const response=await api(request(),f.env);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{businessId:'business-a',agreementId:'agreement-a',date:'2026-10-12',status:'skipped'});
 const write=f.queries.find(q=>q.sql.startsWith('INSERT INTO service_visits'))!;
 assert.match(write.sql,/status IN \\('due','planned','skipped'\\)/);
 assert.match(write.sql,/completed_rate_cents=NULL/);
 assert.deepEqual(write.values.slice(1),['business-a','agreement-a','2026-10-12']);
 const protectedVisit=fixture('worker',false);
 assert.equal((await api(request(),protectedVisit.env)).status,409);
});
