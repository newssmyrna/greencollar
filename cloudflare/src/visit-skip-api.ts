import {authenticatedSubject,businessAccess,type Env} from './auth';
import {boundedJson} from './request-json';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const idOk=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const dateOk=(value:unknown):value is string=>typeof value==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

/** Authenticated tenant-scoped transition for work the operator explicitly skips. */
export function createVisitSkipApi(authenticate:typeof authenticatedSubject=authenticatedSubject){
 return async(request:Request,env:Env):Promise<Response>=>{
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
  const subject=await authenticate(request,env);if(!subject)return json({error:'unauthorized'},401);
  let data:unknown;
  try{data=await boundedJson(request);}catch(e){
   const large=e instanceof Error&&e.message==='payload_too_large';
   return json({error:large?'payload_too_large':'invalid_json'},large?413:400);
  }
  if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'invalid_input'},400);
  const {businessId,agreementId,date}=data as Record<string,unknown>;
  if(!idOk(businessId)||!idOk(agreementId)||!dateOk(date))return json({error:'invalid_visit'},400);
  try{
   if(!await businessAccess(env,subject,businessId))return json({error:'forbidden'},403);
   const agreement=await env.DB.prepare('SELECT id FROM service_agreements WHERE business_id=? AND id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)')
    .bind(businessId,agreementId,date,date).first();
   if(!agreement)return json({error:'agreement_not_found'},404);
   const saved=await env.DB.prepare(`INSERT INTO service_visits(id,business_id,agreement_id,scheduled_date,status,actual_minutes)
    VALUES(?,?,?,?, 'skipped',NULL)
    ON CONFLICT(agreement_id,scheduled_date) DO UPDATE SET
     status='skipped',actual_minutes=NULL,completed_customer_id=NULL,completed_customer_name=NULL,
     completed_service_name=NULL,completed_rate_cents=NULL
    WHERE service_visits.business_id=excluded.business_id AND service_visits.status IN ('due','planned','skipped')
    RETURNING id`).bind(crypto.randomUUID(),businessId,agreementId,date).first<{id:string}>();
   if(!saved)return json({error:'visit_not_skippable'},409);
   return json({businessId,agreementId,date,status:'skipped'},200);
  }catch{return json({error:'visit_status_storage_unavailable'},503);}
 };
}
export const skipVisitApi=createVisitSkipApi();
