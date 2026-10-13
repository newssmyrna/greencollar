import test from 'node:test';
import assert from 'node:assert/strict';
import {reportedLunchBlocks} from '../src/domain/workday-availability';
import type {CrewAvailability} from '../src/data/availability';

const event=(memberSubject:string,kind:CrewAvailability['kind'],startMinute:number,endMinute:number):CrewAvailability=>({
 businessId:'business-a',eventId:'event-'+memberSubject+'-'+kind+'-'+startMinute,workDate:'2026-10-13',
 memberSubject,reportedBy:memberSubject,kind,startMinute,endMinute,createdAt:'2026-10-13T12:00:00Z'
});

test('maps reported breaks to each worker and sorts intervals while excluding absence events',()=>{
 const result=reportedLunchBlocks([
  event('worker-a','break',780,810),
  event('worker-b','sick',0,1440),
  event('worker-a','break',720,750),
  event('worker-b','unavailable',600,660)
 ]);
 assert.deepEqual(result,{
  'worker-a':[{start:'12:00',end:'12:30'},{start:'13:00',end:'13:30'}]
 });
});
