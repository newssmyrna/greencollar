export type DayData = {
  date:string;
  planningStatus:'source-data-only';
  roadOptimization:false;
  customers:Array<{id:string;name:string;phone:string|null;notes:string|null}>;
  agreements:Array<{id:string;customer_id:string;location_id:string;service_name:string;rate_cents:number;estimated_minutes:number;starts_on:string;ends_on:string|null;frequency:string;interval_days:number|null;days_of_week:string|null;preferred_start_minute:number|null;preferred_finish_minute:number|null;fixed_start_minute:number|null;active:number;address:string;preferences:string|null}>;
  visits:Array<{agreement_id:string;scheduled_date:string;status:string;actual_minutes:number|null;completed_customer_id:string|null;completed_customer_name:string|null;completed_service_name:string|null;completed_rate_cents:number|null}>;
  durationHistory:Array<{agreement_id:string;actual_minutes:number}>;
};
/** No silent fallback to fake data when the API fails. */
export async function fetchDayData(apiUrl:string, businessId:string, date:string, token:string):Promise<DayData>{
  if(!apiUrl.startsWith('https://'))throw new Error('An HTTPS API URL is required');
  if(!businessId || !token)throw new Error('Sign-in and business context are required');
  const url=new URL('/v1/day',apiUrl);
  url.searchParams.set('business_id',businessId);
  url.searchParams.set('date',date);
  const response=await fetch(url.toString(),{headers:{Authorization:'Bearer '+token}});
  if(!response.ok)throw new Error('Daily data request failed ('+response.status+')');
  return await response.json() as DayData;
}
