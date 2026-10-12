import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDueVisits,type Agreement} from '../src/domain/recurrence';
const base:Agreement={id:'a1',customerId:'c1',locationId:'loc1',serviceName:'Pool service',rateCents:7500,estimatedMinutes:40,startsOn:'2026-10-05',frequency:'weekly',active:true};
const dates=(a:Agreement,from='2026-10-01',to='2026-11-05')=>generateDueVisits([a],from,to).map(x=>x.date);
test('weekly visits are anchored to start date',()=>assert.deepEqual(dates(base),['2026-10-05','2026-10-12','2026-10-19','2026-10-26','2026-11-02']));
test('biweekly visits skip alternating weeks',()=>assert.deepEqual(dates({...base,frequency:'biweekly'}),['2026-10-05','2026-10-19','2026-11-02']));
test('monthly on 31st uses final day of short month',()=>{
 const a={...base,frequency:'monthly' as const,startsOn:'2026-01-31'};
 assert.deepEqual(dates(a,'2026-01-31','2026-04-02'),['2026-01-31','2026-02-28','2026-03-31']);
});
test('custom every 10 days and inactive services',()=>{
 assert.deepEqual(dates({...base,frequency:'custom',intervalDays:10}),['2026-10-05','2026-10-15','2026-10-25','2026-11-04']);
 assert.deepEqual(dates({...base,active:false}),[]);
});
test('window and rate copy through to generated visit',()=>{
 const x=generateDueVisits([{...base,preferredStartMinute:540,preferredFinishMinute:900}],'2026-10-05','2026-10-05')[0];
 assert.equal(x.rateCents,7500);assert.equal(x.earliestStartMinute,540);assert.equal(x.latestFinishMinute,900);
});
test('rejects impossible calendar dates and invalid long range',()=>{
 assert.throws(()=>generateDueVisits([base],'2026-02-30','2026-03-04'));
 assert.throws(()=>generateDueVisits([base],'2026-01-01','2027-03-05'));
});
test('never schedules outside end date',()=>assert.deepEqual(dates({...base,endsOn:'2026-10-14'}),['2026-10-05','2026-10-12']));
