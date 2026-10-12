import {authenticatedSubject,businessAccess,type Env} from './auth';
import {boundedJson} from './request-json';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const recordId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const eventIdOk=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const dateOk=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const kinds=['arrival','departure'] as const;
const sources=['gps_suggestion','manual'] as const;
const proximities=['within_radius','outside_radius','uncertain','unavailable','manual'] as const;
type EventRow={id:string;business_id:string;agreement_id:string;service_date:string;kind:string;operator_subject:string;confirmed_at:number;source:string;proximity:string;manual_reason:string|null;created_at:string};
function sameEvent(row:EventRow,input:{businessId:string;agreementId:string;date:string;kind:'arrival'|'departure';subject:string;confirmedAt:number;source:'gps_suggestion'|'manual';proximity:string;manualReason:string|null}){
 return row.business_id===input.businessId&&row.agreement_id===input.agreementId&&row.service_date===input.date&&row.kind===input.kind&&row.operator_subject===input.subject&&row.confirmed_at===input.confirmedAt&&row.source===input.source&&row.proximity===input.proximity&&row.manual_reason===input.manualReason;
}
/** Append-only tenant audit events for operator-confirmed arrival/departure. */
export function createLocationConfirmationApi(authenticate:typeof authenticatedSubject=authenticatedSubject){
 return async(request:Request,env:Env):Promise<Response>=>{
  if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
  const subject=await authenticate(request,env);if(!subject)return json({error:'unauthorized'},401);
  const url=new URL(request.url),businessId=url.searchParams.get('business_id')??'';
  if(!recordId(businessId))return json({error:'invalid_business'},400);
  try{
   const role=await businessAccess(env,subject,businessId);if(!role)return json({error:'forbidden'},403);
   if(request.method==='GET'){
    const date=url.searchParams.get('date')??'';if(!dateOk(date))return json({error:'invalid_date'},400);
    const result=await env.DB.prepare('SELECT id,agreement_id,service_date,kind,operator_subject,confirmed_at,source,proximity,manual_reason,created_at FROM location_confirmations WHERE business_id=? AND service_date=? ORDER BY confirmed_at,id LIMIT 201').bind(businessId,date).all();
    return json({events:result.results.slice(0,200),hasMore:result.results.length>200});
   }
   let raw:unknown;
   try{raw=await boundedJson(request);}catch(e){const large=e instanceof Error&&e.message==='payload_too_large';return json({error:large?'payload_too_large':'invalid_json'},large?413:400);}
   if(!raw||typeof raw!=='object'||Array.isArray(raw))return json({error:'invalid_event'},400);
   const input=raw as Record<string,unknown>;
   const {eventId, businessId:bodyBusiness, agreementId, date, kind, source, proximity:status, manualReason, confirmedAt}=input;
   if(!eventIdOk(eventId)||bodyBusiness!==businessId||!recordId(agreementId)||!dateOk(date)||(kind!=='arrival'&&kind!=='departure')||(source!=='gps_suggestion'&&source!=='manual')||!proximities.includes(status as typeof proximities[number])||typeof confirmedAt!=='number'||!Number.isSafeInteger(confirmedAt)||confirmedAt<0||confirmedAt>Date.now()+300000)return json({error:'invalid_event'},400);
   const eventKind=kind as 'arrival'|'departure',eventSource=source as 'gps_suggestion'|'manual',eventProximity=status as typeof proximities[number];
   let reason:string|null=null;
   if(eventSource==='gps_suggestion'){
    const expected=eventKind==='arrival'?'within_radius':'outside_radius';
    if(eventProximity!==expected||manualReason!==undefined)return json({error:'invalid_gps_confirmation'},400);
   }else{
    if(typeof manualReason!=='string'||!manualReason.trim()||manualReason.trim().length>280)return json({error:'manual_reason_required'},400);
    if(eventProximity!=='manual')return json({error:'invalid_manual_confirmation'},400);
    reason=manualReason.trim();
   }
   const agreement=await env.DB.prepare('SELECT id FROM service_agreements WHERE business_id=? AND id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)').bind(businessId,agreementId,date,date).first();
   if(!agreement)return json({error:'agreement_not_found'},404);
   const write=await env.DB.prepare('INSERT INTO location_confirmations(id,business_id,agreement_id,service_date,kind,operator_subject,confirmed_at,source,proximity,manual_reason) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id').bind(eventId,businessId,agreementId,date,eventKind,subject,confirmedAt,eventSource,eventProximity,reason).first<{id:string}>();
   if(write)return json({eventId,duplicate:false},201);
   const existing=await env.DB.prepare('SELECT id,business_id,agreement_id,service_date,kind,operator_subject,confirmed_at,source,proximity,manual_reason,created_at FROM location_confirmations WHERE id=?').bind(eventId).first<EventRow>();
   if(existing&&sameEvent(existing,{businessId,agreementId,date,kind:eventKind,subject,confirmedAt,source:eventSource,proximity:eventProximity,manualReason:reason}))return json({eventId,duplicate:true},200);
   return json({error:'event_id_conflict'},409);
  }catch{return json({error:'location_confirmation_storage_unavailable'},503);}
 };
}
export const locationConfirmationApi=createLocationConfirmationApi();
