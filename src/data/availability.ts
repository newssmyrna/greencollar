export type AvailabilityKind='break'|'sick'|'unavailable';
export type CrewAvailability={businessId:string;eventId:string;workDate:string;memberSubject:string;reportedBy:string;kind:AvailabilityKind;startMinute:number;endMinute:number;createdAt:string};
function endpoint(apiUrl:string,path:string):string{if(!apiUrl.startsWith('https://'))throw new Error('An HTTPS API URL is required');return new URL(path,apiUrl).toString();}
const safeId=(v:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(v);
function object(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function parse(value:unknown):CrewAvailability{
 const row=object(value);
 if(!row||typeof row.businessId!=='string'||typeof row.eventId!=='string'||typeof row.workDate!=='string'||
  typeof row.memberSubject!=='string'||typeof row.reportedBy!=='string'||typeof row.createdAt!=='string'||
  !['break','sick','unavailable'].includes(String(row.kind))||!Number.isInteger(row.startMinute)||!Number.isInteger(row.endMinute))
  throw new Error('Invalid availability response');
 return row as unknown as CrewAvailability;
}
async function error(response:Response):Promise<string>{
 const body=await response.json().then(object).catch(()=>null),code=body&&typeof body.error==='string'?body.error:'';
 const labels:Record<string,string>={authentication_unconfigured:'Availability reporting is not configured.',unauthorized:'Sign in again before updating availability.',forbidden:'You do not have access to this business.',manager_required:'Only an owner or admin can report availability for another worker.',member_not_found:'That worker is not a member of this business.',invalid_availability:'The availability entry is invalid.'};
 return labels[code]??'Availability request failed ('+response.status+').';
}
export async function reportAvailability(apiUrl:string,token:string,input:{businessId:string;eventId:string;workDate:string;kind:AvailabilityKind;startMinute:number;endMinute:number;memberSubject?:string}):Promise<CrewAvailability>{
 if(!token||!safeId(input.businessId)||!safeId(input.eventId))throw new Error('Sign in and choose a valid business first.');
 const response=await fetch(endpoint(apiUrl,'/v1/availability'),{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)});
 if(!response.ok)throw new Error(await error(response));
 const body=object(await response.json());return parse(body?.availability);
}
export async function listAvailability(apiUrl:string,businessId:string,date:string,token:string):Promise<CrewAvailability[]>{
 if(!token||!safeId(businessId)||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Sign in and choose a valid business day first.');
 const url=new URL(endpoint(apiUrl,'/v1/availability'));url.searchParams.set('business_id',businessId);url.searchParams.set('date',date);
 const response=await fetch(url.toString(),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
 if(!response.ok)throw new Error(await error(response));
 const body=object(await response.json());if(!body||body.businessId!==businessId||body.date!==date||!Array.isArray(body.availability))throw new Error('Invalid availability list response');
 return body.availability.map(parse);
}
