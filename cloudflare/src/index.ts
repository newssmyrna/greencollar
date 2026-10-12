import { customerApi } from './customer-api';
import { dayDataApi } from './day-data-api';
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
    if(url.pathname==='/v1/customers')return customerApi(request,env,url);
    if(url.pathname==='/v1/day')return dayDataApi(request,env,url);
    return json({error:'not_found'},404);
  }
};
