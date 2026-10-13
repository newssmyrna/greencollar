import {authenticatedSubject,businessAccess,type Env} from './auth';
type Task={taskId:string;label:string;assignedSubjects:string[];estimatedMinutes:number};
type Stop={visitId:string;order:number;tasks:Task[]};
type Worker={subject:string;startMinute:number;endMinute:number};
type Route={routeId:string;truckId:string;startMinute:number;endMinute:number;workers:Worker[];stops:Stop[]};
type Draft={businessId:string;workDate:string;version:number;updatedBy:string;updatedAt:string;routes:Route[]};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const configured=(e:Env)=>Boolean(e.OIDC_ISSUER&&e.OIDC_AUDIENCE&&e.OIDC_JWKS_URL);
const safeId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const safeSubject=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=160&&!/[\u0000-\u001f]/.test(v);
const dateOk=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const int=(v:unknown,min:number,max:number):v is number=>Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max;
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const obj=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
function parseRoutes(value:unknown,workDate:string):Route[]|null{
 if(!Array.isArray(value)||value.length<1||value.length>20)return null;
 const routeIds=new Set<string>(),truckIntervals=new Map<string,{start:number;end:number}[]>(),workerIntervals=new Map<string,{start:number;end:number}[]>(),visits=new Set<string>();
 const routes:Route[]=[];
 for(const rawRoute of value){
  const r=obj(rawRoute);if(!r||!exact(r,['routeId','truckId','startMinute','endMinute','workers','stops'])||
   !safeId(r.routeId)||!safeId(r.truckId)||routeIds.has(r.routeId)||
   !int(r.startMinute,0,1439)||!int(r.endMinute,1,1440)||(r.startMinute as number)>=(r.endMinute as number)||
   !Array.isArray(r.workers)||r.workers.length<1||r.workers.length>12||!Array.isArray(r.stops)||r.stops.length>100)return null;
  routeIds.add(r.routeId);
  const interval={start:r.startMinute as number,end:r.endMinute as number};
  const truckList=truckIntervals.get(r.truckId as string)??[];
  if(truckList.some(x=>interval.start<x.end&&x.start<interval.end))return null;
  truckList.push(interval);truckIntervals.set(r.truckId as string,truckList);
  const workerIds=new Set<string>(),workers:Worker[]=[];
  for(const rawWorker of r.workers){
   const w=obj(rawWorker);if(!w||!exact(w,['subject','startMinute','endMinute'])||!safeSubject(w.subject)||
    !int(w.startMinute,0,1439)||!int(w.endMinute,1,1440)||(w.startMinute as number)>=(w.endMinute as number)||workerIds.has(w.subject))return null;
   workerIds.add(w.subject);
   const wi={start:w.startMinute as number,end:w.endMinute as number};
   const list=workerIntervals.get(w.subject as string)??[];
   if(list.some(x=>wi.start<x.end&&x.start<wi.end))return null;
   list.push(wi);workerIntervals.set(w.subject as string,list);
   workers.push({subject:w.subject as string,startMinute:wi.start,endMinute:wi.end});
  }
  const orders=new Set<number>(),stops:Stop[]=[];
  for(const rawStop of r.stops){
   const s=obj(rawStop);if(!s||!exact(s,['visitId','order','tasks'])||typeof s.visitId!=='string'||
    !/^([a-zA-Z0-9_-]{1,100}):(\d{4}-\d{2}-\d{2})$/.test(s.visitId)||!s.visitId.endsWith(':'+workDate)||
    visits.has(s.visitId)||!int(s.order,1,1000)||orders.has(s.order)||!Array.isArray(s.tasks)||s.tasks.length<1||s.tasks.length>20)return null;
   visits.add(s.visitId);orders.add(s.order);
   const taskIds=new Set<string>(),tasks:Task[]=[];
   for(const rawTask of s.tasks){
    const t=obj(rawTask);if(!t||!exact(t,['taskId','label','assignedSubjects','estimatedMinutes'])||
     !safeId(t.taskId)||taskIds.has(t.taskId)||typeof t.label!=='string'||t.label.trim().length<1||t.label.length>80||
     !Array.isArray(t.assignedSubjects)||t.assignedSubjects.length<1||!t.assignedSubjects.every(safeSubject)||
     new Set(t.assignedSubjects).size!==t.assignedSubjects.length||!t.assignedSubjects.every(s=>workerIds.has(s))||
     !int(t.estimatedMinutes,1,1440))return null;
    taskIds.add(t.taskId);tasks.push({taskId:t.taskId,label:t.label.trim(),assignedSubjects:t.assignedSubjects as string[],estimatedMinutes:t.estimatedMinutes as number});
   }
   stops.push({visitId:s.visitId,order:s.order as number,tasks});
  }
  routes.push({routeId:r.routeId,truckId:r.truckId,startMinute:interval.start,endMinute:interval.end,workers,stops:stops.sort((a,b)=>a.order-b.order)});
 }
 return routes;
}
function parseStored(row:Record<string,unknown>):Draft|null{
 try{const routes=JSON.parse(String(row.schedule_json));if(!Array.isArray(routes)||!safeId(row.business_id)||!dateOk(row.work_date)||!Number.isSafeInteger(row.version)||!safeSubject(row.updated_by))return null;
 return {businessId:row.business_id,workDate:row.work_date,version:row.version as number,updatedBy:row.updated_by,updatedAt:String(row.updated_at),routes};}catch{return null;}
}
export function createWorkdayScheduleApi(subjectFor:(request:Request,env:Env)=>Promise<string|null>=authenticatedSubject){
 return async function workdayScheduleApi(request:Request,env:Env,url:URL):Promise<Response>{
  if(!configured(env))return json({error:'authentication_unconfigured'},503);
  const subject=await subjectFor(request,env);if(!subject)return json({error:'unauthorized'},401);
  if(request.method==='POST'){
   let value:unknown;try{value=await request.json();}catch{return json({error:'invalid_json'},400);}
   const body=obj(value);if(!body||!exact(body,['businessId','workDate','expectedVersion','routes'])||!safeId(body.businessId)||!dateOk(body.workDate)||!int(body.expectedVersion,0,100000))return json({error:'invalid_schedule'},400);
   const role=await businessAccess(env,subject,body.businessId);if(!role)return json({error:'forbidden'},403);
   if(role!=='owner'&&role!=='admin')return json({error:'manager_required'},403);
   const routes=parseRoutes(body.routes,body.workDate);if(!routes)return json({error:'invalid_schedule'},400);
   const workerIds=[...new Set(routes.flatMap(r=>r.workers.map(w=>w.subject)))];
   for(const worker of workerIds)if(!await businessAccess(env,worker,body.businessId))return json({error:'worker_not_found'},409);
   const agreementIds=[...new Set(routes.flatMap(r=>r.stops.map(s=>s.visitId.split(':')[0])))];
   if(agreementIds.length){
    const placeholders=agreementIds.map(()=>'?').join(',');
    const found=await env.DB.prepare('SELECT id FROM service_agreements WHERE business_id=? AND active=1 AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) AND id IN ('+placeholders+')')
     .bind(body.businessId,body.workDate,body.workDate,...agreementIds).all<{id:string}>();
    const foundIds=new Set((found.results??[]).map(x=>x.id));if(agreementIds.some(id=>!foundIds.has(id)))return json({error:'visit_not_found'},409);
   }
   const expected=body.expectedVersion as number,now=new Date().toISOString();
   const result=await env.DB.prepare('INSERT INTO workday_schedule_drafts (business_id,work_date,version,schedule_json,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(business_id,work_date) DO UPDATE SET version=excluded.version,schedule_json=excluded.schedule_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE workday_schedule_drafts.version=?')
    .bind(body.businessId,body.workDate,expected+1,JSON.stringify(routes),subject,now,expected).run();
   if(result.meta?.changes===0)return json({error:'version_conflict'},409);
   return json({schedule:{businessId:body.businessId,workDate:body.workDate,version:expected+1,updatedBy:subject,updatedAt:now,routes}},201);
  }
  if(request.method==='GET'){
   const businessId=url.searchParams.get('business_id');
   if(!safeId(businessId))return json({error:'invalid_query'},400);
   const role=await businessAccess(env,subject,businessId);if(!role)return json({error:'forbidden'},403);
   if(url.searchParams.get('members')==='1'){
    if(role!=='owner'&&role!=='admin')return json({error:'manager_required'},403);
    const rows=await env.DB.prepare('SELECT subject,role FROM business_memberships WHERE business_id=? ORDER BY role,subject LIMIT 100').bind(businessId).all<{subject:string;role:string}>();
    const members=(rows.results??[]).filter(row=>safeSubject(row.subject)&&(row.role==='owner'||row.role==='admin'||row.role==='worker')).map(row=>({subject:row.subject,role:row.role}));
    return json({members});
   }
   const workDate=url.searchParams.get('date');
   if(!dateOk(workDate))return json({error:'invalid_query'},400);
   const row=await env.DB.prepare('SELECT * FROM workday_schedule_drafts WHERE business_id=? AND work_date=?').bind(businessId,workDate).first<Record<string,unknown>>();
   if(!row)return json({error:'schedule_not_found'},404);
   const schedule=parseStored(row);if(!schedule)return json({error:'invalid_saved_schedule'},500);
   if(role==='owner'||role==='admin')return json({schedule});
   const routes=schedule.routes.filter(route=>route.workers.some(w=>w.subject===subject));
   return json({schedule:{...schedule,routes}});
  }
  return json({error:'method_not_allowed'},405);
 };
}
export const workdayScheduleApi=createWorkdayScheduleApi();
