import test from 'node:test';
import assert from 'node:assert/strict';
import {afterEach} from 'node:test';
import {syncLocationConfirmation} from '../src/data/location-confirmation-api';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const event={eventId:'evt-1',businessId:'business-a',agreementId:'agreement-a',date:'2026-10-12',kind:'arrival' as const,source:'gps_suggestion' as const,proximity:'within_radius' as const,confirmedAt:1791763200000};

test('posts a tenant-scoped confirmation with a stable ID and bearer token',async()=>{
  let url='';let request:RequestInit|undefined;
  globalThis.fetch=async(input,init)=>{url=String(input);request=init;return new Response(JSON.stringify({eventId:'evt-1',duplicate:false}),{status:201});};
  assert.deepEqual(await syncLocationConfirmation('https://api.example.test','jwt',event),{eventId:'evt-1',duplicate:false});
  assert.equal(url,'https://api.example.test/v1/location-confirmations?business_id=business-a');
  assert.equal((request?.headers as Record<string,string>).Authorization,'Bearer jwt');
  assert.deepEqual(JSON.parse(String(request?.body)),{eventId:'evt-1',agreementId:'agreement-a',date:'2026-10-12',kind:'arrival',source:'gps_suggestion',proximity:'within_radius',confirmedAt:event.confirmedAt});
});

test('rejects insecure URLs and mismatched GPS confirmations before sending',async()=>{
  let called=false;globalThis.fetch=async()=>{called=true;return new Response('{}');};
  await assert.rejects(()=>syncLocationConfirmation('http://api.example.test','jwt',event),/HTTPS/);
  await assert.rejects(()=>syncLocationConfirmation('https://api.example.test','jwt',{...event,kind:'departure'}),/GPS/);
  assert.equal(called,false);
});

test('manual confirmation reason is trimmed and response conflicts are surfaced',async()=>{
  let body='';
  globalThis.fetch=async(_input,init)=>{body=String(init?.body);return new Response(JSON.stringify({eventId:'evt-1',duplicate:true}),{status:200});};
  const manual={...event,source:'manual' as const,proximity:'manual' as const,manualReason:' Gate was open '};
  assert.equal((await syncLocationConfirmation('https://api.example.test','jwt',manual)).duplicate,true);
  assert.equal(JSON.parse(body).manualReason,'Gate was open');
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'event_id_conflict'}),{status:409});
  await assert.rejects(()=>syncLocationConfirmation('https://api.example.test','jwt',event),/conflicts/);
});
