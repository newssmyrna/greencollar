import { generateDueVisits, type Agreement } from '../domain/recurrence';
import {predictDuration} from '../domain/planner';
import type {DayData} from './greencollar-api';

export type DueSummary = {
  due: Array<{id:string;service:string;address:string;customer:string;rateCents:number;estimatedMinutes:number;lat:number|null;lon:number|null}>;
  completedCount:number;
  skippedCount:number;
  pendingCount:number;
  estimatedRevenueCents:number;
  estimatedServiceMinutes:number;
};
/** A work queue, NOT an optimized driving route. Uses only rows from authorized API response. */
export function summarizeSavedDay(data:DayData):DueSummary {
  const customers=new Map(data.customers.map(c=>[c.id,c.name]));
  const agreementRows=data.agreements.map(a=>({
    id:a.id,customerId:a.customer_id,locationId:a.location_id,
    serviceName:a.service_name,rateCents:a.rate_cents,
    estimatedMinutes:a.estimated_minutes,startsOn:a.starts_on,
    endsOn:a.ends_on??undefined,frequency:a.frequency as Agreement['frequency'],
    intervalDays:a.interval_days??undefined,
    daysOfWeek:a.days_of_week?JSON.parse(a.days_of_week) as number[]:undefined,
    preferredStartMinute:a.preferred_start_minute??undefined,
    preferredFinishMinute:a.preferred_finish_minute??undefined,
    fixedStartMinute:a.fixed_start_minute??undefined,active:a.active===1
  }));
  const dates=generateDueVisits(agreementRows,data.date,data.date);
  const history=new Map<string,number[]>();
  for(const h of data.durationHistory??[]){
    const samples=history.get(h.agreement_id)??[];
    samples.push(h.actual_minutes);
    history.set(h.agreement_id,samples);
  }
  const status=new Map(data.visits.map(v=>[v.agreement_id,v.status]));
  const pending=dates.filter(v=>!['completed','skipped'].includes(status.get(v.agreementId)??''));
  const byAgreement=new Map(data.agreements.map(a=>[a.id,a]));
  return {
    due:pending.map(v=>({
      id:v.id,service:v.serviceName,
      address:byAgreement.get(v.agreementId)?.address??'Address unavailable',
      customer:customers.get(v.customerId)??'Customer unavailable',
      rateCents:v.rateCents,estimatedMinutes:predictDuration(history.get(v.agreementId)??[],v.estimatedMinutes).minutes,
      lat:byAgreement.get(v.agreementId)?.lat??null,lon:byAgreement.get(v.agreementId)?.lon??null
    })),
    completedCount:dates.filter(v=>status.get(v.agreementId)==='completed').length,
    skippedCount:dates.filter(v=>status.get(v.agreementId)==='skipped').length,
    pendingCount:pending.length,
    estimatedRevenueCents:pending.reduce((s,v)=>s+v.rateCents,0),
    estimatedServiceMinutes:pending.reduce((s,v)=>s+predictDuration(history.get(v.agreementId)??[],v.estimatedMinutes).minutes,0)
  };
}
