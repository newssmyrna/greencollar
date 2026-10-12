import {createInvoiceDraft,type InvoiceDraft} from './invoice';
/** Build a review-only invoice from immutable completed-visit billing snapshots. */
export type CompletedServiceForBilling={
 businessId:string;customerId:string;customerName:string;agreementId:string;visitDate:string;
 serviceName:string;rateCents:number;status:string;
};
export function invoiceFromCompletedService(input:CompletedServiceForBilling,invoiceId:string,dueOn:string):InvoiceDraft{
 if(input.status!=='completed')throw new Error('Only completed service can be invoiced');
 if(!input.agreementId.trim())throw new Error('Agreement identity required');
 if(!input.customerId.trim()||!input.customerName.trim())throw new Error('Completed customer snapshot required');
 if(!input.serviceName.trim()||input.serviceName.length>240)throw new Error('Completed service snapshot required');
 if(!Number.isSafeInteger(input.rateCents)||input.rateCents<0)throw new Error('Invalid service price snapshot');
 return createInvoiceDraft({
   id:invoiceId,businessId:input.businessId,customerId:input.customerId,customerName:input.customerName,
   issuedOn:input.visitDate,dueOn,
   lines:[{description:input.serviceName,quantity:1,unitPriceCents:input.rateCents}],
   taxBasisPoints:0,notes:'Service agreement '+input.agreementId+' · '+input.visitDate
 });
}
type BillingDay={
 date:string;
 visits:Array<{agreement_id:string;status:string;scheduled_date:string;completed_customer_id:string|null;
  completed_customer_name:string|null;completed_service_name:string|null;completed_rate_cents:number|null}>;
};
function hasBillingSnapshot(visit:BillingDay['visits'][number]):boolean{
 return typeof visit.completed_customer_id==='string'&&visit.completed_customer_id.length>0
  &&typeof visit.completed_customer_name==='string'&&visit.completed_customer_name.trim().length>0
  &&typeof visit.completed_service_name==='string'&&visit.completed_service_name.trim().length>0
  &&typeof visit.completed_rate_cents==='number'&&Number.isSafeInteger(visit.completed_rate_cents)
  &&visit.completed_rate_cents>=0;
}
/** Only completed visits carrying their own immutable billing facts can be drafted. */
export function billableCompletedServices(data:BillingDay,businessId:string):CompletedServiceForBilling[]{
 const unique=new Set<string>();const output:CompletedServiceForBilling[]=[];
 for(const visit of data.visits){
  if(visit.status!=='completed'||visit.scheduled_date!==data.date||unique.has(visit.agreement_id)||!hasBillingSnapshot(visit))continue;
  unique.add(visit.agreement_id);
  output.push({businessId,customerId:visit.completed_customer_id!,customerName:visit.completed_customer_name!,
   agreementId:visit.agreement_id,visitDate:data.date,serviceName:visit.completed_service_name!,
   rateCents:visit.completed_rate_cents!,status:'completed'});
 }
 return output;
}
/** Legacy completed rows have no reliable historical amount and must be reviewed manually. */
export function unbillableCompletedServiceCount(data:BillingDay):number{
 return data.visits.filter(v=>v.status==='completed'&&v.scheduled_date===data.date&&!hasBillingSnapshot(v)).length;
}
