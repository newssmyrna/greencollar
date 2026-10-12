import {serviceLocationInput,validRecordId,type SavedServiceLocation,type ServiceLocationInput} from '../domain/service-location';
export type {SavedServiceLocation} from '../domain/service-location';
function endpoint(apiUrl:string,businessId:string,customerId:string):string{
  const base=new URL(apiUrl);
  if(base.protocol!=='https:'||base.username||base.password)throw new Error('An HTTPS API URL is required');
  if(!validRecordId(businessId)||!validRecordId(customerId))throw new Error('Select a business and customer');
  const url=new URL('/v1/locations',base);
  url.searchParams.set('business_id',businessId);url.searchParams.set('customer_id',customerId);
  return url.toString();
}
function headers(token:string){
  if(!token)throw new Error('Sign in first');
  return {Authorization:'Bearer '+token,'content-type':'application/json'};
}
export async function listServiceLocations(apiUrl:string,businessId:string,customerId:string,token:string):Promise<{locations:SavedServiceLocation[];hasMore:boolean}>{
  const response=await fetch(endpoint(apiUrl,businessId,customerId),{headers:headers(token)});
  if(!response.ok)throw new Error('Unable to load service addresses ('+response.status+')');
  const data=await response.json() as {locations:SavedServiceLocation[];hasMore:boolean};
  if(!Array.isArray(data.locations)||typeof data.hasMore!=='boolean')throw new Error('Invalid service address response');
  return data;
}
export async function createServiceLocation(apiUrl:string,businessId:string,customerId:string,token:string,input:ServiceLocationInput):Promise<SavedServiceLocation>{
  const details=serviceLocationInput(input);
  const response=await fetch(endpoint(apiUrl,businessId,customerId),{method:'POST',headers:headers(token),body:JSON.stringify(details)});
  if(!response.ok)throw new Error('Unable to save service address ('+response.status+')');
  const data=await response.json() as {location:SavedServiceLocation};
  if(!data.location||typeof data.location.id!=='string')throw new Error('Invalid saved address response');
  return data.location;
}
