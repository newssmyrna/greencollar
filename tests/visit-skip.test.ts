import test from 'node:test';
import assert from 'node:assert/strict';
import {afterEach} from 'node:test';
import {saveVisitSkip} from '../src/data/visit-skip';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const input={businessId:'business-a',agreementId:'agreement-a',date:'2026-10-12'};

test('posts a confirmed tenant-scoped skip and validates the response',async()=>{
 let url='';let request:RequestInit|undefined;
 globalThis.fetch=async(target,init)=>{
  url=String(target);request=init;
  return new Response(JSON.stringify({...input,status:'skipped'}),{status:200});
 };
 assert.deepEqual(await saveVisitSkip('https://api.example.test','jwt',input),{...input,status:'skipped'});
 assert.equal(url,'https://api.example.test/v1/visits/skip');
 assert.equal((request?.headers as Record<string,string>).Authorization,'Bearer jwt');
 assert.deepEqual(JSON.parse(String(request?.body)),input);
});

test('rejects invalid URLs, input, and attempts to skip protected visits',async()=>{
 let called=false;globalThis.fetch=async()=>{called=true;return new Response('{}');};
 await assert.rejects(()=>saveVisitSkip('http://api.example.test','jwt',input),/HTTPS/);
 await assert.rejects(()=>saveVisitSkip('https://api.example.test','jwt',{...input,date:'2026-02-30'}),/Invalid/);
 assert.equal(called,false);
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'visit_not_skippable'}),{status:409});
 await assert.rejects(()=>saveVisitSkip('https://api.example.test','jwt',input),/cannot be skipped/);
});
