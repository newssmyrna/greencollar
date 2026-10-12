import test from 'node:test';
import assert from 'node:assert/strict';
import {billableCompletedServices,invoiceFromCompletedService,unbillableCompletedServiceCount} from '../src/domain/completed-invoice';
import {invoiceTotals,issueInvoice} from '../src/domain/invoice';
const day={
 date:'2026-10-12',
 visits:[{agreement_id:'agreement-1',status:'completed',scheduled_date:'2026-10-12',
  completed_customer_id:'customer-at-completion',completed_customer_name:'Customer at completion',
  completed_service_name:'Pool maintenance at completion',completed_rate_cents:6500}]
};
test('completed service produces a review-only invoice from its price and identity snapshots',()=>{
 const [service]=billableCompletedServices(day,'business-1');
 const draft=invoiceFromCompletedService(service,'invoice-1','2026-10-26');
 assert.equal(draft.status,'draft');assert.equal(draft.customerId,'customer-at-completion');
 assert.equal(draft.customerName,'Customer at completion');
 assert.equal(draft.lines[0].description,'Pool maintenance at completion');
 assert.deepEqual(invoiceTotals(draft.lines,draft.taxBasisPoints),{subtotalCents:6500,taxCents:0,totalCents:6500});
 assert.equal(issueInvoice(draft).status,'issued');
});
test('does not invoice due, skipped, wrong-date or duplicate visits',()=>{
 const records={...day,visits:[...day.visits,...day.visits,
  {...day.visits[0],status:'skipped'}, {...day.visits[0],agreement_id:'other',status:'completed',scheduled_date:'2026-10-11'}]};
 assert.equal(billableCompletedServices(records,'business-1').length,1);
 assert.equal(billableCompletedServices({...day,visits:[{...day.visits[0],status:'due'}]},'business-1').length,0);
});
test('holds legacy completed visits without snapshots instead of guessing from a changed agreement',()=>{
 const legacy={...day,visits:[{agreement_id:'agreement-1',status:'completed',scheduled_date:day.date,
  completed_customer_id:null,completed_customer_name:null,completed_service_name:null,completed_rate_cents:null}]};
 assert.equal(billableCompletedServices(legacy,'business-1').length,0);
 assert.equal(unbillableCompletedServiceCount(legacy),1);
});
test('refuses incomplete snapshots, uncompleted service and invalid price',()=>{
 const [service]=billableCompletedServices(day,'business-1');
 assert.throws(()=>invoiceFromCompletedService({...service,status:'due'},'inv','2026-10-26'),/Only completed/);
 assert.throws(()=>invoiceFromCompletedService({...service,rateCents:-1},'inv','2026-10-26'),/Invalid service price/);
 assert.throws(()=>invoiceFromCompletedService({...service,customerName:''},'inv','2026-10-26'),/customer snapshot/);
});
