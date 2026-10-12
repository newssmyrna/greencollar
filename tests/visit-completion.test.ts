import test from 'node:test';
import assert from 'node:assert/strict';
import {saveVisitCompletion,type VisitCompletionInput} from '../src/data/visit-completion';

const input:VisitCompletionInput={businessId:'business-a',agreementId:'agreement-a',date:'2026-10-12',actualMinutes:45,workNote:'Close side gate.'};
const reply={agreementId:'agreement-a',date:'2026-10-12',status:'completed',actualMinutes:45,workNote:'Close side gate.'};
test('posts the authorized completion and accepts only an exact acknowledgment',async()=>{
 let requestUrl='',requestInit:RequestInit|undefined;
 const result=await saveVisitCompletion('https://api.example.test/base','token-a',input,async(url,init)=>{
  requestUrl=String(url);requestInit=init;return new Response(JSON.stringify(reply),{status:201});
 });
 assert.equal(requestUrl,'https://api.example.test/v1/visits/complete');
 assert.equal(requestInit?.method,'POST');
 assert.equal(new Headers(requestInit?.headers).get('authorization'),'Bearer token-a');
 assert.deepEqual(JSON.parse(String(requestInit?.body)),input);
 assert.deepEqual(result,reply);
});
for(const [field,value] of [
 ['agreementId','another-agreement'],['date','2026-10-13'],['status','skipped'],['actualMinutes',44],['workNote','changed note']
] as Array<[string,unknown]>){
 test('rejects completion acknowledgment with mismatched '+field,async()=>{
  await assert.rejects(
   saveVisitCompletion('https://api.example.test','token-a',input,async()=>new Response(JSON.stringify({...reply,[field]:value}),{status:201})),
   /Reload the saved workday before retrying/
  );
 });
}
test('rejects malformed or structurally invalid successful responses',async()=>{
 for(const response of [new Response('{',{status:201}),new Response('null',{status:201}),new Response('{}',{status:201})]){
  await assert.rejects(saveVisitCompletion('https://api.example.test','token-a',input,async()=>response.clone()),/Reload the saved workday before retrying/);
 }
});
test('reports HTTP errors without treating them as confirmed completions',async()=>{
 await assert.rejects(saveVisitCompletion('https://api.example.test','token-a',input,async()=>new Response('{}',{status:409})),/\(409\)/);
});
test('validates request before contacting the service',async()=>{
 let called=false;
 await assert.rejects(saveVisitCompletion('https://api.example.test','token-a',{...input,actualMinutes:0},async()=>{called=true;return new Response('{}');}),/Invalid visit completion/);
 assert.equal(called,false);
});

test('rejects oversized notes before sending a completion request',async()=>{
 let called=false;
 await assert.rejects(saveVisitCompletion('https://api.example.test','token-a',{...input,workNote:'x'.repeat(1001)},async()=>{called=true;return new Response('{}');}),/Invalid visit completion/);
 assert.equal(called,false);
});

test('completion without an operator note sends an explicit empty note',async()=>{
 const {workNote:_ignored,...withoutNote}=input;
 let payload:unknown;
 const result=await saveVisitCompletion('https://api.example.test','token-a',withoutNote,async(_url,init)=>{
  payload=JSON.parse(String(init?.body));
  return new Response(JSON.stringify({...reply,workNote:''}),{status:201});
 });
 assert.deepEqual(payload,{...withoutNote,workNote:''});
 assert.equal(result.workNote,'');
});
