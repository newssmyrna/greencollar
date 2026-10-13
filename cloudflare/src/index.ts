import { customerApi } from './customer-api';
import { serviceLocationApi } from './service-location-api';
import { serviceAgreementApi } from './service-agreement-api';
import { dayDataApi } from './day-data-api';
import { businessApi } from './business-api';
import { completeVisitApi } from './visit-completion-api';
import { skipVisitApi } from './visit-skip-api';
import { locationConfirmationApi } from './location-confirmation-api';
import { invoiceDraftApi } from './invoice-draft-api';
import { routingApi } from './routing-api';
import { authenticatedSubject } from './auth';
import type { Env } from './auth';

function json(data:unknown,status=200):Response{
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/health' && request.method==='GET'){
      try{await env.DB.prepare('SELECT 1').first();return json({service:'greencollar-api',status:'ok',database:'connected'});}
      catch{return json({service:'greencollar-api',status:'unavailable'},503);}
    }
    if(url.pathname==='/v1/session'){
      if(request.method!=='GET')return json({error:'method_not_allowed'},405);
      if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)
        return json({error:'authentication_unconfigured'},503);
      const sub=await authenticatedSubject(request,env);
      return sub ? json({authenticated:true}) : json({error:'unauthorized'},401);
    }
    if(url.pathname==='/v1/business')return businessApi(request,env);
    if(url.pathname==='/v1/customers')return customerApi(request,env,url);
    if(url.pathname==='/v1/locations')return serviceLocationApi(request,env,url);
    if(url.pathname==='/v1/agreements')return serviceAgreementApi(request,env,url);
    if(url.pathname==='/v1/day')return dayDataApi(request,env,url);
    if(url.pathname==='/v1/visits/complete')return completeVisitApi(request,env);
    if(url.pathname==='/v1/visits/skip')return skipVisitApi(request,env);
    if(url.pathname==='/v1/location-confirmations')return locationConfirmationApi(request,env);
    if(url.pathname==='/v1/invoice-drafts')return invoiceDraftApi(request,env,url);
    if(url.pathname==='/v1/routing/settings'||url.pathname==='/v1/routing/notice'||url.pathname==='/v1/routing/matrix')return routingApi(request,env);
    return json({error:'not_found'},404);
  }
};
