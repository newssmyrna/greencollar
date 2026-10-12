import test from 'node:test';
import assert from 'node:assert/strict';
import {billableCompletedServices,invoiceFromCompletedService} from '../src/domain/completed-invoice';
import {invoiceTotals,issueInvoice} from '../src/domain/invoice';
const day={
 date:'2026-10-12',
 agreements:[{id:'agreement-1',customer_id:'customer-1',service_name:'Pool maintenance',rate_cents:6500}],
 visits:[{agreement_id:'agreement-1',status:'completed',scheduled_date:'2026-10-12'}]
};
test('completed service produces a review-only invoice with agreed price',()=>{
 const [service]=billableCompletedServices(day,'business-1');
 const draft=invoiceFromCompletedService(service,'invoice-1','2026-10-26');
 assert.equal(draft.status,'draft');
 assert.equal(draft.customerId,'customer-1');
 assert.equal(draft.lines[0].description,'Pool maintenance');
 assert.deepEqual(invoiceTotals(draft.lines,draft.taxBasisPoints),{subtotalCents:6500,taxCents:0,totalCents:6500});
 assert.equal(issueInvoice(draft).status,'issued');
});
test('does not invoice due skipped unknown or duplicate visits',()=>{
 const records={...day,visits:[...day.visits,...day.visits,{agreement_id:'agreement-1',status:'skipped',scheduled_date:day.date},{agreement_id:'unknown',status:'completed',scheduled_date:day.date}]};
 assert.equal(billableCompletedServices(records,'business-1').length,1);
 assert.equal(billableCompletedServices({...day,visits:[{agreement_id:'agreement-1',status:'due',scheduled_date:day.date}]},'business-1').length,0);
});
test('refuses an uncompleted service and invalid price',()=>{
 const [service]=billableCompletedServices(day,'business-1');
 assert.throws(()=>invoiceFromCompletedService({...service,status:'due'},'inv','2026-10-26'),/Only completed/);
 assert.throws(()=>invoiceFromCompletedService({...service,rateCents:-1},'inv','2026-10-26'),/Invalid service price/);
});
