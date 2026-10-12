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
  const limits:Record<keyof CustomerDetails,number>={name:160,phone:50,email:254,notes:2000};
  for(const field of Object.keys(limits) as (keyof CustomerDetails)[]){
    const value=customer[field];
    if(value!==undefined&&(typeof value!=='string'||value.length>limits[field]))
      throw new Error('Customer '+field+' is too long');
  }
  const details:CustomerDetails={
    name:customer.name.trim(),
    ...(customer.phone?.trim()?{phone:customer.phone.trim()}:{}),
    ...(customer.email?.trim()?{email:customer.email.trim()}:{}),
    ...(customer.notes?.trim()?{notes:customer.notes.trim()}:{}),
  };
  const response=await fetch(endpoint(apiUrl,businessId),{
    method:'POST',headers:{...auth(token),'content-type':'application/json'},
    body:JSON.stringify(details)
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
