import {authenticatedSubject,businessAccess,type Env} from './auth';
type Reason='rain'|'other';
type Report={businessId:string;eventId:string;workDate:string;reportedAt:string;reporterSubject:string;reason:Reason;completedVisitIds:string[];remainingVisitIds:string[];createdAt:string};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const configured=(env:Env)=>Boolean(env.OIDC_ISSUER&&env.OIDC_AUDIENCE&&env.OIDC_JWKS_URL);
const safeId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const validDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const validVisitId=(v:string,date:string):string|null=>{
 const match=/^([a-zA-Z0-9_-]{1,100}):(\d{4}-\d{2}-\d{2})$/.exec(v);
 return match&&match[2]===date?match[1]:null;
};
const exactKeys=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
function parseReport(v:unknown):Omit<Report,'reporterSubject'|'createdAt'>|null{
 if(!v||typeof v!=='object'||Array.isArray(v))return null;
 const row=v as Record<string,unknown>;
 if(!exactKeys(row,['businessId','eventId','workDate','reportedAt','reason','completedVisitIds','remainingVisitIds'])||
  !safeId(row.businessId)||!safeId(row.eventId)||!validDate(row.workDate)||
  typeof row.reportedAt!=='string'||Number.isNaN(Date.parse(row.reportedAt))||
  !['rain','other'].includes(String(row.reason))||
  !Array.isArray(row.completedVisitIds)||!Array.isArray(row.remainingVisitIds)||
  row.completedVisitIds.length>100||row.remainingVisitIds.length<1||row.remainingVisitIds.length>100)return null;
 const completed=row.completedVisitIds as unknown[],remaining=row.remainingVisitIds as unknown[];
 if([...completed,...remaining].some(id=>typeof id!=='string')||
  new Set(completed).size!==completed.length||new Set(remaining).size!==remaining.length||
  completed.some(id=>remaining.includes(id)))return null;
 const ids=[...completed,...remaining] as string[];
 if(ids.some(id=>!validVisitId(id,row.workDate)))return null;
 return {businessId:row.businessId,eventId:row.eventId,workDate:row.workDate,reportedAt:row.reportedAt,
  reason:row.reason as Reason,completedVisitIds:completed as string[],remainingVisitIds:remaining as string[]};
}
function parseStored(row:Record<string,unknown>):Report|null{
 try{
  const completed=JSON.parse(String(row.completed_visit_ids)),remaining=JSON.parse(String(row.remaining_visit_ids));
  if(!Array.isArray(completed)||!Array.isArray(remaining))return null;
  return {businessId:String(row.business_id),eventId:String(row.event_id),workDate:String(row.work_date),
   reportedAt:String(row.reported_at),reporterSubject:String(row.reporter_subject),reason:String(row.reason) as Reason,
   completedVisitIds:completed,remainingVisitIds:remaining,createdAt:String(row.created_at)};
 }catch{return null;}
}
export function createWeatherInterruptionApi(subjectFor:(request:Request,env:Env)=>Promise<string|null> = authenticatedSubject){
 return async function weatherInterruptionApi(request:Request,env:Env,url:URL):Promise<Response>{
  if(!configured(env))return json({error:'authentication_unconfigured'},503);
  const subject=await subjectFor(request,env);if(!subject)return json({error:'unauthorized'},401);
  if(request.method==='POST'){
   let input:unknown;try{input=await request.json();}catch{return json({error:'invalid_json'},400);}
   const report=parseReport(input);if(!report)return json({error:'invalid_report'},400);
   const role=await businessAccess(env,subject,report.businessId);if(!role)return json({error:'forbidden'},403);
   if(role!=='owner'&&role!=='worker')return json({error:'field_work_required'},403);
   const visitIds:string[]=[...report.completedVisitIds,...report.remainingVisitIds];
   const agreementIds=[...new Set(visitIds.map(id=>validVisitId(id,report.workDate)!))];
   const placeholders=agreementIds.map(()=>'?').join(',');
   const agreements=await env.DB.prepare(
    'SELECT id FROM service_agreements WHERE business_id=? AND active=1 AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) AND id IN ('+placeholders+')'
   ).bind(report.businessId,report.workDate,report.workDate,...agreementIds).all<{id:string}>();
   const existing=new Set((agreements.results??[]).map(a=>a.id));
   if(agreementIds.some(id=>!existing.has(id)))return json({error:'visit_not_found'},409);
   try{
    await env.DB.prepare('INSERT OR IGNORE INTO weather_interruption_events '+
      '(business_id,event_id,work_date,reported_at,reporter_subject,reason,completed_visit_ids,remaining_visit_ids) '+
      'VALUES(?,?,?,?,?,?,?,?)').bind(report.businessId,report.eventId,report.workDate,report.reportedAt,subject,report.reason,
       JSON.stringify(report.completedVisitIds),JSON.stringify(report.remainingVisitIds)).run();
    const stored=await env.DB.prepare('SELECT business_id,event_id,work_date,reported_at,reporter_subject,reason,'+
      'completed_visit_ids,remaining_visit_ids,created_at FROM weather_interruption_events '+
      'WHERE business_id=? AND event_id=? AND reporter_subject=?').bind(report.businessId,report.eventId,subject).first<Record<string,unknown>>();
    const parsed=stored&&parseStored(stored);
    if(!parsed)return json({error:'interruption_storage_unavailable'},503);
    return json({interruption:parsed},201);
   }catch{return json({error:'interruption_storage_unavailable'},503);}
  }
  if(request.method==='GET'){
   const businessId=url.searchParams.get('business_id')??'',date=url.searchParams.get('date')??'';
   if(!safeId(businessId)||!validDate(date))return json({error:'invalid_parameters'},400);
   const role=await businessAccess(env,subject,businessId);if(!role)return json({error:'forbidden'},403);
   if(role!=='owner'&&role!=='admin')return json({error:'manager_required'},403);
   try{
    const rows=await env.DB.prepare('SELECT business_id,event_id,work_date,reported_at,reporter_subject,reason,'+
      'completed_visit_ids,remaining_visit_ids,created_at FROM weather_interruption_events '+
      'WHERE business_id=? AND work_date=? ORDER BY created_at DESC LIMIT 100').bind(businessId,date).all<Record<string,unknown>>();
    const interruptions=(rows.results??[]).map(parseStored);
    if(interruptions.some(x=>!x))return json({error:'interruption_storage_unavailable'},503);
    return json({businessId,date,interruptions});
   }catch{return json({error:'interruption_storage_unavailable'},503);}
  }
  return json({error:'method_not_allowed'},405);
 };
}
export const weatherInterruptionApi=createWeatherInterruptionApi();
