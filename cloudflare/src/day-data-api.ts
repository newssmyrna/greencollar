import { authenticatedSubject, businessAccess, type Env } from './auth';

function json(data: unknown,status=200) {
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
const validDate=(x:string)=>/^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) && new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;

/**
 * Tenant-isolated daily planning input for the mobile app.
 * No route or arrival times are represented as optimized until a
 * verified road-travel matrix and constraint solver are connected.
 */
export async function dayDataApi(request:Request,env:Env,url:URL):Promise<Response> {
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
  const subject=await authenticatedSubject(request,env);
  if(!subject)return json({error:'unauthorized'},401);
  const businessId=url.searchParams.get('business_id')??'';
  const date=url.searchParams.get('date')??'';
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId)||!validDate(date))return json({error:'invalid_parameters'},400);
  if(!await businessAccess(env,subject,businessId))return json({error:'forbidden'},403);

  // Exact tenant filtering occurs independently on every query.
  const [agreements,visits,customers,history]=await env.DB.batch([
    env.DB.prepare(`SELECT a.id,a.customer_id,a.location_id,a.service_name,a.rate_cents,a.estimated_minutes,
      a.starts_on,a.ends_on,a.frequency,a.interval_days,a.days_of_week,
      a.preferred_start_minute,a.preferred_finish_minute,a.fixed_start_minute,a.active,
      l.address,l.preferences,l.lat,l.lon
      FROM service_agreements a
      JOIN service_locations l ON l.id=a.location_id AND l.business_id=a.business_id
      WHERE a.business_id=? AND a.active=1 AND a.starts_on<=?
        AND (a.ends_on IS NULL OR a.ends_on>=?)
      ORDER BY a.id LIMIT 2000`).bind(businessId,date,date),
    env.DB.prepare(`SELECT agreement_id,scheduled_date,status,actual_minutes,completed_customer_id,completed_customer_name,completed_service_name,completed_rate_cents,work_note
      FROM service_visits WHERE business_id=? AND scheduled_date=?`).bind(businessId,date),
    env.DB.prepare('SELECT id,name,phone,notes FROM customers WHERE business_id=? ORDER BY name LIMIT 2000').bind(businessId),
    env.DB.prepare("SELECT agreement_id,actual_minutes FROM service_visits WHERE business_id=? AND status='completed' AND actual_minutes BETWEEN 1 AND 1439 AND scheduled_date<? ORDER BY scheduled_date DESC LIMIT 2000").bind(businessId,date)
  ]);
  return json({date,agreements:agreements.results,visits:visits.results,customers:customers.results,
    durationHistory:history.results,planningStatus:'source-data-only',roadOptimization:false});
}
