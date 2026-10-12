export type SavedServiceLocation={id:string;customer_id:string;address:string;preferences:string|null};
export type ServiceFrequency='daily'|'weekly'|'biweekly'|'monthly'|'custom';
export type ServiceAgreementInput={
 customerId:string;locationId:string;serviceName:string;rateCents:number;estimatedMinutes:number;
 startsOn:string;endsOn?:string|null;frequency:ServiceFrequency;intervalDays?:number;
 daysOfWeek?:number[];preferredStartMinute?:number|null;preferredFinishMinute?:number|null;fixedStartMinute?:number|null;
};
export type SavedServiceAgreement={id:string;customer_id:string;location_id:string;service_name:string;rate_cents:number;
 estimated_minutes:number;starts_on:string;ends_on:string|null;frequency:ServiceFrequency;active:number};

function endpoint(apiUrl:string,businessId:string,path:string):string{
 if(!/^https:\/\//.test(apiUrl))throw new Error('An HTTPS API URL is required');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId))throw new Error('A valid business is required');
 const url=new URL(path,apiUrl);url.searchParams.set('business_id',businessId);return url.toString();
}
function auth(token:string):Record<string,string>{if(!token)throw new Error('Sign in first');return {Authorization:'Bearer '+token};}
async function result<T>(response:Response,action:string):Promise<T>{
 if(!response.ok)throw new Error(action+' failed ('+response.status+')');
 return await response.json() as T;
}
export async function listServiceLocations(apiUrl:string,businessId:string,token:string,customerId:string):Promise<SavedServiceLocation[]>{
 const url=new URL(endpoint(apiUrl,businessId,'/v1/locations'));url.searchParams.set('customer_id',customerId);
 const body=await result<{locations:SavedServiceLocation[]}>(await fetch(url.toString(),{headers:auth(token)}),'Location lookup');
 if(!Array.isArray(body.locations))throw new Error('Invalid location response');return body.locations;
}
export async function createServiceLocation(apiUrl:string,businessId:string,token:string,input:{customerId:string;address:string;preferences?:string}):Promise<SavedServiceLocation>{
 const response=await fetch(endpoint(apiUrl,businessId,'/v1/locations'),{
  method:'POST',headers:{...auth(token),'content-type':'application/json'},body:JSON.stringify(input)
 });
 return result<SavedServiceLocation>(response,'Location creation');
}
export async function listServiceAgreements(apiUrl:string,businessId:string,token:string):Promise<SavedServiceAgreement[]>{
 const body=await result<{agreements:SavedServiceAgreement[]}>(await fetch(endpoint(apiUrl,businessId,'/v1/agreements'),{headers:auth(token)}),'Agreement lookup');
 if(!Array.isArray(body.agreements))throw new Error('Invalid agreement response');return body.agreements;
}
export async function createServiceAgreement(apiUrl:string,businessId:string,token:string,input:ServiceAgreementInput):Promise<SavedServiceAgreement>{
 const response=await fetch(endpoint(apiUrl,businessId,'/v1/agreements'),{
  method:'POST',headers:{...auth(token),'content-type':'application/json'},body:JSON.stringify(input)
 });
 return result<SavedServiceAgreement>(response,'Agreement creation');
}

export async function setServiceAgreementActive(apiUrl:string,businessId:string,token:string,id:string,active:boolean):Promise<{id:string;active:number}>{
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid agreement ID');
 const url=new URL(endpoint(apiUrl,businessId,'/v1/agreements'));url.searchParams.set('id',id);
 const response=await fetch(url.toString(),{
  method:'PATCH',headers:{...auth(token),'content-type':'application/json'},body:JSON.stringify({active})
 });
 return result<{id:string;active:number}>(response,'Agreement update');
}
