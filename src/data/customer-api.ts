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
export function customerDetailsInput(value:unknown):CustomerDetails{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Enter customer details');
  const customer=value as Record<string,unknown>;
  if(typeof customer.name!=='string'||!customer.name.trim())throw new Error('Customer name is required');
  const limits:Record<'name'|'phone'|'email'|'notes',number>={name:160,phone:50,email:254,notes:2000};
  for(const field of Object.keys(limits) as Array<keyof typeof limits>){
    const entry=customer[field];
    if(entry!==undefined&&(typeof entry!=='string'||entry.length>limits[field]))
      throw new Error('Customer '+field+' is too long');
  }
  return {
    name:customer.name.trim(),
    ...(typeof customer.phone==='string'&&customer.phone.trim()?{phone:customer.phone.trim()}:{}),
    ...(typeof customer.email==='string'&&customer.email.trim()?{email:customer.email.trim()}:{}),
    ...(typeof customer.notes==='string'&&customer.notes.trim()?{notes:customer.notes.trim()}:{}),
  };
}
export async function listSavedCustomers(apiUrl:string,businessId:string,token:string):Promise<SavedCustomer[]>{
  const response=await fetch(endpoint(apiUrl,businessId),{headers:auth(token)});
  if(!response.ok)throw new Error('Customer lookup failed ('+response.status+')');
  const body=await response.json() as {customers:SavedCustomer[]};
  if(!Array.isArray(body.customers))throw new Error('Invalid customer response');
  return body.customers;
}
export async function createSavedCustomer(apiUrl:string,businessId:string,token:string,customer:CustomerDetails):Promise<{id:string;name:string}>{
  const details=customerDetailsInput(customer);
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
