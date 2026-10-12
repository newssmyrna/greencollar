import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvoiceDraftApi} from '../src/invoice-draft-api';
import type {Env} from '../src/auth';
const metadata={OIDC_ISSUER:'https://example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:'https://example.test/jwks'};
const source={id:'visit-1',business_id:'business-a',scheduled_date:'2026-10-12',status:'completed',completed_customer_id:'customer-a',completed_customer_name:'Customer A',completed_service_name:'Pool service',completed_rate_cents:6500};
const stored={id:'invoice-1',business_id:'business-a',service_visit_id:'visit-1',customer_id:'customer-a',customer_name:'Customer A',issued_on:'2026-10-12',due_on:'2026-10-19',service_description:'Pool service',quantity:1,unit_price_cents:6500,tax_basis_points:0,status:'draft' as const,notes:'Service visit visit-1'};
function fixture(role:'owner'|'admin'|'worker'|null='owner',options:{duplicate?:boolean;visitStatus?:string}={}){
 const queries:Array<{sql:string;values:unknown[]}>=[];let created=false;
 const DB={prepare(sql:string){return {bind(...values:unknown[]){queries.push({sql,values});return {
  async first(){
   if(sql.includes('business_memberships'))return role?{role}:null;
   if(sql.startsWith('INSERT INTO invoice_drafts')){if(options.duplicate||created)return null;created=true;return {...stored,due_on:values[1],tax_basis_points:values[2]};}
   if(sql.includes('FROM service_visits'))return options.visitStatus?{...source,status:options.visitStatus}:source;
   if(sql.includes('FROM invoice_drafts')&&sql.includes('service_visit_id=?'))return options.duplicate?stored:null;
   if(sql.startsWith('SELECT id,business_id,service_visit_id')&&sql.includes('invoice_drafts'))return stored;
   if(sql.startsWith('UPDATE invoice_drafts'))return {...stored,due_on:values[0],unit_price_cents:values[1],tax_basis_points:values[2]};
   return null;
  },
  async all(){return {results:[stored]};}
 };}};}};
 return {env:{...metadata,DB} as unknown as Env,queries};
}
const api=createInvoiceDraftApi(async()=> 'verified-subject');
const request=(method:string,url='https://api.example.test/v1/invoice-drafts?business_id=business-a',body?:unknown)=>new Request(url,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
test('requires configured and verified identity before database access',async()=>{
 const noDb={get DB(){throw Error('unexpected database access');}} as unknown as Env;
 assert.equal((await createInvoiceDraftApi(async()=>null)(request('GET'),noDb)).status,503);
 assert.equal((await createInvoiceDraftApi()(request('GET'),{...metadata,get DB(){throw Error('unexpected database access');}} as unknown as Env)).status,401);
});
test('reads only the authorized business draft list',async()=>{
 const f=fixture();const r=await api(request('GET'),f.env);assert.equal(r.status,200);
 const result=await r.json() as {invoiceDrafts:Array<{serviceVisitId:string}>;hasMore:boolean};
 assert.equal(result.invoiceDrafts[0].serviceVisitId,'visit-1');assert.equal(result.hasMore,false);
 assert.deepEqual(f.queries[0].values,['business-a']);assert.match(f.queries[0].sql,/WHERE business_id=\?/);
});
test('workers cannot create or edit financial drafts and outsiders are denied',async()=>{
 assert.equal((await api(request('POST',undefined,{serviceVisitId:'visit-1',dueOn:'2026-10-12'}),fixture('worker').env)).status,403);
 assert.equal((await api(request('PATCH','https://api.example.test/v1/invoice-drafts?business_id=business-a&invoice_id=invoice-1',{dueOn:'2026-10-19',unitPriceCents:6500,taxBasisPoints:0}),fixture('worker').env)).status,403);
 assert.equal((await api(request('GET'),fixture(null).env)).status,403);
});
test('creates only one review draft from a completed same-tenant billing snapshot',async()=>{
 const f=fixture();const r=await api(request('POST',undefined,{serviceVisitId:'visit-1',dueOn:'2026-10-19',taxBasisPoints:725}),f.env);
 assert.equal(r.status,201);const data=await r.json() as {serviceVisitId:string;lines:Array<{unitPriceCents:number}>};
 assert.equal(data.serviceVisitId,'visit-1');assert.equal(data.lines[0].unitPriceCents,6500);assert.equal(data.taxBasisPoints,725);
 const insert=f.queries.find(q=>q.sql.startsWith('INSERT INTO invoice_drafts'))!;
 assert.match(insert.sql,/WHERE v\.business_id=\? AND v\.id=\? AND v\.status='completed'/);
 assert.match(insert.sql,/ON CONFLICT\(business_id,service_visit_id\) DO NOTHING/);
 assert.equal(insert.values[4],'business-a');assert.equal(insert.values[5],'visit-1');
});
test('repeated create returns the prior draft without rewriting review edits',async()=>{
 const f=fixture('owner',{duplicate:true});const r=await api(request('POST',undefined,{serviceVisitId:'visit-1',dueOn:'2026-10-12'}),f.env);
 assert.equal(r.status,200);assert.equal((await r.json() as {id:string}).id,'invoice-1');
 assert.equal(f.queries.filter(q=>q.sql.startsWith('INSERT INTO invoice_drafts')).length,1);
});
test('rejects uncompleted visits, impossible due dates, invalid tax and bad payloads',async()=>{
 assert.equal((await api(request('POST',undefined,{serviceVisitId:'visit-1',dueOn:'2026-10-12'}),fixture('owner',{visitStatus:'skipped'}).env)).status,404);
 assert.equal((await api(request('POST',undefined,{serviceVisitId:'visit-1',dueOn:'2026-10-11'}),fixture().env)).status,400);
 assert.equal((await api(request('POST',undefined,{serviceVisitId:'visit-1',dueOn:'2026-10-12',taxBasisPoints:10001}),fixture().env)).status,400);
});
test('updates draft price, tax, and due date in the owning business only',async()=>{
 const f=fixture();const r=await api(request('PATCH','https://api.example.test/v1/invoice-drafts?business_id=business-a&invoice_id=invoice-1',{dueOn:'2026-10-26',unitPriceCents:7000,taxBasisPoints:725}),f.env);
 assert.equal(r.status,200);const data=await r.json() as {dueOn:string;taxBasisPoints:number;lines:Array<{unitPriceCents:number}>};
 assert.equal(data.dueOn,'2026-10-26');assert.equal(data.taxBasisPoints,725);assert.equal(data.lines[0].unitPriceCents,7000);
 const update=f.queries.find(q=>q.sql.startsWith('UPDATE invoice_drafts'))!;assert.deepEqual(update.values,['2026-10-26',7000,725,'business-a','invoice-1']);
});
