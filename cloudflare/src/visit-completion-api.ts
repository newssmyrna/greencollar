import {authenticatedSubject,businessAccess,type Env} from './auth';
import {generateDueVisits,type Agreement} from '../../src/domain/recurrence';

const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const dateOk=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;

type AgreementRow={
 id:string;starts_on:string;ends_on:string|null;frequency:Agreement['frequency'];
 interval_days:number|null;days_of_week:string|null;
};
function daysOfWeek(value:string|null):number[]|undefined|null{
 if(value===null)return undefined;
 try{
   const parsed:unknown=JSON.parse(value);
   return Array.isArray(parsed)&&parsed.every(day=>Number.isInteger(day)&&day>=0&&day<=6)?parsed as number[]:null;
 }catch{return null;}
}

/** Authenticated, tenant-scoped completed recurring-service record.
 * A client may submit measured minutes, never a tenant or customer identity as proof of ownership.
 * Identical completion retries are safe; other duplicate or ineligible state changes are rejected.
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
 const agreement=await env.DB.prepare('SELECT id,starts_on,ends_on,frequency,interval_days,days_of_week FROM service_agreements WHERE business_id=? AND id=? AND active=1 AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)')
 .bind(businessId,agreementId,date,date).first<AgreementRow>();
 if(!agreement)return json({error:'agreement_not_found'},404);
 const weekdays=daysOfWeek(agreement.days_of_week);
 if(weekdays===null)return json({error:'agreement_configuration_invalid'},409);
 let due=false;
 try{
   due=generateDueVisits([{
     id:agreement.id,customerId:'',locationId:'',serviceName:'',rateCents:0,
     estimatedMinutes:1,startsOn:agreement.starts_on,endsOn:agreement.ends_on??undefined,
     frequency:agreement.frequency,intervalDays:agreement.interval_days??undefined,
     daysOfWeek:weekdays,active:true
   }],date,date,1).length===1;
 }catch{return json({error:'agreement_configuration_invalid'},409);}
 if(!due)return json({error:'visit_not_due'},409);
 const existing=await env.DB.prepare('SELECT id,status,actual_minutes FROM service_visits WHERE business_id=? AND agreement_id=? AND scheduled_date=?')
 .bind(businessId,agreementId,date).first<{id:string;status:string;actual_minutes:number|null}>();
 if(existing?.status==='completed'){
   if(existing.actual_minutes===actualMinutes)return json({agreementId,date,status:'completed',actualMinutes},200);
   return json({error:'already_completed'},409);
 }
 if(existing&&!['due','planned','in_progress'].includes(existing.status))
   return json({error:'visit_state_conflict'},409);
 try{
   if(existing){
     const changed=await env.DB.prepare("UPDATE service_visits SET status='completed',actual_minutes=? WHERE id=? AND business_id=? AND status IN ('due','planned','in_progress')")
     .bind(actualMinutes,existing.id,businessId).run();
     if(changed.meta.changes!==1)return json({error:'completion_conflict'},409);
   }else{
     await env.DB.prepare("INSERT INTO service_visits(id,business_id,agreement_id,scheduled_date,status,actual_minutes) VALUES(?,?,?,?,'completed',?)")
       .bind(crypto.randomUUID(),businessId,agreementId,date,actualMinutes).run();
   }
 }catch{return json({error:'completion_conflict'},409);}
 return json({agreementId,date,status:'completed',actualMinutes},201);
}
