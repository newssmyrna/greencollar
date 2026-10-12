import {authenticatedSubject,businessAccess,type Env} from './auth';
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const dateOk=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;

/** Authenticated, tenant-scoped completed recurring-service record.
 * A client may submit measured minutes, never a tenant or customer identity as proof of ownership.
 * Repeat completion is rejected rather than double-counted.
 */
export async function completeVisitApi(request:Request,env:Env):Promise<Response>{
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
 const sub=await authenticatedSubject(request,env);
 if(!sub)return json({error:'unauthorized'},401);
 let data:unknown;
 try{data=await request.json();}catch{return json({error:'invalid_json'},400);}
 if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'invalid_input'},400);
 const {businessId,agreementId,date,actualMinutes}=data as Record<string,unknown>;
 if(typeof businessId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId)
    ||typeof agreementId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(agreementId)
    ||typeof date!=='string'||!dateOk(date)
    ||typeof actualMinutes!=='number'||!Number.isInteger(actualMinutes)||actualMinutes<1||actualMinutes>1440)
   return json({error:'invalid_completion'},400);
 if(!await businessAccess(env,sub,businessId))return json({error:'forbidden'},403);
 const agreement=await env.DB.prepare('SELECT id FROM service_agreements WHERE business_id=? AND id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)')
 .bind(businessId,agreementId,date,date).first();
 if(!agreement)return json({error:'agreement_not_found'},404);
 const existing=await env.DB.prepare('SELECT id,status FROM service_visits WHERE business_id=? AND agreement_id=? AND scheduled_date=?')
 .bind(businessId,agreementId,date).first<{id:string;status:string}>();
 if(existing?.status==='completed')return json({error:'already_completed'},409);
 try{
   if(existing){
     const changed=await env.DB.prepare("UPDATE service_visits SET status='completed',actual_minutes=? WHERE id=? AND business_id=? AND status!='completed'")
     .bind(actualMinutes,existing.id,businessId).run();
     if(changed.meta.changes!==1)return json({error:'completion_conflict'},409);
   }else{
     await env.DB.prepare("INSERT INTO service_visits(id,business_id,agreement_id,scheduled_date,status,actual_minutes) VALUES(?,?,?,?,'completed',?)")
       .bind(crypto.randomUUID(),businessId,agreementId,date,actualMinutes).run();
   }
 }catch{return json({error:'completion_conflict'},409);}
 return json({agreementId,date,status:'completed',actualMinutes},201);
}
