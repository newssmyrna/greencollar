import {authenticatedSubject,businessAccess,type Env} from './auth';

const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);
type LocationInput={customerId:unknown;address:unknown;preferences?:unknown};

export async function locationsApi(request:Request,env:Env,url:URL):Promise<Response>{
 if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
 if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
 const subject=await authenticatedSubject(request,env);
 if(!subject)return json({error:'unauthorized'},401);
 const businessId=url.searchParams.get('business_id')??'';
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId))return json({error:'invalid_business'},400);
 const role=await businessAccess(env,subject,businessId);
 if(!role)return json({error:'forbidden'},403);
 if(request.method==='GET'){
   const customerId=url.searchParams.get('customer_id');
   if(customerId&&!uuid(customerId))return json({error:'invalid_customer_id'},400);
   const query=customerId
     ?env.DB.prepare('SELECT id,customer_id,address,preferences FROM service_locations WHERE business_id=? AND customer_id=? ORDER BY address LIMIT 500').bind(businessId,customerId)
     :env.DB.prepare('SELECT id,customer_id,address,preferences FROM service_locations WHERE business_id=? ORDER BY address LIMIT 1000').bind(businessId);
   const data=await query.all();
   return json({locations:data.results});
 }
 if(role==='worker')return json({error:'forbidden'},403);
 let value:unknown;
 try{value=await request.json();}catch{return json({error:'invalid_json'},400);}
 if(!value||typeof value!=='object'||Array.isArray(value))return json({error:'invalid_input'},400);
 const input=value as LocationInput;
 if(Object.keys(value).some(key=>!['customerId','address','preferences'].includes(key))
    ||!uuid(input.customerId)||typeof input.address!=='string'||!input.address.trim()||input.address.trim().length>300
    ||(input.preferences!==undefined&&input.preferences!==null&&(typeof input.preferences!=='string'||input.preferences.length>2000)))
   return json({error:'invalid_input'},400);
 const id=crypto.randomUUID();
 const preferences=typeof input.preferences==='string'&&input.preferences.trim()?input.preferences.trim():null;
 try{
   const result=await env.DB.prepare('INSERT INTO service_locations(id,business_id,customer_id,address,preferences) SELECT ?,business_id,id,?,? FROM customers WHERE business_id=? AND id=?')
     .bind(id,input.address.trim(),preferences,businessId,input.customerId).run();
   if(result.meta.changes!==1)return json({error:'customer_not_found'},404);
 }catch{return json({error:'location_conflict'},409);}
 return json({id,customer_id:input.customerId,address:input.address.trim(),preferences},201);
}
