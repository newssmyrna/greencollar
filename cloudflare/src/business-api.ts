import {authenticatedSubject, type Env} from './auth';

const respond=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const configured=(env:Env)=>Boolean(env.OIDC_ISSUER&&env.OIDC_AUDIENCE&&env.OIDC_JWKS_URL);

/**
 * One business per owner for initial solo-operator release.
 * Signed identity is taken only from a verified JWT, NEVER from a request body.
 * Unique membership subject index (migration 0004) prevents concurrent duplicate onboarding.
 */
export async function businessApi(request:Request,env:Env):Promise<Response>{
  if(!configured(env))return respond({error:'authentication_unconfigured'},503);
  const subject=await authenticatedSubject(request,env);
  if(!subject)return respond({error:'unauthorized'},401);
  if(request.method==='GET'){
    const rows=await env.DB.prepare(
      "SELECT b.id,b.name,m.role FROM business_memberships m JOIN businesses b ON b.id=m.business_id WHERE m.subject=?"
    ).bind(subject).all();
    return respond({businesses:rows.results});
  }
  if(request.method!=='POST')return respond({error:'method_not_allowed'},405);
  let data:unknown;
  try{data=await request.json();}catch{return respond({error:'invalid_json'},400);}
  if(!data||typeof data!=='object'||Array.isArray(data))return respond({error:'invalid_input'},400);
  const name=(data as Record<string,unknown>).name;
  if(typeof name!=='string'||!name.trim()||name.trim().length>120)
    return respond({error:'invalid_business_name'},400);

  const existing=await env.DB.prepare(
    'SELECT business_id FROM business_memberships WHERE subject=? LIMIT 1'
  ).bind(subject).first();
  if(existing)return respond({error:'business_already_exists'},409);

  const id=crypto.randomUUID();
  try{
    await env.DB.batch([
      env.DB.prepare('INSERT INTO businesses(id,name) VALUES(?,?)').bind(id,name.trim()),
      env.DB.prepare("INSERT INTO business_memberships(business_id,subject,role) VALUES(?,?,'owner')").bind(id,subject)
    ]);
    return respond({business:{id,name:name.trim(),role:'owner'}},201);
  }catch{
    // Unique subject constraint prevents racing sign-ups.
    return respond({error:'onboarding_conflict'},409);
  }
}
