import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceTotals,createInvoiceDraft,issueInvoice,markInvoicePaid,voidInvoice,setInvoiceDueDays,setInvoiceTaxBasisPoints} from '../src/domain/invoice';
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

test('draft review can set bounded due-date presets without timezone drift',()=>{const original=draft();assert.equal(setInvoiceDueDays(original,0).dueOn,'2026-10-12');assert.equal(setInvoiceDueDays(original,30).dueOn,'2026-11-11');assert.equal(original.dueOn,'2026-10-26');assert.throws(()=>setInvoiceDueDays(original,-1),/0–365/);assert.throws(()=>setInvoiceDueDays(original,366),/0–365/);});
test('draft review accepts only validated operator tax basis points',()=>{const original=draft();const taxed=setInvoiceTaxBasisPoints(original,725);assert.equal(taxed.taxBasisPoints,725);assert.equal(invoiceTotals(taxed.lines,taxed.taxBasisPoints).taxCents,1088);assert.equal(original.taxBasisPoints,0);assert.throws(()=>setInvoiceTaxBasisPoints(original,10001),/Invalid tax rate/);assert.throws(()=>setInvoiceTaxBasisPoints(issueInvoice(original),725),/Only draft invoices/);});
