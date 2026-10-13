import test from 'node:test';
import assert from 'node:assert/strict';
import {afterEach} from 'node:test';
import {reportAvailability,listAvailability} from '../src/data/availability';
const originalFetch=globalThis.fetch;afterEach(()=>{globalThis.fetch=originalFetch;});
const input={businessId:'business-a',eventId:'break-1',workDate:'2026-10-13',kind:'break' as const,startMinute:720,endMinute:750};
const event={...input,memberSubject:'worker-a',reportedBy:'worker-a',createdAt:'2026-10-13 12:00:00'};
test('submits a lunch interval over HTTPS',async()=>{
 let url='',init:RequestInit|undefined;globalThis.fetch=async(target,options)=>{url=String(target);init=options;return new Response(JSON.stringify({availability:event}),{status:201});};
 assert.deepEqual(await reportAvailability('https://api.example.test','jwt',input),event);
 assert.equal(url,'https://api.example.test/v1/availability');assert.equal(init?.method,'POST');
});
test('lists availability as an explicit no-store read',async()=>{
 let url='',init:RequestInit|undefined;globalThis.fetch=async(target,options)=>{url=String(target);init=options;return new Response(JSON.stringify({businessId:'business-a',date:'2026-10-13',availability:[event]}),{status:200});};
 assert.deepEqual(await listAvailability('https://api.example.test','business-a','2026-10-13','jwt'),[event]);
 assert.equal(url,'https://api.example.test/v1/availability?business_id=business-a&date=2026-10-13');assert.equal(init?.cache,'no-store');
});
test('rejects insecure endpoint and malformed scope',async()=>{
 await assert.rejects(()=>listAvailability('http://api.example.test','business-a','2026-10-13','jwt'),/HTTPS/);
 globalThis.fetch=async()=>new Response(JSON.stringify({businessId:'other',date:'2026-10-13',availability:[]}),{status:200});
 await assert.rejects(()=>listAvailability('https://api.example.test','business-a','2026-10-13','jwt'),/Invalid availability/);
});
