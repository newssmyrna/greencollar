import test from 'node:test';
import assert from 'node:assert/strict';
import {afterEach} from 'node:test';
import {listWeatherInterruptions,reportWeatherInterruption} from '../src/data/weather-interruptions';
const originalFetch=globalThis.fetch;afterEach(()=>{globalThis.fetch=originalFetch;});
const report={businessId:'business-a',eventId:'event-1',workDate:'2026-10-13',reportedAt:'2026-10-13T15:00:00.000Z',reason:'other' as const,
 completedVisitIds:['agreement-a:2026-10-13'],remainingVisitIds:['agreement-b:2026-10-13']};
const event={...report,reporterSubject:'subject-a',createdAt:'2026-10-13 15:00:00'};

test('submits a confirmed interruption using an idempotency key',async()=>{
 let url='',request:RequestInit|undefined;
 globalThis.fetch=async(target,init)=>{url=String(target);request=init;return new Response(JSON.stringify({interruption:event}),{status:201});};
 assert.deepEqual(await reportWeatherInterruption('https://api.example.test','jwt',report),event);
 assert.equal(url,'https://api.example.test/v1/weather-interruptions');
 assert.equal(request?.method,'POST');
 assert.deepEqual(JSON.parse(String(request?.body)),report);
});

test('manager inbox is an explicit no-store read scoped to business and date',async()=>{
 let url='',request:RequestInit|undefined;
 globalThis.fetch=async(target,init)=>{url=String(target);request=init;return new Response(JSON.stringify({businessId:'business-a',date:'2026-10-13',interruptions:[event]}),{status:200});};
 assert.deepEqual(await listWeatherInterruptions('https://api.example.test','business-a','2026-10-13','jwt'),[event]);
 assert.equal(url,'https://api.example.test/v1/weather-interruptions?business_id=business-a&date=2026-10-13');
 assert.equal(request?.cache,'no-store');
});

test('rejects insecure API URL and malformed list response',async()=>{
 await assert.rejects(()=>listWeatherInterruptions('http://api.example.test','business-a','2026-10-13','jwt'),/HTTPS/);
 globalThis.fetch=async()=>new Response(JSON.stringify({businessId:'other',date:'2026-10-13',interruptions:[]}),{status:200});
 await assert.rejects(()=>listWeatherInterruptions('https://api.example.test','business-a','2026-10-13','jwt'),/Invalid interruption list/);
});
