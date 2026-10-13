import {authenticatedSubject,businessAccess,type Env} from './auth';

type Kind='break'|'sick'|'unavailable';
type Availability={businessId:string;eventId:string;workDate:string;memberSubject:string;reportedBy:string;kind:Kind;startMinute:number;endMinute:number;createdAt:string};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const configured=(env:Env)=>Boolean(env.OIDC_ISSUER&&env.OIDC_AUDIENCE&&env.OIDC_JWKS_URL);
const safeId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const safeSubject=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=160&&!/[\u0000-\u001f]/.test(v);
const validDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const keys=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).length===expected.length&&expected.every(k=>Object.prototype.hasOwnProperty.call(v,k));
function parseInput(value:unknown):Omit<Availability,'reportedBy'|'createdAt'>|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as Record<string,unknown>;
 const required=['businessId','eventId','workDate','kind','startMinute','endMinute'];
 const allowed=[...required,'memberSubject'];
 if(!required.every(k=>Object.prototype.hasOwnProperty.call(row,k))||!keys(row,Object.keys(row).every(k=>allowed.includes(k))?Object.keys(row):[]))return null;
 if(!safeId(row.businessId)||!safeId(row.eventId)||!validDate(row.workDate)||
  !['break','sick','unavailable'].includes(String(row.kind))||
  !Number.isSafeInteger(row.startMinute)||!Number.isSafeInteger(row.endMinute)||
  (row.startMinute as number)<0||(row.endMinute as number)>1440||
  (row.startMinute as number)>=(row.endMinute as number)||
  (row.kind==='break'&&row.endMinute===1440&&row.startMinute===0)||
  (Object.prototype.hasOwnProperty.call(row,'memberSubject')&&!safeSubject(row.memberSubject)))return null;
 return {businessId:row.businessId,eventId:row.eventId,workDate:row.workDate,kind:row.kind as Kind,
  startMinute:row.startMinute as number,endMinute:row.endMinute as number,
  memberSubject:(row.memberSubject as string|undefined)??''};
}
function parseStored(row:Record<string,unknown>):Availability|null{
 if(!safeId(row.business_id)||!safeId(row.event_id)||!validDate(row.work_date)||!safeSubject(row.member_subject)||!safeSubject(row.reported_by)||
  !['break','sick','unavailable'].includes(String(row.kind))||!Number.isInteger(row.start_minute)||!Number.isInteger(row.end_minute))return null;
 return {businessId:row.business_id,eventId:row.event_id,workDate:row.work_date,memberSubject:row.member_subject,
  reportedBy:row.reported_by,kind:row.kind as Kind,startMinute:row.start_minute as number,endMinute:row.end_minute as number,createdAt:String(row.created_at)};
}
export function createAvailabilityApi(subjectFor:(request:Request,env:Env)=>Promise<string|null>=authenticatedSubject){
 return async function availabilityApi(request:Request,env:Env,url:URL):Promise<Response>{
  if(!configured(env))return json({error:'authentication_unconfigured'},503);
  const subject=await subjectFor(request,env);if(!subject)return json({error:'unauthorized'},401);
  if(request.method==='POST'){
   let value:unknown;try{value=await request.json();}catch{return json({error:'invalid_json'},400);}
   const input=parseInput(value);if(!input)return json({error:'invalid_availability'},400);
   const role=await businessAccess(env,subject,input.businessId);if(!role)return json({error:'forbidden'},403);
   const memberSubject=input.memberSubject||subject;
   if(memberSubject!==subject&&role!=='owner'&&role!=='admin')return json({error:'manager_required'},403);
   if(memberSubject!==subject&&!await businessAccess(env,memberSubject,input.businessId))return json({error:'member_not_found'},404);
   await env.DB.prepare('INSERT OR IGNORE INTO crew_availability_events (business_id,event_id,work_date,member_subject,reported_by,kind,start_minute,end_minute) VALUES(?,?,?,?,?,?,?,?)')
    .bind(input.businessId,input.eventId,input.workDate,memberSubject,subject,input.kind,input.startMinute,input.endMinute).run();
   const stored=await env.DB.prepare('SELECT * FROM crew_availability_events WHERE business_id=? AND event_id=? AND reported_by=?')
    .bind(input.businessId,input.eventId,subject).first<Record<string,unknown>>();
   const availability=stored&&parseStored(stored);if(!availability)return json({error:'availability_not_saved'},500);
   return json({availability},201);
  }
  if(request.method==='GET'){
   const businessId=url.searchParams.get('business_id'),date=url.searchParams.get('date');
   if(!safeId(businessId)||!validDate(date))return json({error:'invalid_query'},400);
   const role=await businessAccess(env,subject,businessId);if(!role)return json({error:'forbidden'},403);
   const manager=role==='owner'||role==='admin';
   const result=manager
    ? await env.DB.prepare('SELECT * FROM crew_availability_events WHERE business_id=? AND work_date=? ORDER BY start_minute,member_subject,created_at').bind(businessId,date).all<Record<string,unknown>>()
    : await env.DB.prepare('SELECT * FROM crew_availability_events WHERE business_id=? AND work_date=? AND member_subject=? ORDER BY start_minute,created_at').bind(businessId,date,subject).all<Record<string,unknown>>();
   const availability=(result.results??[]).map(parseStored).filter((v):v is Availability=>Boolean(v));
   return json({businessId,date,availability});
  }
  return json({error:'method_not_allowed'},405);
 };
}
