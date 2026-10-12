import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceTotals,createInvoiceDraft,issueInvoice,markInvoicePaid,voidInvoice} from '../src/domain/invoice';
const draft=()=>createInvoiceDraft({
 id:'inv-1',businessId:'biz',customerId:'c1',issuedOn:'2026-10-12',dueOn:'2026-10-26',
 lines:[{description:'Pool cleaning',quantity:2,unitPriceCents:7500}],
 taxBasisPoints:0,notes:''
});
test('invoice uses cents and defaults to no tax',()=>{
 assert.deepEqual(invoiceTotals([{description:'Service',quantity:2,unitPriceCents:7500}]),{subtotalCents:15000,taxCents:0,totalCents:15000});
});
test('opt-in tax is rounded to nearest cent',()=>{
 assert.deepEqual(invoiceTotals([{description:'Supply',quantity:1,unitPriceCents:999}],725),{subtotalCents:999,taxCents:72,totalCents:1071});
});
test('draft, issue, pay and void have guarded transitions',()=>{
 const a=draft(),issued=issueInvoice(a),paid=markInvoicePaid(issued);
 assert.equal(a.status,'draft');assert.equal(issued.status,'issued');assert.equal(paid.status,'paid');
 assert.throws(()=>markInvoicePaid(a),/Only issued/);
 assert.throws(()=>voidInvoice(paid),/Cannot void/);
 assert.equal(voidInvoice(a).status,'void');
});
test('invalid quantities, amounts and due dates fail closed',()=>{
 assert.throws(()=>invoiceTotals([{description:'Bad',quantity:0,unitPriceCents:100}]),/Invalid invoice line/);
 assert.throws(()=>invoiceTotals([{description:'Bad',quantity:1,unitPriceCents:-100}]),/Invalid invoice line/);
 assert.throws(()=>createInvoiceDraft({...draft(),dueOn:'2026-10-01'}),/Due date/);
 assert.throws(()=>createInvoiceDraft({...draft(),dueOn:'2026-02-30'}),/calendar date/);
});
