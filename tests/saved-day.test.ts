import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSavedDay } from '../src/data/saved-day';
import type {DayData} from '../src/data/greencollar-api';

const fixture:DayData={
 date:'2026-10-12',planningStatus:'source-data-only',roadOptimization:false,
 customers:[{id:'c1',name:'Sample Customer',phone:null,notes:null}],
 agreements:[{id:'s1',customer_id:'c1',location_id:'l1',service_name:'Cleaning',
  rate_cents:7500,estimated_minutes:55,starts_on:'2026-10-05',ends_on:null,
  frequency:'weekly',interval_days:null,days_of_week:null,preferred_start_minute:null,
  preferred_finish_minute:null,fixed_start_minute:null,active:1,
  address:'Fictional Address',preferences:null}],
 visits:[],durationHistory:[]
};
test('summarize actual due recurring work by local date',()=>{
 const out=summarizeSavedDay(fixture);
 assert.equal(out.pendingCount,1);
 assert.equal(out.estimatedRevenueCents,7500);
 assert.equal(out.due[0].customer,'Sample Customer');
});
test('completed visit is not shown again',()=>{
 const out=summarizeSavedDay({...fixture,visits:[{agreement_id:'s1',scheduled_date:fixture.date,status:'completed',actual_minutes:52}]});
 assert.equal(out.pendingCount,0);
 assert.equal(out.completedCount,1);
});
test('not-due service is excluded',()=>{
 const out=summarizeSavedDay({...fixture,date:'2026-10-13'});
 assert.equal(out.pendingCount,0);
});

test('uses prior completed services to improve future time estimate',()=>{
 const out=summarizeSavedDay({...fixture,durationHistory:[
  {agreement_id:'s1',actual_minutes:20},{agreement_id:'s1',actual_minutes:22},
  {agreement_id:'s1',actual_minutes:21},{agreement_id:'s1',actual_minutes:23}
 ]});
 assert.equal(out.pendingCount,1);
 assert.ok(out.estimatedServiceMinutes<55);
 assert.equal(out.estimatedServiceMinutes,out.due[0].estimatedMinutes);
});
