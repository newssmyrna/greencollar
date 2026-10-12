import {authenticatedSubject,businessAccess,type Env} from './auth';

const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);
const validDate=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const frequencies=['daily','weekly','biweekly','monthly','custom'] as const;
type Frequency=typeof frequencies[number];
type AgreementInput={
 customerId:unknown;locationId:unknown;serviceName:unknown;rateCents:unknown;estimatedMinutes:unknown;
 startsOn:unknown;endsOn?:unknown;frequency:unknown;intervalDays?:unknown;daysOfWeek?:unknown;
 preferredStartMinute?:unknown;preferredFinishMinute?:unknown;fixedStartMinute?:unknown;
};
const integer=(x:unknown,min:number,max:number)=>typeof x==='number'&&Number.isInteger(x)&&x>=min&&x<=max;

export async function agreementsApi(request:Request,env:Env,url:URL):Promise<Response>{
 if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
 if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
 const subject=await authenticatedSubject(request,env);
 if(!subject)return json({error:'unauthorized'},401);
 const businessId=url.searchParams.get('business_id')??'';
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId))return json({error:'invalid_business'},400);
 const role=await businessAccess(env,subject,businessId);
 if(!role)return json({error:'forbidden'},403);
 if(request.method==='GET'){
   const data=await env.DB.prepare(`SELECT a.id,a.customer_id,a.location_id,a.service_name,a.rate_cents,a.estimated_minutes,
     a.starts_on,a.ends_on,a.frequency,a.interval_days,a.days_of_week,a.preferred_start_minute,
     a.preferred_finish_minute,a.fixed_start_minute,a.active,l.address
     FROM service_agreements a JOIN service_locations l
       ON l.id=a.location_id AND l.business_id=a.business_id AND l.customer_id=a.customer_id
     WHERE a.business_id=? ORDER BY a.starts_on DESC,a.id LIMIT 1000`).bind(businessId).all();
   return json({agreements:data.results});
 }
 if(role==='worker')return json({error:'forbidden'},403);
 let value:unknown;
 try{value=await request.json();}catch{return json({error:'invalid_json'},400);}
 if(!value||typeof value!=='object'||Array.isArray(value))return json({error:'invalid_input'},400);
 const input=value as AgreementInput;
 const allowed=['customerId','locationId','serviceName','rateCents','estimatedMinutes','startsOn','endsOn','frequency','intervalDays','daysOfWeek','preferredStartMinute','preferredFinishMinute','fixedStartMinute'];
 if(Object.keys(value).some(key=>!allowed.includes(key)))return json({error:'invalid_input'},400);
 const frequency=input.frequency as Frequency;
 const start=input.startsOn;
 const end=input.endsOn===undefined||input.endsOn===null||input.endsOn===''?null:input.endsOn;
 const days=input.daysOfWeek;
 const weekdayOk=days===undefined||days===null||(Array.isArray(days)&&days.length>=1&&days.length<=7&&days.every(day=>integer(day,0,6))&&new Set(days).size===days.length);
 if(!uuid(input.customerId)||!uuid(input.locationId)||typeof input.serviceName!=='string'||!input.serviceName.trim()||input.serviceName.trim().length>160
   ||!integer(input.rateCents,0,100000000)||!integer(input.estimatedMinutes,1,1440)
   ||!validDate(start)||(end!==null&&(!validDate(end)||end<start))
   ||!frequencies.includes(frequency)||!weekdayOk
   ||(frequency==='custom'?!integer(input.intervalDays,1,366):input.intervalDays!==undefined&&input.intervalDays!==null)
   ||((days!==undefined&&days!==null)&&frequency!=='weekly'&&frequency!=='biweekly')
   ||(input.preferredStartMinute!==undefined&&input.preferredStartMinute!==null&&!integer(input.preferredStartMinute,0,1439))
   ||(input.preferredFinishMinute!==undefined&&input.preferredFinishMinute!==null&&!integer(input.preferredFinishMinute,1,1440))
   ||(input.fixedStartMinute!==undefined&&input.fixedStartMinute!==null&&!integer(input.fixedStartMinute,0,1439)))
   return json({error:'invalid_input'},400);
 const startMinute=input.preferredStartMinute??null,finishMinute=input.preferredFinishMinute??null;
 if(startMinute!==null&&finishMinute!==null&&startMinute>=finishMinute)return json({error:'invalid_time_window'},400);
 const daysJson=Array.isArray(days)?JSON.stringify(days):null;
 const interval=frequency==='custom'?input.intervalDays as number:null;
 const id=crypto.randomUUID();
 try{
   const result=await env.DB.prepare(`INSERT INTO service_agreements(
      id,business_id,customer_id,location_id,service_name,rate_cents,estimated_minutes,
      starts_on,ends_on,frequency,interval_days,days_of_week,preferred_start_minute,
      preferred_finish_minute,fixed_start_minute,active)
     SELECT ?,c.business_id,c.id,l.id,?,?,?,?,?,?,?,?,?,?,?,1
     FROM customers c JOIN service_locations l
       ON l.customer_id=c.id AND l.business_id=c.business_id
     WHERE c.business_id=? AND c.id=? AND l.id=?`)
     .bind(id,input.serviceName.trim(),input.rateCents,input.estimatedMinutes,start,end,frequency,interval,daysJson,
       startMinute,finishMinute,input.fixedStartMinute??null,businessId,input.customerId,input.locationId).run();
   if(result.meta.changes!==1)return json({error:'location_not_found'},404);
 }catch{return json({error:'agreement_conflict'},409);}
 return json({id,customer_id:input.customerId,location_id:input.locationId,service_name:input.serviceName.trim(),
   rate_cents:input.rateCents,estimated_minutes:input.estimatedMinutes,starts_on:start,ends_on:end,
   frequency,interval_days:interval,days_of_week:daysJson,preferred_start_minute:startMinute,
   preferred_finish_minute:finishMinute,fixed_start_minute:input.fixedStartMinute??null,active:1},201);
}
