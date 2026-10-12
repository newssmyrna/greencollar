import test from 'node:test';
import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import { createSavedCustomer } from '../src/data/customer-api';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});

test('creates a saved customer with trimmed contact and access details',async()=>{
  let requestUrl='';
  let request:RequestInit|undefined;
  globalThis.fetch=async(input,init)=>{
    requestUrl=String(input);request=init;
    return new Response(JSON.stringify({id:'customer-1',name:'Alex Rivera'}),{status:201});
  };
  const result=await createSavedCustomer('https://api.example.test','business-1','jwt',{
    name:' Alex Rivera ',phone:' 555-0100 ',email:' alex@example.test ',notes:' Use side gate. '
  });
  assert.deepEqual(result,{id:'customer-1',name:'Alex Rivera'});
  assert.equal(requestUrl,'https://api.example.test/v1/customers?business_id=business-1');
  assert.equal((request?.headers as Record<string,string>).Authorization,'Bearer jwt');
  assert.deepEqual(JSON.parse(String(request?.body)),{
    name:'Alex Rivera',phone:'555-0100',email:'alex@example.test',notes:'Use side gate.'
  });
});

test('rejects customer fields over the API limits before sending',async()=>{
  let called=false;
  globalThis.fetch=async()=>{called=true;return new Response('{}');};
  await assert.rejects(()=>createSavedCustomer('https://api.example.test','business-1','jwt',{
    name:'A'.repeat(161)
  }),/Customer name is too long/);
  assert.equal(called,false);
});

test('requires HTTPS and a valid business id',async()=>{
  await assert.rejects(()=>createSavedCustomer('http://api.example.test','business-1','jwt',{name:'Alex'}),/HTTPS/);
  await assert.rejects(()=>createSavedCustomer('https://api.example.test','bad/id','jwt',{name:'Alex'}),/valid business/);
});
