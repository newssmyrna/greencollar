import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {serviceAgreementInput,dollarsToCents,localCalendarDate} from '../src/domain/service-agreement';
import {createServiceAgreement} from '../src/data/service-agreement-api';
import {summarizeSavedDay} from '../src/data/saved-day';
import type {DayData} from '../src/data/greencollar-api';
const originalFetch=globalThis.fetch;afterEach(()=>{globalThis.fetch=originalFetch;});
const input={locationId:'location-a',serviceName:'Sample cleaning',rateCents:7500,estimatedMinutes:45,startsOn:'2026-10-12',frequency:'weekly' as const};
test('calendar dates, cents, duration and schedule are validated',()=>{
 assert.equal(dollarsToCents('19.99'),1999);assert.equal(dollarsToCents('0'),0);
 assert.equal(localCalendarDate(new Date(2026,9,12,23,30)),'2026-10-12');
 for(const price of ['1.234','-1','Infinity','1e2'])assert.throws(()=>dollarsToCents(price));
 for(const change of [
  {startsOn:'2026-02-30'},{endsOn:'2026-10-11'},{rateCents:12.5},{estimatedMinutes:0},
  {frequency:'yearly'},{frequency:['weekly']},{frequency:'custom',intervalDays:0},{intervalDays:7}
 ])assert.throws(()=>serviceAgreementInput({...input,...change}));
 assert.deepEqual(serviceAgreementInput({...input,frequency:'custom',intervalDays:10}).intervalDays,10);
});
test('saved API agreement feeds the existing day queue and completed-visit filtering',async()=>{
 let sent:RequestInit|undefined;let target='';
 const row={id:'agreement-a',customer_id:'customer-a',location_id:'location-a',service_name:input.serviceName,
 rate_cents:7500,estimated_minutes:45,starts_on:input.startsOn,ends_on:null,frequency:'weekly',interval_days:null,
 days_of_week:null,preferred_start_minute:null,preferred_finish_minute:null,fixed_start_minute:null,active:1,
 address:'Synthetic street',preferences:null};
 globalThis.fetch=async(url,init)=>{target=String(url);sent=init;return new Response(JSON.stringify({agreement:row}),{status:201});};
 const saved=await createServiceAgreement('https://api.example.test','business-a','customer-a','jwt',input);
 assert.equal(target,'https://api.example.test/v1/agreements?business_id=business-a&customer_id=customer-a');
 assert.equal((sent?.headers as Record<string,string>).Authorization,'Bearer jwt');
 assert.deepEqual(JSON.parse(String(sent?.body)),input);
 const day:DayData={date:'2026-10-12',planningStatus:'source-data-only',roadOptimization:false,
 customers:[{id:'customer-a',name:'Synthetic customer',phone:null,notes:null}],agreements:[saved],visits:[],durationHistory:[]};
 const due=summarizeSavedDay(day);
 assert.equal(due.pendingCount,1);assert.equal(due.due[0].id,'agreement-a:2026-10-12');
 assert.equal(due.estimatedRevenueCents,7500);assert.equal(due.estimatedServiceMinutes,45);
 assert.equal(summarizeSavedDay({...day,date:'2026-10-13'}).pendingCount,0);
 assert.equal(summarizeSavedDay({...day,visits:[{agreement_id:saved.id,scheduled_date:day.date,status:'completed',actual_minutes:50}]}).pendingCount,0);
});
test('failed save remains explicit',async()=>{
 globalThis.fetch=async()=>new Response('{}',{status:403});
 await assert.rejects(()=>createServiceAgreement('https://api.example.test','business-a','customer-a','jwt',input),/403/);
});

test('appointment inputs persist through request and saved-day readback',async()=>{
 const timed={...input,preferredStartMinute:540,preferredFinishMinute:660,fixedStartMinute:600};
 let requests=0;
 globalThis.fetch=async(_url,init)=>{
  requests++;
  assert.deepEqual(JSON.parse(String(init?.body)),timed);
  return new Response(JSON.stringify({agreement:{
   id:'agreement-a',customer_id:'customer-a',location_id:'location-a',service_name:timed.serviceName,
   rate_cents:7500,estimated_minutes:45,starts_on:input.startsOn,ends_on:null,frequency:'weekly',interval_days:null,
   days_of_week:null,preferred_start_minute:540,preferred_finish_minute:660,fixed_start_minute:600,active:1,
   address:'Synthetic address',preferences:null,lat:null,lon:null
  }}),{status:201});
 };
 const saved=await createServiceAgreement('https://api.example.test','business-a','customer-a','jwt',timed);
 const due=summarizeSavedDay({date:input.startsOn,planningStatus:'source-data-only',roadOptimization:false,
  customers:[{id:'customer-a',name:'Synthetic Customer',phone:null,notes:null}],agreements:[saved],visits:[],durationHistory:[]});
 assert.equal(due.due[0].fixedStartMinute,600);
 assert.equal(due.due[0].preferredStartMinute,540);
 assert.equal(due.due[0].preferredFinishMinute,660);
 assert.equal(requests,1);
});

test('ignored or altered appointment acknowledgments require reload without an automatic second write',async()=>{
 let requests=0;
 globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({agreement:{id:'agreement-a',fixed_start_minute:null}}),{status:201});};
 await assert.rejects(()=>createServiceAgreement('https://api.example.test','business-a','customer-a','jwt',{...input,fixedStartMinute:0}),/may have been saved.*Reload/);
 assert.equal(requests,1);
});

test('invalid appointment constraints never reach the network',async()=>{
 let requests=0;
 globalThis.fetch=async()=>{requests++;throw Error('unexpected request');};
 await assert.rejects(()=>createServiceAgreement('https://api.example.test','business-a','customer-a','jwt',{
  ...input,preferredStartMinute:600,preferredFinishMinute:620
 }),/duration must fit/);
 assert.equal(requests,0);
});
