import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisitCompletionApi} from '../src/visit-completion-api';
import type {Env} from '../src/auth';
const metadata={OIDC_ISSUER:'https://example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:'https://example.test/jwks'};
const body={businessId:'business-a',agreementId:'agreement-a',date:'2026-10-12',actualMinutes:45};
function fixture(role:'owner'|'admin'|'worker'|null='owner',completed=false){
 const queries:Array<{sql:string;values:unknown[]}>=[];
 const DB={prepare(sql:string){return {bind(...values:unknown[]){queries.push({sql,values});return {
  async first(){
   if(sql.includes('business_memberships'))return role?{role}:null;
   if(sql.startsWith('SELECT id FROM service_agreements'))return {id:'agreement-a'};
   if(sql.startsWith('INSERT INTO service_visits'))return completed?null:{id:'visit-a'};
   return null;
  }
 };}};}};
 return {env:{...metadata,DB} as unknown as Env,queries};
}
const api=createVisitCompletionApi(async()=> 'verified-subject');
const request=(value:unknown=body)=>new Request('https://api.example.test/v1/visits/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
test('requires configured and verified identity before database access',async()=>{
 const noDb={get DB(){throw Error('unexpected database access');}} as unknown as Env;
 assert.equal((await createVisitCompletionApi(async()=>null)(request(),noDb)).status,503);
 assert.equal((await createVisitCompletionApi()(request(),{...metadata,get DB(){throw Error('unexpected database access');}} as unknown as Env)).status,401);
});
test('validates bounded completion input and requires tenant membership',async()=>{
 const f=fixture();assert.equal((await api(request({...body,actualMinutes:0}),f.env)).status,400);
 assert.equal((await api(new Request('https://api.example.test',{method:'POST',body:'x'.repeat(9000)}),f.env)).status,413);
 const worker=fixture('worker');assert.equal((await api(request(),worker.env)).status,201);
 const outsider=fixture(null);assert.equal((await api(request(),outsider.env)).status,403);
});
test('completion captures customer, service and rate in the same tenant-scoped write',async()=>{
 const f=fixture();const response=await api(request(),f.env);
 assert.equal(response.status,201);
 const write=f.queries.find(q=>q.sql.startsWith('INSERT INTO service_visits'))!;
 assert.match(write.sql,/SELECT .*a\.customer_id,c\.name,a\.service_name,a\.rate_cents/);
 assert.match(write.sql,/ON CONFLICT\(agreement_id,scheduled_date\) DO UPDATE/);
 assert.match(write.sql,/WHERE service_visits\.business_id=excluded\.business_id AND service_visits\.status!='completed'/);
 assert.deepEqual(write.values.slice(2),[45,'business-a','agreement-a','2026-10-12','2026-10-12']);
});
test('a repeated completion never rewrites a prior snapshot',async()=>{
 const f=fixture('owner',true);
 assert.equal((await api(request(),f.env)).status,409);
});
