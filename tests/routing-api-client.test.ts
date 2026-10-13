import test from 'node:test';
import assert from 'node:assert/strict';
import {afterEach} from 'node:test';
import {acknowledgeRoutingNotice,fetchRoutingSettings,setBusinessRoutingEnabled} from '../src/data/routing-api';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const settings={
 available:false,enabled:false,businessEnabled:false,noticeAcknowledged:false,noticeVersion:null,
 notice:'Selected job coordinates will be sent to Google to calculate driving durations.',
 termsUrl:null,privacyUrl:null,attribution:'Powered by Google, © 2026',manualFallback:true
};

test('loads tenant routing readiness without sending any provider request',async()=>{
 let url='';let request:RequestInit|undefined;
 globalThis.fetch=async(target,init)=>{
  url=String(target);request=init;
  return new Response(JSON.stringify(settings),{status:200});
 };
 assert.deepEqual(await fetchRoutingSettings('https://api.example.test','business-a','jwt'),settings);
 assert.equal(url,'https://api.example.test/v1/routing/settings?business_id=business-a');
 assert.equal((request?.headers as Record<string,string>).Authorization,'Bearer jwt');
 assert.equal(request?.method,undefined);
 assert.equal(request?.cache,'no-store');
});

test('acknowledgment and business controls use explicit authenticated writes',async()=>{
 const calls:Array<{url:string;body:unknown}>=[];
 globalThis.fetch=async(target,init)=>{
  const url=String(target),body=JSON.parse(String(init?.body));
  calls.push({url,body});
  return new Response(JSON.stringify(url.endsWith('/notice')
   ?{acknowledged:true,noticeVersion:'notice-1'}
   :{enabled:true,noticeVersion:'notice-1',manualFallback:false}),{status:200});
 };
 assert.equal(await acknowledgeRoutingNotice('https://api.example.test','business-a','jwt','notice-1',true),true);
 assert.equal(await setBusinessRoutingEnabled('https://api.example.test','business-a','jwt',true,true,'notice-1'),true);
 assert.deepEqual(calls,[
  {url:'https://api.example.test/v1/routing/notice',body:{businessId:'business-a',acknowledged:true,noticeVersion:'notice-1'}},
  {url:'https://api.example.test/v1/routing/settings',body:{businessId:'business-a',enabled:true,noticeAcknowledged:true,noticeVersion:'notice-1'}}
 ]);
});

test('rejects insecure URLs, unsafe IDs, invalid policy URLs, and malformed settings',async()=>{
 let called=false;globalThis.fetch=async()=>{called=true;return new Response('{}');};
 await assert.rejects(()=>fetchRoutingSettings('http://api.example.test','business-a','jwt'),/HTTPS/);
 await assert.rejects(()=>fetchRoutingSettings('https://api.example.test','bad business','jwt'),/identifier/);
 assert.equal(called,false);
 await assert.rejects(()=>acknowledgeRoutingNotice('https://api.example.test','business-a','jwt','notice-1',true),/Invalid routing notice response/);
 assert.equal(called,true);
 globalThis.fetch=async()=>new Response(JSON.stringify({...settings,available:true,termsUrl:'http://example.test/terms'}),{status:200});
 await assert.rejects(()=>fetchRoutingSettings('https://api.example.test','business-a','jwt'),/policy URL/);
});

test('maps a non-admin response to a useful manual-fallback message',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'admin_required'}),{status:403});
 await assert.rejects(()=>setBusinessRoutingEnabled('https://api.example.test','business-a','jwt',true,true,'notice-1'),/owner or admin/);
});


test('allows an admin disable request when the current notice version is unavailable',async()=>{
 let request:RequestInit|undefined;
 globalThis.fetch=async(_target,init)=>{
  request=init;
  return new Response(JSON.stringify({enabled:false,noticeVersion:null,manualFallback:true}),{status:200});
 };
 assert.equal(await setBusinessRoutingEnabled('https://api.example.test','business-a','jwt',false,false,''),false);
 assert.deepEqual(JSON.parse(String(request?.body)),{businessId:'business-a',enabled:false,noticeAcknowledged:false,noticeVersion:''});
});
