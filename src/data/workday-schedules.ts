export type ScheduledTask={taskId:string;label:string;assignedSubjects:string[];estimatedMinutes:number};
export type ScheduledStop={visitId:string;order:number;tasks:ScheduledTask[]};
export type ScheduledWorker={subject:string;startMinute:number;endMinute:number};
export type ScheduledRoute={routeId:string;truckId:string;startMinute:number;endMinute:number;workers:ScheduledWorker[];stops:ScheduledStop[]};
export type WorkdaySchedule={businessId:string;workDate:string;version:number;updatedBy:string;updatedAt:string;routes:ScheduledRoute[]};
function endpoint(base:string,path:string){if(!base.startsWith('https://'))throw new Error('An HTTPS API URL is required');return new URL(path,base).toString();}
function obj(v:unknown):Record<string,unknown>|null{return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;}
function parse(v:unknown):WorkdaySchedule{const row=obj(v);if(!row||typeof row.businessId!=='string'||typeof row.workDate!=='string'||!Number.isInteger(row.version)||!Array.isArray(row.routes)||typeof row.updatedBy!=='string'||typeof row.updatedAt!=='string')throw new Error('Invalid schedule response');return row as unknown as WorkdaySchedule;}
async function fail(response:Response):Promise<string>{const b=await response.json().then(obj).catch(()=>null),code=b&&typeof b.error==='string'?b.error:'';const errors:Record<string,string>={manager_required:'Only an owner or admin can draft a workday schedule.',forbidden:'You do not have access to this business.',worker_not_found:'One or more assigned workers are not members of this business.',visit_not_found:'One or more scheduled stops are no longer active. Refresh the workday.',version_conflict:'This schedule changed after you opened it. Reload before saving.'};return errors[code]??'Schedule request failed ('+response.status+').';}
export async function saveWorkdaySchedule(base:string,token:string,input:{businessId:string;workDate:string;expectedVersion:number;routes:ScheduledRoute[]}):Promise<WorkdaySchedule>{
 if(!token)throw new Error('Sign in before editing a schedule.');
 const response=await fetch(endpoint(base,'/v1/workday-schedules'),{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)});
 if(!response.ok)throw new Error(await fail(response));const b=obj(await response.json());return parse(b?.schedule);
}
export async function getWorkdaySchedule(base:string,businessId:string,date:string,token:string):Promise<WorkdaySchedule>{
 const url=new URL(endpoint(base,'/v1/workday-schedules'));url.searchParams.set('business_id',businessId);url.searchParams.set('date',date);
 const response=await fetch(url.toString(),{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!response.ok)throw new Error(await fail(response));
 const b=obj(await response.json());return parse(b?.schedule);
}
