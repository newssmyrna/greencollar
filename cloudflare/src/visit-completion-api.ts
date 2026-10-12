import {authenticatedSubject,businessAccess,type Env} from './auth';
import {boundedJson} from './request-json';
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const dateOk=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;

/** Authenticated, tenant-scoped completion with immutable billing identity and price snapshots. */
export function createVisitCompletionApi(authenticate:typeof authenticatedSubject=authenticatedSubject){
 return async(request:Request,env:Env):Promise<Response>=>{
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
  const sub=await authenticate(request,env);
  if(!sub)return json({error:'unauthorized'},401);
  let data:unknown;
  try{data=await boundedJson(request);}catch(e){
   const large=e instanceof Error&&e.message==='payload_too_large';
   return json({error:large?'payload_too_large':'invalid_json'},large?413:400);
  }
  if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'invalid_input'},400);
  const {businessId,agreementId,date,actualMinutes}=data as Record<string,unknown>;
  const rawWorkNote=(data as Record<string,unknown>).workNote;
  const workNote=rawWorkNote===undefined?'':rawWorkNote;
  if(typeof businessId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId)
     ||typeof agreementId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(agreementId)
     ||typeof date!=='string'||!dateOk(date)
     ||typeof actualMinutes!=='number'||!Number.isInteger(actualMinutes)||actualMinutes<1||actualMinutes>1440
     ||typeof workNote!=='string'||workNote.length>1000)
    return json({error:'invalid_completion'},400);
  try{
   if(!await businessAccess(env,sub,businessId))return json({error:'forbidden'},403);
   const agreement=await env.DB.prepare('SELECT id FROM service_agreements WHERE business_id=? AND id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)')
    .bind(businessId,agreementId,date,date).first();
   if(!agreement)return json({error:'agreement_not_found'},404);
   // One statement captures the billing facts as it changes the visit state.
   // A conflicting completed visit returns no row, so concurrent retries cannot rewrite it.
   const saved=await env.DB.prepare(`INSERT INTO service_visits(
     id,business_id,agreement_id,scheduled_date,status,actual_minutes,
     completed_customer_id,completed_customer_name,completed_service_name,completed_rate_cents,work_note
    )
    SELECT ?,a.business_id,a.id,?,'completed',?,a.customer_id,c.name,a.service_name,a.rate_cents,?
    FROM service_agreements a JOIN customers c ON c.id=a.customer_id AND c.business_id=a.business_id
    WHERE a.business_id=? AND a.id=? AND a.starts_on<=? AND (a.ends_on IS NULL OR a.ends_on>=?)
    ON CONFLICT(agreement_id,scheduled_date) DO UPDATE SET
     status='completed',actual_minutes=excluded.actual_minutes,
     completed_customer_id=excluded.completed_customer_id,
     completed_customer_name=excluded.completed_customer_name,
     completed_service_name=excluded.completed_service_name,
     completed_rate_cents=excluded.completed_rate_cents,
     work_note=excluded.work_note
    WHERE service_visits.business_id=excluded.business_id AND service_visits.status!='completed'
    RETURNING id`).bind(crypto.randomUUID(),date,actualMinutes,workNote,businessId,agreementId,date,date).first<{id:string}>();
   if(!saved)return json({error:'already_completed'},409);
   return json({agreementId,date,status:'completed',actualMinutes,workNote},201);
  }catch{return json({error:'completion_storage_unavailable'},503);}
 };
}
export const completeVisitApi=createVisitCompletionApi();
