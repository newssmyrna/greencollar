export type SavedCustomer={id:string;name:string;phone:string|null;email:string|null;notes:string|null;created_at:string};
export type CustomerDetails={name:string;phone?:string;email?:string;notes?:string};
function endpoint(apiUrl:string,businessId:string,id?:string):string{
  if(!/^https:\/\//.test(apiUrl))throw new Error('An HTTPS API URL is required');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId))throw new Error('A valid business is required');
  const url=new URL('/v1/customers',apiUrl);
  url.searchParams.set('business_id',businessId);
  if(id)url.searchParams.set('id',id);
  return url.toString();
}
function auth(token:string):Record<string,string>{
  if(!token)throw new Error('Sign in first');
  return {Authorization:'Bearer '+token};
}
export async function listSavedCustomers(apiUrl:string,businessId:string,token:string):Promise<SavedCustomer[]>{
  const response=await fetch(endpoint(apiUrl,businessId),{headers:auth(token)});
  if(!response.ok)throw new Error('Customer lookup failed ('+response.status+')');
  const body=await response.json() as {customers:SavedCustomer[]};
  if(!Array.isArray(body.customers))throw new Error('Invalid customer response');
  return body.customers;
}
export async function createSavedCustomer(apiUrl:string,businessId:string,token:string,customer:CustomerDetails):Promise<{id:string;name:string}>{
  if(!customer.name?.trim())throw new Error('Customer name is required');
  const response=await fetch(endpoint(apiUrl,businessId),{
    method:'POST',headers:{...auth(token),'content-type':'application/json'},
    body:JSON.stringify(customer)
  });
  if(!response.ok)throw new Error('Customer creation failed ('+response.status+')');
  return await response.json() as {id:string;name:string};
}
export async function updateSavedCustomer(apiUrl:string,businessId:string,token:string,id:string,changes:Partial<CustomerDetails>):Promise<SavedCustomer>{
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid customer ID');
  const response=await fetch(endpoint(apiUrl,businessId,id),{
    method:'PATCH',headers:{...auth(token),'content-type':'application/json'},
    body:JSON.stringify(changes)
  });
  if(!response.ok)throw new Error('Customer update failed ('+response.status+')');
  return await response.json() as SavedCustomer;
}
