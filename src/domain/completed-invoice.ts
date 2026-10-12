import {createInvoiceDraft,type InvoiceDraft} from './invoice';
/** Build a review-only invoice from an authenticated business's completed service.
 * No database write or external message is performed.
 */
export type CompletedServiceForBilling={
 businessId:string;customerId:string;agreementId:string;visitDate:string;
 serviceName:string;rateCents:number;status:string;
};
export function invoiceFromCompletedService(input:CompletedServiceForBilling,invoiceId:string,dueOn:string):InvoiceDraft{
 if(input.status!=='completed')throw new Error('Only completed service can be invoiced');
 if(!input.agreementId.trim())throw new Error('Agreement identity required');
 if(!Number.isSafeInteger(input.rateCents)||input.rateCents<0)throw new Error('Invalid service price');
 return createInvoiceDraft({
   id:invoiceId,businessId:input.businessId,customerId:input.customerId,
   issuedOn:input.visitDate,dueOn,
   lines:[{description:input.serviceName,quantity:1,unitPriceCents:input.rateCents}],
   taxBasisPoints:0,notes:'Service agreement '+input.agreementId+' · '+input.visitDate
 });
}
/** Pure UI projection; only completed visits tied to a returned agreement are eligible. */
export function billableCompletedServices(data:{
 date:string;
 agreements:Array<{id:string;customer_id:string;service_name:string;rate_cents:number}>;
 visits:Array<{agreement_id:string;status:string;scheduled_date:string}>;
},businessId:string):CompletedServiceForBilling[]{
 const agreementById=new Map(data.agreements.map(a=>[a.id,a]));
 const unique=new Set<string>();
 const output:CompletedServiceForBilling[]=[];
 for(const visit of data.visits){
   if(visit.status!=='completed'||visit.scheduled_date!==data.date||unique.has(visit.agreement_id))continue;
   const agreement=agreementById.get(visit.agreement_id);
   if(!agreement)continue;
   unique.add(visit.agreement_id);
   output.push({businessId,customerId:agreement.customer_id,
     agreementId:agreement.id,visitDate:data.date,serviceName:agreement.service_name,
     rateCents:agreement.rate_cents,status:'completed'});
 }
 return output;
}
