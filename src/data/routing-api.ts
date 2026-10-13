export type RoutingSettings={
 available:boolean;
 enabled:boolean;
 businessEnabled:boolean;
 noticeAcknowledged:boolean;
 noticeVersion:string|null;
 notice:string;
 termsUrl:string|null;
 privacyUrl:string|null;
 attribution:string;
 manualFallback:boolean;
};

const safeId=(value:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const safeNoticeVersion=(value:string)=>/^[a-zA-Z0-9._-]{1,80}$/.test(value);
function objectValue(value:unknown):Record<string,unknown>|null{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function publicPolicyUrl(value:unknown):string|null{
 if(value===null)return null;
 if(typeof value!=='string')throw new Error('Invalid routing policy URL');
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.search||url.hash)
   throw new Error('Invalid routing policy URL');
  return url.href;
 }catch{throw new Error('Invalid routing policy URL');}
}
function parseSettings(value:unknown):RoutingSettings{
 const row=objectValue(value);
 if(!row||typeof row.available!=='boolean'||typeof row.enabled!=='boolean'
  ||typeof row.businessEnabled!=='boolean'||typeof row.noticeAcknowledged!=='boolean'
  ||typeof row.notice!=='string'||row.notice.length>500||typeof row.attribution!=='string'
  ||row.attribution.length>160||typeof row.manualFallback!=='boolean'
  ||(row.noticeVersion!==null&&(typeof row.noticeVersion!=='string'||!safeNoticeVersion(row.noticeVersion))))
  throw new Error('Invalid routing settings response');
 const termsUrl=publicPolicyUrl(row.termsUrl),privacyUrl=publicPolicyUrl(row.privacyUrl);
 if(row.enabled&&(!row.available||!row.businessEnabled))throw new Error('Invalid routing settings response');
 return {
  available:row.available,enabled:row.enabled,businessEnabled:row.businessEnabled,
  noticeAcknowledged:row.noticeAcknowledged,noticeVersion:row.noticeVersion as string|null,
  notice:row.notice,termsUrl,privacyUrl,attribution:row.attribution,manualFallback:row.manualFallback
 };
}
async function errorFor(response:Response):Promise<Error>{
 const value=await response.json().then(objectValue).catch(()=>null),code=value&&typeof value.error==='string'?value.error:'';
 const messages:Record<string,string>={
  admin_required:'Only a business owner or admin can change the business routing setting.',
  location_notice_required:'Acknowledge the current location notice before continuing.',
  notice_unavailable:'Public routing policy pages are not ready. Manual travel estimates remain available.',
  routing_not_ready:'Provider, current pricing, or policy checks are not ready. Manual travel estimates remain available.',
  routing_storage_unavailable:'Routing settings are unavailable. Manual travel estimates remain available.',
  authentication_unconfigured:'Routing authentication is not configured. Manual travel estimates remain available.',
  forbidden:'You do not have access to routing settings for this business.',
  unauthorized:'Sign in again to check routing settings.',
  invalid_business:'The selected business is invalid.'
 };
 return new Error(messages[code]??'Routing settings request failed ('+response.status+')');
}
async function responseJson(response:Response):Promise<unknown>{
 if(!response.ok)throw await errorFor(response);
 try{return await response.json();}
 catch{throw new Error('Invalid routing settings response');}
}
function endpoint(apiUrl:string,path:string):string{
 if(!apiUrl.startsWith('https://'))throw new Error('An HTTPS API URL is required');
 return new URL(path,apiUrl).toString();
}
function validateRequest(businessId:string,token:string){
 if(!safeId(businessId))throw new Error('Invalid business identifier');
 if(!token)throw new Error('Sign in first');
}
export async function fetchRoutingSettings(apiUrl:string,businessId:string,token:string):Promise<RoutingSettings>{
 validateRequest(businessId,token);
 const url=new URL(endpoint(apiUrl,'/v1/routing/settings'));
 url.searchParams.set('business_id',businessId);
 const response=await fetch(url.toString(),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
 return parseSettings(await responseJson(response));
}
export async function acknowledgeRoutingNotice(
 apiUrl:string,businessId:string,token:string,noticeVersion:string,acknowledged:boolean
):Promise<boolean>{
 validateRequest(businessId,token);
 if(!safeNoticeVersion(noticeVersion)||typeof acknowledged!=='boolean')throw new Error('Invalid routing notice acknowledgment');
 const response=await fetch(endpoint(apiUrl,'/v1/routing/notice'),{
  method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({businessId,acknowledged,noticeVersion})
 });
 const row=objectValue(await responseJson(response));
 if(!row||row.acknowledged!==acknowledged||(acknowledged&&row.noticeVersion!==noticeVersion))
  throw new Error('Invalid routing notice response');
 return acknowledged;
}
export async function setBusinessRoutingEnabled(
 apiUrl:string,businessId:string,token:string,enabled:boolean,noticeAcknowledged:boolean,noticeVersion:string
):Promise<boolean>{
 validateRequest(businessId,token);
 if(typeof enabled!=='boolean'||typeof noticeAcknowledged!=='boolean'||(enabled?!safeNoticeVersion(noticeVersion):noticeVersion!==''&&!safeNoticeVersion(noticeVersion)))
  throw new Error('Invalid business routing setting');
 const response=await fetch(endpoint(apiUrl,'/v1/routing/settings'),{
  method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({businessId,enabled,noticeAcknowledged,noticeVersion})
 });
 const row=objectValue(await responseJson(response));
 if(!row||row.enabled!==enabled||typeof row.manualFallback!=='boolean'
  ||(enabled&&row.noticeVersion!==noticeVersion))
  throw new Error('Invalid business routing response');
 return enabled;
}
