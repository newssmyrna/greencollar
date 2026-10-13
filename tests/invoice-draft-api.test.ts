import test from 'node:test';
import assert from 'node:assert/strict';
import {listInvoiceDrafts,createPersistedInvoiceDraft,savePersistedInvoiceDraft,type PersistedInvoiceDraft} from '../src/data/invoice-draft-api';
const draft:PersistedInvoiceDraft={id:'invoice-1',businessId:'business-1',serviceVisitId:'visit-1',customerId:'customer-1',customerName:'Customer',issuedOn:'2026-10-12',dueOn:'2026-10-12',status:'draft',lines:[{description:'Pool service',quantity:1,unitPriceCents:6500}],taxBasisPoints:0,notes:'Service visit visit-1'};
const reply={invoiceDrafts:[draft],hasMore:false};
test('lists authenticated business-scoped draft records',async()=>{
 let url='',auth='';
 const result=await listInvoiceDrafts('https://api.example.test','business-1','token',async(u,init)=>{url=String(u);auth=new Headers(init?.headers).get('authorization')??'';return new Response(JSON.stringify(reply));});
 assert.equal(new URL(url).pathname,'/v1/invoice-drafts');assert.equal(new URL(url).searchParams.get('business_id'),'business-1');assert.equal(auth,'Bearer token');assert.deepEqual(result.invoiceDrafts,[draft]);
});
test('creates an idempotent completed visit draft and verifies its source acknowledgment',async()=>{
 let payload:unknown;
 const result=await createPersistedInvoiceDraft('https://api.example.test','token','business-1','visit-1','2026-10-12',async(_u,init)=>{payload=JSON.parse(String(init?.body));return new Response(JSON.stringify(draft),{status:201});});
 assert.deepEqual(payload,{serviceVisitId:'visit-1',dueOn:'2026-10-12',taxBasisPoints:0});assert.deepEqual(result,draft);
});
test('updates only editable draft fields and requires an exact identity acknowledgment',async()=>{
 let payload:unknown,url='';
 const changed={...draft,dueOn:'2026-10-19',taxBasisPoints:725,lines:[{...draft.lines[0],unitPriceCents:7000}]};
 const result=await savePersistedInvoiceDraft('https://api.example.test','token',changed,async(u,init)=>{url=String(u);payload=JSON.parse(String(init?.body));return new Response(JSON.stringify(changed));});
 assert.equal(new URL(url).searchParams.get('invoice_id'),'invoice-1');assert.deepEqual(payload,{dueOn:'2026-10-19',unitPriceCents:7000,taxBasisPoints:725});assert.deepEqual(result,changed);
 await assert.rejects(savePersistedInvoiceDraft('https://api.example.test','token',changed,async()=>new Response(JSON.stringify({...changed,serviceVisitId:'other'}))),/could not be matched/);
});
test('rejects malformed lists, insecure origins, and invalid source IDs before writes',async()=>{
 await assert.rejects(listInvoiceDrafts('http://api.example.test','business-1','token'),/HTTPS/);
 let called=false;
 await assert.rejects(createPersistedInvoiceDraft('https://api.example.test','token','business-1','bad visit','2026-10-12',async()=>{called=true;return new Response('{}');}),/Invalid invoice draft source/);
 assert.equal(called,false);
 await assert.rejects(listInvoiceDrafts('https://api.example.test','business-1','token',async()=>new Response('{}')),/could not be matched/);
});
