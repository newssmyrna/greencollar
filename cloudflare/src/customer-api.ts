import { authenticatedSubject, businessAccess, type Env } from './auth';

function response(value:unknown,status=200){
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
type CustomerInput = {name?:unknown;phone?:unknown;email?:unknown;notes?:unknown};
const safeString=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):null;

export async function customerApi(request:Request,env:Env,url:URL):Promise<Response>{
  if (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE || !env.OIDC_JWKS_URL)
    return response({error:'authentication_unconfigured'},503);

  const sub=await authenticatedSubject(request,env);
  if(!sub)return response({error:'unauthorized'},401);
  const businessId=url.searchParams.get('business_id')??'';
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId))return response({error:'invalid_business'},400);
  const role=await businessAccess(env,sub,businessId);
  if(!role)return response({error:'forbidden'},403);

  if(request.method==='GET'){
    const data=await env.DB.prepare(
      'SELECT id,name,phone,email,notes,created_at FROM customers WHERE business_id=? ORDER BY name LIMIT 200'
    ).bind(businessId).all();
    return response({customers:data.results});
  }
  if(request.method==='POST'){
    if(role==='worker')return response({error:'forbidden'},403);
    let input:CustomerInput;
    try{input=await request.json() as CustomerInput;}catch{return response({error:'invalid_json'},400);}
    const name=safeString(input.name,160);
    if(!name)return response({error:'customer_name_required'},400);
    const id=crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO customers (id,business_id,name,phone,email,notes) VALUES (?,?,?,?,?,?)'
    ).bind(id,businessId,name,safeString(input.phone,50),safeString(input.email,254),safeString(input.notes,2000)).run();
    return response({id,name},201);
  }
  return response({error:'method_not_allowed'},405);
}
