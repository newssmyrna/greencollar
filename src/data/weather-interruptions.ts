export type WeatherInterruptionReason='rain'|'other';
export type WeatherInterruption={businessId:string;eventId:string;workDate:string;reportedAt:string;reporterSubject:string;reason:WeatherInterruptionReason;completedVisitIds:string[];remainingVisitIds:string[];createdAt:string};
function apiEndpoint(apiUrl:string,path:string):string{
 if(!apiUrl.startsWith('https://'))throw new Error('An HTTPS API URL is required');
 return new URL(path,apiUrl).toString();
}
const safeId=(v:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(v);
function parsed(value:unknown):Record<string,unknown>|null{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function parseInterruption(value:unknown):WeatherInterruption{
 const row=parsed(value);
 if(!row||typeof row.businessId!=='string'||!safeId(row.businessId)||typeof row.eventId!=='string'||!safeId(row.eventId)||
  typeof row.workDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.workDate)||
  typeof row.reportedAt!=='string'||typeof row.createdAt!=='string'||typeof row.reporterSubject!=='string'||
  !['rain','other'].includes(String(row.reason))||
  !Array.isArray(row.completedVisitIds)||!row.completedVisitIds.every(x=>typeof x==='string')||
  !Array.isArray(row.remainingVisitIds)||!row.remainingVisitIds.every(x=>typeof x==='string'))
  throw new Error('Invalid weather interruption response');
 return row as unknown as WeatherInterruption;
}
async function errorMessage(response:Response):Promise<string>{
 const value=await response.json().then(parsed).catch(()=>null),code=value&&typeof value.error==='string'?value.error:'';
 const messages:Record<string,string>={
  authentication_unconfigured:'Weather reporting is not configured.',
  unauthorized:'Sign in again before reporting a weather interruption.',
  forbidden:'You do not have access to this business.',
  field_work_required:'Only an owner/operator or field worker can report an interruption.',
  manager_required:'Only a business owner or admin can review interruption reports.',
  visit_not_found:'One or more visits no longer match this business schedule. Refresh the workday and try again.',
  invalid_report:'The interruption report is invalid.'
 };
 return messages[code]??'Weather interruption request failed ('+response.status+').';
}
export async function reportWeatherInterruption(apiUrl:string,token:string,input:{
 businessId:string;eventId:string;workDate:string;reportedAt:string;reason:WeatherInterruptionReason;
 completedVisitIds:string[];remainingVisitIds:string[]
}):Promise<WeatherInterruption>{
 if(!token||!safeId(input.businessId)||!safeId(input.eventId))throw new Error('Sign in and choose a valid business first.');
 const response=await fetch(apiEndpoint(apiUrl,'/v1/weather-interruptions'),{
  method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)
 });
 if(!response.ok)throw new Error(await errorMessage(response));
 const body=parsed(await response.json());
 return parseInterruption(body?.interruption);
}
export async function listWeatherInterruptions(apiUrl:string,businessId:string,date:string,token:string):Promise<WeatherInterruption[]>{
 if(!token||!safeId(businessId)||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Sign in and choose a valid business day first.');
 const url=new URL(apiEndpoint(apiUrl,'/v1/weather-interruptions'));url.searchParams.set('business_id',businessId);url.searchParams.set('date',date);
 const response=await fetch(url.toString(),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
 if(!response.ok)throw new Error(await errorMessage(response));
 const body=parsed(await response.json());
 if(!body||body.businessId!==businessId||body.date!==date||!Array.isArray(body.interruptions))throw new Error('Invalid interruption list response');
 return body.interruptions.map(parseInterruption);
}
