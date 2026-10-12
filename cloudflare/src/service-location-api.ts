import {boundedJson} from './request-json';
import {authenticatedSubject,businessAccess,type Env} from './auth';
import {serviceLocationInput,validRecordId,type ServiceLocationInput} from '../../src/domain/service-location';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'
}});
/** Authentication is injectable only by server-side tests; production uses verified JWTs. */
export function createServiceLocationApi(authenticate:typeof authenticatedSubject=authenticatedSubject){
  return async(request:Request,env:Env,url:URL):Promise<Response>=>{
    if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
    if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
    const subject=await authenticate(request,env);
    if(!subject)return json({error:'unauthorized'},401);
    const businessId=url.searchParams.get('business_id')??'';
    const customerId=url.searchParams.get('customer_id')??'';
    if(!validRecordId(businessId)||!validRecordId(customerId))return json({error:'invalid_parameters'},400);
    try{
    const role=await businessAccess(env,subject,businessId);
    if(!role)return json({error:'forbidden'},403);
    if(request.method==='POST'&&role==='worker')return json({error:'forbidden'},403);
      const customer=await env.DB.prepare('SELECT id FROM customers WHERE business_id=? AND id=?')
        .bind(businessId,customerId).first();
      if(!customer)return json({error:'customer_not_found'},404);
      if(request.method==='GET'){
        const result=await env.DB.prepare(
          'SELECT id,customer_id,address,preferences,lat,lon FROM service_locations WHERE business_id=? AND customer_id=? ORDER BY id LIMIT 201'
        ).bind(businessId,customerId).all();
        return json({locations:result.results.slice(0,200),hasMore:result.results.length>200});
      }
      let raw:unknown;
      try{raw=await boundedJson(request);}catch(e){
        const large=e instanceof Error&&e.message==='payload_too_large';
        return json({error:large?'payload_too_large':'invalid_json'},large?413:400);
      }
      let input:ServiceLocationInput;
      try{input=serviceLocationInput(raw);}catch{return json({error:'invalid_location'},400);}
      const id=crypto.randomUUID();
      // Recheck the tenant/customer relationship in the write itself.
      const result=await env.DB.prepare(
        'INSERT INTO service_locations(id,business_id,customer_id,address,preferences) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM customers WHERE business_id=? AND id=?)'
      ).bind(id,businessId,customerId,input.address,input.preferences||null,businessId,customerId).run();
      if(result.meta.changes!==1)return json({error:'customer_not_found'},404);
      return json({location:{id,customer_id:customerId,address:input.address,preferences:input.preferences||null,lat:null,lon:null}},201);
    }catch{return json({error:'location_storage_unavailable'},503);}
  };
}
export const serviceLocationApi=createServiceLocationApi();
