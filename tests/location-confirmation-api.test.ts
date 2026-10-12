import test from 'node:test';
import assert from 'node:assert/strict';
import {afterEach} from 'node:test';
import {listLocationConfirmations,syncLocationConfirmation} from '../src/data/location-confirmation-api';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const event={eventId:'evt-1',businessId:'business-a',agreementId:'agreement-a',date:'2026-10-12',kind:'arrival' as const,source:'gps_suggestion' as const,proximity:'within_radius' as const,confirmedAt:1791763200000};

test('posts a tenant-scoped confirmation with a stable ID and bearer token',async()=>{
  let url='';let request:RequestInit|undefined;
  globalThis.fetch=async(input,init)=>{url=String(input);request=init;return new Response(JSON.stringify({eventId:'evt-1',duplicate:false}),{status:201});};
  assert.deepEqual(await syncLocationConfirmation('https://api.example.test','jwt',event),{eventId:'evt-1',duplicate:false});
  assert.equal(url,'https://api.example.test/v1/location-confirmations?business_id=business-a');
  assert.equal((request?.headers as Record<string,string>).Authorization,'Bearer jwt');
  assert.deepEqual(JSON.parse(String(request?.body)),{eventId:'evt-1',businessId:'business-a',agreementId:'agreement-a',date:'2026-10-12',kind:'arrival',source:'gps_suggestion',proximity:'within_radius',confirmedAt:event.confirmedAt});
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

test('loads validated tenant-scoped server history for one service date',async()=>{
  let url='';let request:RequestInit|undefined;
  const serverEvent={id:'evt-1',agreement_id:'agreement-a',service_date:'2026-10-12',kind:'arrival',operator_subject:'worker-subject',confirmed_at:1791763200000,source:'gps_suggestion',proximity:'within_radius',manual_reason:null,created_at:'2026-10-12T10:00:00Z'};
  globalThis.fetch=async(input,init)=>{url=String(input);request=init;return new Response(JSON.stringify({events:[serverEvent],hasMore:false,nextCursor:null}),{status:200});};
  assert.deepEqual(await listLocationConfirmations('https://api.example.test','jwt','business-a','2026-10-12'),{events:[serverEvent],hasMore:false,nextCursor:null});
  assert.equal(url,'https://api.example.test/v1/location-confirmations?business_id=business-a&date=2026-10-12');
  assert.equal((request?.headers as Record<string,string>).Authorization,'Bearer jwt');
});


test('requests an older audit page with the supplied stable cursor',async()=>{
  let url='';
  const serverEvent={id:'evt-older',agreement_id:'agreement-a',service_date:'2026-10-12',kind:'arrival',operator_subject:'worker-subject',confirmed_at:1791763200000,source:'gps_suggestion',proximity:'within_radius',manual_reason:null,created_at:'2026-10-12T10:00:00Z'};
  globalThis.fetch=async(input)=>{url=String(input);return new Response(JSON.stringify({events:[serverEvent],hasMore:false,nextCursor:null}),{status:200});};
  await listLocationConfirmations('https://api.example.test','jwt','business-a','2026-10-12','1791763200000.evt-new');
  assert.equal(url,'https://api.example.test/v1/location-confirmations?business_id=business-a&date=2026-10-12&before=1791763200000.evt-new');
  await assert.rejects(()=>listLocationConfirmations('https://api.example.test','jwt','business-a','2026-10-12','invalid cursor'),/cursor/);
});

test('rejects invalid date and malformed server history before displaying it',async()=>{
  let called=false;
  globalThis.fetch=async()=>{called=true;return new Response(JSON.stringify({events:[],hasMore:false,nextCursor:null}),{status:200});};
  await assert.rejects(()=>listLocationConfirmations('https://api.example.test','jwt','business-a','2026-02-30'),/date/);
  assert.equal(called,false);
  globalThis.fetch=async()=>new Response(JSON.stringify({events:[{id:'bad'}],hasMore:false,nextCursor:null}),{status:200});
  await assert.rejects(()=>listLocationConfirmations('https://api.example.test','jwt','business-a','2026-10-12'),/Invalid location history/);
});
