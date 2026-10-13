export const ROAD_MONTHLY_ELEMENT_LIMIT=19_500;
export const ROAD_MONTHLY_SPEND_CAP_MICRO_USD=120_000_000;
export const MIN_ESSENTIALS_RATE_MICRO_USD_PER_1000=5_000_000;

export type RoadUsageLimits={elements:number;spendMicroUsd:number};

/** Google Maps Platform usage tiers reset at midnight US/Canadian Pacific time. */
export function roadBillingMonthKey(date:Date):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'}).formatToParts(date);
 const year=parts.find(part=>part.type==='year')?.value;
 const month=parts.find(part=>part.type==='month')?.value;
 if(!year||!month)throw new Error('Invalid billing month');
 return `${year}-${month}`;
}

/** Conservative no-free-credit list-price estimate, in micro-USD. */
export function estimateRoadCostMicroUsd(elements:number,rateMicroUsdPer1000:number):number{
 if(!Number.isSafeInteger(elements)||elements<1||!Number.isSafeInteger(rateMicroUsdPer1000)||rateMicroUsdPer1000<1)
  throw new Error('Invalid routing usage estimate');
 const cost=Math.ceil(elements*rateMicroUsdPer1000/1000);
 if(!Number.isSafeInteger(cost))throw new Error('Invalid routing usage estimate');
 return cost;
}

/**
 * Atomically reserves provider exposure before dispatch. A reservation is never
 * refunded for timeout/error responses because provider billing is ambiguous.
 */
export async function reserveRoadUsage(
 db:D1Database,billingMonth:string,elements:number,costMicroUsd:number,now:Date,
 limits:RoadUsageLimits={elements:ROAD_MONTHLY_ELEMENT_LIMIT,spendMicroUsd:ROAD_MONTHLY_SPEND_CAP_MICRO_USD}
):Promise<boolean>{
 if(!/^\d{4}-\d{2}$/.test(billingMonth)||!Number.isSafeInteger(elements)||elements<1
  ||elements>limits.elements||!Number.isSafeInteger(costMicroUsd)||costMicroUsd<1
  ||costMicroUsd>limits.spendMicroUsd||!Number.isSafeInteger(limits.elements)||limits.elements<1
  ||!Number.isSafeInteger(limits.spendMicroUsd)||limits.spendMicroUsd<1)
  return false;
 const row=await db.prepare(`
  INSERT INTO road_provider_usage_monthly(billing_month,element_count,estimated_cost_micro_usd,updated_at)
  VALUES(?,?,?,?)
  ON CONFLICT(billing_month) DO UPDATE SET
   element_count=road_provider_usage_monthly.element_count+excluded.element_count,
   estimated_cost_micro_usd=road_provider_usage_monthly.estimated_cost_micro_usd+excluded.estimated_cost_micro_usd,
   updated_at=excluded.updated_at
  WHERE road_provider_usage_monthly.element_count+excluded.element_count<=?
    AND road_provider_usage_monthly.estimated_cost_micro_usd+excluded.estimated_cost_micro_usd<=?
  RETURNING billing_month
 `).bind(billingMonth,elements,costMicroUsd,now.toISOString(),limits.elements,limits.spendMicroUsd)
  .first<{billing_month:string}>();
 return row?.billing_month===billingMonth;
}
