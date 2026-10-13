import {authenticatedSubject,businessAccess,type Env} from './auth';
import {boundedJson} from './request-json';
import {requestGoogleRouteTable,type RoadCoordinate,type RoadTable} from './road-provider';
import {
 estimateRoadCostMicroUsd,MIN_ESSENTIALS_RATE_MICRO_USD_PER_1000,
 reserveRoadUsage,ROAD_MONTHLY_ELEMENT_LIMIT,ROAD_MONTHLY_SPEND_CAP_MICRO_USD,
 roadBillingMonthKey
} from './road-usage-meter';

const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const configured=(env:Env)=>Boolean(env.OIDC_ISSUER&&env.OIDC_AUDIENCE&&env.OIDC_JWKS_URL);
const businessIdOk=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const noticeVersionOk=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9._-]{1,80}$/.test(v);
const dateOk=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const publicHttpsUrl=(value:string|undefined):string|null=>{
 if(!value)return null;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash?url.href:null;}catch{return null;}
};
function pacificDate(date:Date):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const value=(type:string)=>parts.find(part=>part.type===type)?.value??'';
 return `${value('year')}-${value('month')}-${value('day')}`;
}
function policyReady(env:Env):boolean{
 return env.ROAD_ROUTING_POLICY_PUBLIC==='true'
  &&Boolean(publicHttpsUrl(env.ROAD_ROUTING_TERMS_URL))
  &&Boolean(publicHttpsUrl(env.ROAD_ROUTING_PRIVACY_URL))
  &&noticeVersionOk(env.ROAD_ROUTING_NOTICE_VERSION);
}
function rateMicroUsd(env:Env):number|null{
 const value=Number(env.ROAD_ROUTING_RATE_MICRO_USD_PER_1000);
 return Number.isSafeInteger(value)&&value>=MIN_ESSENTIALS_RATE_MICRO_USD_PER_1000?value:null;
}
function rateReady(env:Env,now:Date):boolean{
 const month=roadBillingMonthKey(now),rate=rateMicroUsd(env),reviewed=env.ROAD_ROUTING_RATE_REVIEWED_ON;
 if(env.ROAD_ROUTING_RATE_CARD_MONTH!==month||rate===null||!dateOk(reviewed))return false;
 const today=pacificDate(now);
 if(reviewed>today)return false;
 const [y,m,d]=reviewed.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);
 const age=(Date.UTC(ty,tm-1,td)-Date.UTC(y,m-1,d))/86_400_000;
 return Number.isInteger(age)&&age>=0&&age<=31;
}
function providerReady(env:Env,now:Date):boolean{
 return env.ROAD_ROUTING_PROVIDER_ENABLED==='true'&&policyReady(env)&&rateReady(env,now)
  &&typeof env.GOOGLE_ROUTES_API_KEY==='string'&&env.GOOGLE_ROUTES_API_KEY.length>=16&&env.GOOGLE_ROUTES_API_KEY.length<=256;
}
function parsePoints(value:unknown):RoadCoordinate[]|null{
 if(!Array.isArray(value)||value.length<2||value.length>25)return null;
 const points:RoadCoordinate[]=[];
 for(const item of value){
  if(!item||typeof item!=='object'||Array.isArray(item))return null;
  const row=item as Record<string,unknown>;
  if(Object.keys(row).some(key=>!['id','lat','lon'].includes(key))||Object.keys(row).length!==3
   ||typeof row.id!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(row.id)
   ||typeof row.lat!=='number'||!Number.isFinite(row.lat)||Math.abs(row.lat)>90
   ||typeof row.lon!=='number'||!Number.isFinite(row.lon)||Math.abs(row.lon)>180)return null;
  points.push({id:row.id,lat:row.lat,lon:row.lon});
 }
 return new Set(points.map(point=>point.id)).size===points.length?points:null;
}
function exactKeys(value:Record<string,unknown>,keys:string[]):boolean{
 return Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
}

type MemberRole='owner'|'admin'|'worker';
type RoutingDependencies={
 authenticate?:(request:Request,env:Env)=>Promise<string|null>;
 membership?:(env:Env,subject:string,businessId:string)=>Promise<MemberRole|null>;
 provider?:(points:RoadCoordinate[],apiKey:string)=>Promise<RoadTable>;
 reserve?:(db:D1Database,month:string,elements:number,costMicroUsd:number,now:Date)=>Promise<boolean>;
 now?:()=>Date;
};

/** Public policy flags and provider credentials are unset by default. */
export function createRoutingApi(dependencies:RoutingDependencies={}){
 const authenticate=dependencies.authenticate??authenticatedSubject;
 const membership=dependencies.membership??businessAccess;
 const provider=dependencies.provider??requestGoogleRouteTable;
 const reserve:NonNullable<RoutingDependencies['reserve']>=dependencies.reserve??(
  (db:D1Database,month:string,elements:number,cost:number,now:Date)=>reserveRoadUsage(db,month,elements,cost,now)
 );
 const clock=dependencies.now??(()=>new Date());
 return async(request:Request,env:Env):Promise<Response>=>{
  const path=new URL(request.url).pathname;
  if(!['/v1/routing/settings','/v1/routing/notice','/v1/routing/matrix'].includes(path))return json({error:'not_found'},404);
  if((path==='/v1/routing/settings'&&request.method!=='GET'&&request.method!=='POST')
   ||(path!=='/v1/routing/settings'&&request.method!=='POST'))return json({error:'method_not_allowed'},405);
  if(!configured(env))return json({error:'authentication_unconfigured',manualFallback:true},503);
  const subject=await authenticate(request,env);
  if(!subject)return json({error:'unauthorized',manualFallback:true},401);
  const url=new URL(request.url),now=clock();
  let input:Record<string,unknown>|null=null;
  if(request.method==='POST'){
   try{const raw=await boundedJson(request,8192);if(!raw||typeof raw!=='object'||Array.isArray(raw))return json({error:'invalid_input'},400);input=raw as Record<string,unknown>;}
   catch(error){const large=error instanceof Error&&error.message==='payload_too_large';return json({error:large?'payload_too_large':'invalid_json'},large?413:400);}
  }
  const businessId=request.method==='GET'?url.searchParams.get('business_id'):input?.businessId;
  if(!businessIdOk(businessId))return json({error:'invalid_business'},400);
  try{
   const role=await membership(env,subject,businessId);
   if(!role)return json({error:'forbidden',manualFallback:true},403);
   const version=env.ROAD_ROUTING_NOTICE_VERSION??'';
   if(path==='/v1/routing/settings'&&request.method==='GET'){
    const setting=await env.DB.prepare('SELECT enabled,notice_version FROM business_routing_settings WHERE business_id=?').bind(businessId).first<{enabled:number;notice_version:string}>();
    const available=providerReady(env,now);
    return json({available,enabled:Boolean(setting?.enabled===1&&setting.notice_version===version&&available),noticeVersion:noticeVersionOk(version)?version:null,
     notice:'Selected job coordinates will be sent to Google to calculate driving durations. GreenCollar does not send names, contact details, service notes, employee identifiers, or device GPS.',
     termsUrl:policyReady(env)?publicHttpsUrl(env.ROAD_ROUTING_TERMS_URL):null,
     privacyUrl:policyReady(env)?publicHttpsUrl(env.ROAD_ROUTING_PRIVACY_URL):null,
     attribution:`Powered by Google, © ${pacificDate(now).slice(0,4)}`,
     manualFallback:!Boolean(setting?.enabled===1&&setting.notice_version===version&&available)});
   }
   if(path==='/v1/routing/settings'){
    if(role!=='owner'&&role!=='admin')return json({error:'admin_required'},403);
    if(!input||!exactKeys(input,['businessId','enabled','noticeAcknowledged','noticeVersion'])||typeof input.enabled!=='boolean')return json({error:'invalid_input'},400);
    if(input.enabled){
     if(input.noticeAcknowledged!==true||input.noticeVersion!==version||!providerReady(env,now))return json({error:'routing_not_ready',manualFallback:true},409);
     const adminAcknowledgement=await env.DB.prepare('SELECT 1 AS acknowledged FROM routing_notice_acknowledgements WHERE business_id=? AND subject=? AND notice_version=?').bind(businessId,subject,version).first<{acknowledged:number}>();
     if(!adminAcknowledgement)return json({error:'location_notice_required',manualFallback:true},428);
    }
    const savedVersion=noticeVersionOk(version)?version:'disabled';
    await env.DB.prepare(`INSERT INTO business_routing_settings(business_id,enabled,notice_version,updated_by,updated_at)
     VALUES(?,?,?,?,?) ON CONFLICT(business_id) DO UPDATE SET enabled=excluded.enabled,
     notice_version=excluded.notice_version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
     .bind(businessId,input.enabled?1:0,savedVersion,subject,now.toISOString()).run();
    return json({enabled:input.enabled,noticeVersion:input.enabled?version:null,manualFallback:!input.enabled});
   }
   if(path==='/v1/routing/notice'){
    if(!input||!exactKeys(input,['businessId','acknowledged','noticeVersion'])||typeof input.acknowledged!=='boolean')return json({error:'invalid_input'},400);
    if(!input.acknowledged){
     await env.DB.prepare('DELETE FROM routing_notice_acknowledgements WHERE business_id=? AND subject=?').bind(businessId,subject).run();
     return json({acknowledged:false,manualFallback:true});
    }
    if(!policyReady(env)||input.noticeVersion!==version)return json({error:'notice_unavailable',manualFallback:true},409);
    await env.DB.prepare(`INSERT OR REPLACE INTO routing_notice_acknowledgements(business_id,subject,notice_version,acknowledged_at)
     VALUES(?,?,?,?)`).bind(businessId,subject,version,now.toISOString()).run();
    return json({acknowledged:true,noticeVersion:version});
   }
   if(!input||!exactKeys(input,['businessId','points']))return json({error:'invalid_input',manualFallback:true},400);
   if(!providerReady(env,now))return json({error:'routing_unavailable',manualFallback:true},503);
   const setting=await env.DB.prepare('SELECT enabled,notice_version FROM business_routing_settings WHERE business_id=?').bind(businessId).first<{enabled:number;notice_version:string}>();
   if(setting?.enabled!==1||setting.notice_version!==version)return json({error:'routing_disabled',manualFallback:true},409);
   const acknowledgement=await env.DB.prepare('SELECT 1 AS acknowledged FROM routing_notice_acknowledgements WHERE business_id=? AND subject=? AND notice_version=?').bind(businessId,subject,version).first<{acknowledged:number}>();
   if(!acknowledgement)return json({error:'location_notice_required',manualFallback:true},428);
   const points=parsePoints(input.points);
   if(!points)return json({error:'invalid_points',manualFallback:true},400);
   const elements=points.length*points.length,rate=rateMicroUsd(env);
   if(rate===null)return json({error:'routing_unavailable',manualFallback:true},503);
   const cost=estimateRoadCostMicroUsd(elements,rate),month=roadBillingMonthKey(now);
   if(elements>ROAD_MONTHLY_ELEMENT_LIMIT||cost>ROAD_MONTHLY_SPEND_CAP_MICRO_USD)
    return json({error:'monthly_routing_limit_reached',manualFallback:true},429);
   let reserved=false;
   try{reserved=await reserve(env.DB,month,elements,cost,now);}catch{return json({error:'routing_meter_unavailable',manualFallback:true},503);}
   if(!reserved)return json({error:'monthly_routing_limit_reached',manualFallback:true},429);
   try{
    const result=await provider(points,env.GOOGLE_ROUTES_API_KEY!);
    return json({durations:result.durations,attribution:`Powered by Google, © ${pacificDate(now).slice(0,4)}`});
   }catch{return json({error:'routing_provider_unavailable',manualFallback:true},502);}
  }catch{return json({error:'routing_storage_unavailable',manualFallback:true},503);}
 };
}

export const routingApi=createRoutingApi();
