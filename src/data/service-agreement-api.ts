import {serviceAgreementInput,type ServiceAgreementInput} from '../domain/service-agreement';
import {validRecordId} from '../domain/service-location';
import type {DayData} from './greencollar-api';
export type SavedServiceAgreement=DayData['agreements'][number];
function endpoint(apiUrl:string,businessId:string,customerId:string):string{
 const base=new URL(apiUrl);if(base.protocol!=='https:'||base.username||base.password)throw new Error('An HTTPS API URL is required');
 if(!validRecordId(businessId)||!validRecordId(customerId))throw new Error('Select a business and customer');
 const url=new URL('/v1/agreements',base);url.searchParams.set('business_id',businessId);url.searchParams.set('customer_id',customerId);return url.toString();
}
const headers=(token:string)=>{if(!token)throw new Error('Sign in first');return {Authorization:'Bearer '+token,'content-type':'application/json'};};
export async function listServiceAgreements(apiUrl:string,businessId:string,customerId:string,token:string):Promise<{agreements:SavedServiceAgreement[];hasMore:boolean}>{
 const response=await fetch(endpoint(apiUrl,businessId,customerId),{headers:headers(token)});
 if(!response.ok)throw new Error('Unable to load recurring services ('+response.status+')');
 const data=await response.json() as {agreements:SavedServiceAgreement[];hasMore:boolean};
 if(!Array.isArray(data.agreements)||typeof data.hasMore!=='boolean')throw new Error('Invalid recurring service response');
 return data;
}
export async function createServiceAgreement(apiUrl:string,businessId:string,customerId:string,token:string,input:ServiceAgreementInput):Promise<SavedServiceAgreement>{
 const details=serviceAgreementInput(input);
 const response=await fetch(endpoint(apiUrl,businessId,customerId),{method:'POST',headers:headers(token),body:JSON.stringify(details)});
 if(!response.ok)throw new Error('Unable to save recurring service ('+response.status+')');
 const data=await response.json() as {agreement:SavedServiceAgreement};
 if(!data.agreement||typeof data.agreement.id!=='string')throw new Error('Invalid saved service response');
 const saved=data.agreement;
 if((saved.preferred_start_minute??null)!==(details.preferredStartMinute??null)
   ||(saved.preferred_finish_minute??null)!==(details.preferredFinishMinute??null)
   ||(saved.fixed_start_minute??null)!==(details.fixedStartMinute??null))
   throw new Error('Service may have been saved, but its appointment times were not confirmed. Reload recurring services before retrying.');
 return saved;
}
