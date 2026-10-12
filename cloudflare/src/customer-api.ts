import { authenticatedSubject, businessAccess, type Env } from './auth';

function response(value:unknown,status=200){
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
type CustomerInput = {name?:unknown;phone?:unknown;email?:unknown;notes?:unknown};
const fieldLimits={name:160,phone:50,email:254,notes:2000} as const;
const safeString=(v:unknown,max:number)=>typeof v==='string'?v.trim():v===null?null:null;

function parseCustomerInput(value:unknown):CustomerInput|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const input=value as Record<string,unknown>;
  for(const [field,max] of Object.entries(fieldLimits)){
    const v=input[field];
    if(v!==undefined&&v!==null&&(typeof v!=='string'||v.length>max))return null;
  }
  return input as CustomerInput;
}

export async function customerApi(request:Request,env:Env,url:URL):Promise<Response>{
  if (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE || !env.OIDC_JWKS_URL)
    return response({error:'authentication_unconfigured'},503);

  const sub=await authenticatedSubject(request,env);
  if(!sub)return response({error:'unauthorized'},401);
  const businessId=url.searchParams.get('business_id')??'';
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId))return response({error:'invalid_business'},400);
  const role=await businessAccess(env,sub,businessId);
  if(!role)return response({error:'forbidden'},403);

  const customerId=url.searchParams.get('id');
  if(request.method==='GET'){
    const data=await env.DB.prepare(
      'SELECT id,name,phone,email,notes,created_at FROM customers WHERE business_id=? ORDER BY name LIMIT 200'
    ).bind(businessId).all();
    return response({customers:data.results});
  }
  if(request.method==='PATCH' || request.method==='DELETE'){
    if(role==='worker')return response({error:'forbidden'},403);
    if(!customerId || !/^[0-9a-f-]{36}$/i.test(customerId))return response({error:'invalid_customer_id'},400);
    if(request.method==='DELETE'){
      // Do not cascade-delete historical service records. Require explicit archival workflow.
      return response({error:'archival_workflow_not_implemented'},409);
    }
    let input:CustomerInput|null;
    try{input=parseCustomerInput(await request.json());}catch{return response({error:'invalid_json'},400);}
    if(!input)return response({error:'invalid_input'},400);
    const current=await env.DB.prepare(
      'SELECT id,name,phone,email,notes FROM customers WHERE business_id=? AND id=?'
    ).bind(businessId,customerId).first<{id:string;name:string;phone:string|null;email:string|null;notes:string|null}>();
    if(!current)return response({error:'not_found'},404);
    const name=input.name===undefined?current.name:safeString(input.name,fieldLimits.name);
    if(!name)return response({error:'customer_name_required'},400);
    const phone=input.phone===undefined?current.phone:safeString(input.phone,fieldLimits.phone);
    const email=input.email===undefined?current.email:safeString(input.email,fieldLimits.email);
    const notes=input.notes===undefined?current.notes:safeString(input.notes,fieldLimits.notes);
    await env.DB.prepare(
      'UPDATE customers SET name=?,phone=?,email=?,notes=? WHERE business_id=? AND id=?'
    ).bind(name,phone,email,notes,businessId,customerId).run();
    return response({id:customerId,name,phone,email,notes});
  }
  if(request.method==='POST'){
    if(role==='worker')return response({error:'forbidden'},403);
    let input:CustomerInput|null;
    try{input=parseCustomerInput(await request.json());}catch{return response({error:'invalid_json'},400);}
    if(!input)return response({error:'invalid_input'},400);
    const name=safeString(input.name,fieldLimits.name);
    if(!name)return response({error:'customer_name_required'},400);
    const id=crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO customers (id,business_id,name,phone,email,notes) VALUES (?,?,?,?,?,?)'
    ).bind(id,businessId,name,safeString(input.phone,fieldLimits.phone),safeString(input.email,fieldLimits.email),safeString(input.notes,fieldLimits.notes)).run();
    return response({id,name},201);
  }
  return response({error:'method_not_allowed'},405);
}
