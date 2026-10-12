/** Pure invoice draft engine. Amounts are integer USD cents.
 * Tax is opt-in and must be configured by the operator for the relevant jurisdiction.
 * Does not collect payments, send messages or create accounting entries.
 */
export type InvoiceLine={description:string;quantity:number;unitPriceCents:number};
export type InvoiceTotals={subtotalCents:number;taxCents:number;totalCents:number};
export type InvoiceDraft={id:string;businessId:string;customerId:string;customerName?:string;issuedOn:string;dueOn:string;status:'draft'|'issued'|'paid'|'void';lines:InvoiceLine[];taxBasisPoints:number;notes:string};
function date(value:string):void{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||
 new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Error('Invalid calendar date');
}
export function invoiceTotals(lines:InvoiceLine[],taxBasisPoints=0):InvoiceTotals{
 if(!Array.isArray(lines)||lines.length===0||lines.length>100)throw new Error('Invoice requires 1–100 lines');
 if(!Number.isInteger(taxBasisPoints)||taxBasisPoints<0||taxBasisPoints>10000)throw new Error('Invalid tax rate');
 let subtotalCents=0;
 for(const line of lines){
   if(typeof line.description!=='string'||!line.description.trim()||line.description.length>240||
      !Number.isInteger(line.quantity)||line.quantity<1||line.quantity>10000||
      !Number.isSafeInteger(line.unitPriceCents)||line.unitPriceCents<0||line.unitPriceCents>100000000)
      throw new Error('Invalid invoice line');
   subtotalCents+=line.quantity*line.unitPriceCents;
   if(!Number.isSafeInteger(subtotalCents))throw new Error('Invoice amount too large');
 }
 const taxCents=Math.round(subtotalCents*taxBasisPoints/10000);
 const totalCents=subtotalCents+taxCents;
 if(!Number.isSafeInteger(totalCents))throw new Error('Invoice amount too large');
 return {subtotalCents,taxCents,totalCents};
}
export function createInvoiceDraft(input:Omit<InvoiceDraft,'status'>):InvoiceDraft{
 if(!input.id.trim()||!input.businessId.trim()||!input.customerId.trim())throw new Error('Invoice identity required');
 date(input.issuedOn);date(input.dueOn);
 if(input.dueOn<input.issuedOn)throw new Error('Due date cannot precede invoice date');
 if(typeof input.notes!=='string'||input.notes.length>4000)throw new Error('Invalid notes');
 invoiceTotals(input.lines,input.taxBasisPoints);
 return {...input,status:'draft',lines:input.lines.map(line=>({...line}))};
}
/** Set a bounded due date offset from the service date for review-only drafts. */
export function setInvoiceDueDays(invoice:InvoiceDraft,days:number):InvoiceDraft{
 if(invoice.status!=='draft')throw new Error('Only draft invoices may be edited');
 if(!Number.isInteger(days)||days<0||days>365)throw new Error('Due date offset must be 0–365 days');
 const due=new Date(invoice.issuedOn+'T00:00:00.000Z');
 due.setUTCDate(due.getUTCDate()+days);
 return createInvoiceDraft({...invoice,dueOn:due.toISOString().slice(0,10)});
}
/** Store only the business-confirmed rate; this helper makes no taxability decision. */
export function setInvoiceTaxBasisPoints(invoice:InvoiceDraft,basisPoints:number):InvoiceDraft{
 if(invoice.status!=='draft')throw new Error('Only draft invoices may be edited');
 return createInvoiceDraft({...invoice,taxBasisPoints:basisPoints});
}
export function issueInvoice(invoice:InvoiceDraft):InvoiceDraft{
 if(invoice.status!=='draft')throw new Error('Only draft invoices may be issued');
 invoiceTotals(invoice.lines,invoice.taxBasisPoints);
 return {...invoice,status:'issued'};
}
export function markInvoicePaid(invoice:InvoiceDraft):InvoiceDraft{
 if(invoice.status!=='issued')throw new Error('Only issued invoices may be paid');
 return {...invoice,status:'paid'};
}
export function voidInvoice(invoice:InvoiceDraft):InvoiceDraft{
 if(invoice.status==='paid'||invoice.status==='void')throw new Error('Cannot void this invoice');
 return {...invoice,status:'void'};
}
