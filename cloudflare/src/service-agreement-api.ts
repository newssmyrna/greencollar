import {authenticatedSubject,businessAccess,type Env} from './auth';
import {boundedJson} from './request-json';
import {validRecordId} from '../../src/domain/service-location';
import {serviceAgreementInput,type ServiceAgreementInput} from '../../src/domain/service-agreement';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'
}});
export function createServiceAgreementApi(authenticate:typeof authenticatedSubject=authenticatedSubject){
 return async(request:Request,env:Env,url:URL):Promise<Response>=>{
  if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
  const subject=await authenticate(request,env);if(!subject)return json({error:'unauthorized'},401);
  const businessId=url.searchParams.get('business_id')??'',customerId=url.searchParams.get('customer_id')??'';
  if(!validRecordId(businessId)||!validRecordId(customerId))return json({error:'invalid_parameters'},400);
  try{
   const role=await businessAccess(env,subject,businessId);
   if(!role||(request.method==='POST'&&role==='worker'))return json({error:'forbidden'},403);
   const customer=await env.DB.prepare('SELECT id FROM customers WHERE business_id=? AND id=?').bind(businessId,customerId).first();
   if(!customer)return json({error:'customer_not_found'},404);
   if(request.method==='GET'){
    const result=await env.DB.prepare(
     'SELECT a.*,l.address,l.preferences FROM service_agreements a JOIN service_locations l ON l.id=a.location_id AND l.business_id=a.business_id AND l.customer_id=a.customer_id WHERE a.business_id=? AND a.customer_id=? ORDER BY a.id LIMIT 201'
    ).bind(businessId,customerId).all();
    return json({agreements:result.results.slice(0,200),hasMore:result.results.length>200});
   }
   let raw:unknown;
   try{raw=await boundedJson(request);}catch(e){
    const large=e instanceof Error&&e.message==='payload_too_large';return json({error:large?'payload_too_large':'invalid_json'},large?413:400);
   }
   let input:ServiceAgreementInput;
   try{input=serviceAgreementInput(raw);}catch{return json({error:'invalid_agreement'},400);}
   const location=await env.DB.prepare(
    'SELECT id,address,preferences FROM service_locations WHERE id=? AND business_id=? AND customer_id=?'
   ).bind(input.locationId,businessId,customerId).first<{id:string;address:string;preferences:string|null}>();
   if(!location)return json({error:'location_not_found'},404);
   const id=crypto.randomUUID();
   const agreement={id,customer_id:customerId,location_id:input.locationId,service_name:input.serviceName,rate_cents:input.rateCents,
    estimated_minutes:input.estimatedMinutes,starts_on:input.startsOn,ends_on:input.endsOn??null,frequency:input.frequency,
    interval_days:input.intervalDays??null,days_of_week:null,preferred_start_minute:null,preferred_finish_minute:null,
    fixed_start_minute:null,active:1,address:location.address,preferences:location.preferences};
   const result=await env.DB.prepare(
    'INSERT INTO service_agreements(id,business_id,customer_id,location_id,service_name,rate_cents,estimated_minutes,starts_on,ends_on,frequency,interval_days,active) SELECT ?,?,?,?,?,?,?,?,?,?,?,1 WHERE EXISTS (SELECT 1 FROM service_locations l JOIN customers c ON c.id=l.customer_id AND c.business_id=l.business_id WHERE l.id=? AND l.business_id=? AND l.customer_id=?)'
   ).bind(id,businessId,customerId,input.locationId,input.serviceName,input.rateCents,input.estimatedMinutes,
    input.startsOn,input.endsOn??null,input.frequency,input.intervalDays??null,input.locationId,businessId,customerId).run();
   if(result.meta.changes!==1)return json({error:'location_not_found'},404);
   return json({agreement},201);
  }catch{return json({error:'agreement_storage_unavailable'},503);}
 };
}
export const serviceAgreementApi=createServiceAgreementApi();
