import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createLocalSavedQueueOrderStore} from '../src/data/local-saved-queue-order';
import {createLocalSavedQueueApprovalStore} from '../src/data/local-saved-queue-approval';
import {createSavedQueueReview} from '../src/domain/saved-queue-review';
const digest=async(value:string)=>createHash('sha256').update(value).digest('hex');
const context={subject:'operator-1',businessId:'business-1',date:'2026-10-12'};
function fixture(){
 const memory=new Map<string,string>();
 const storage={async getItemAsync(key:string){return memory.get(key)??null;},async setItemAsync(key:string,value:string){memory.set(key,value);}};
 return {memory,storage,store:createLocalSavedQueueOrderStore(storage,digest)};
}
test('chosen order survives reload without storing raw identities',async()=>{
 const f=fixture();await f.store.save(context,['visit-c','visit-a','visit-b']);
 assert.deepEqual(await createLocalSavedQueueOrderStore(f.storage,digest).load(context,['visit-a','visit-b','visit-c']),['visit-c','visit-a','visit-b']);
 const saved=[...f.memory.entries()].flat().join('');
 for(const sensitive of ['operator-1','business-1','visit-a','visit-b','visit-c'])assert.equal(saved.includes(sensitive),false);
});
test('foreign operator, business, and date cannot restore an order',async()=>{
 const f=fixture();await f.store.save(context,['b','a']);
 for(const foreign of [{...context,subject:'operator-2'},{...context,businessId:'business-2'},{...context,date:'2026-10-13'}])assert.equal(await f.store.load(foreign,['a','b']),null);
});
test('refresh removes handled visits and appends new visits without losing IDs',async()=>{
 const f=fixture();await f.store.save(context,['c','b','a','removed']);
 assert.deepEqual(await f.store.load(context,['a','c','new']),['c','a','new']);
 assert.deepEqual(await f.store.load(context,[]),[]);
});
test('missing and invalid records use default order',async()=>{
 const f=fixture();assert.equal(await f.store.load(context,['a']),null);
 const key='greencollar_queue_order_'+await digest('operator:'+context.subject);
 for(const value of ['invalid-json',JSON.stringify({version:2}),JSON.stringify({version:1,businessDigest:'x',date:context.date,visitDigests:[1]}),JSON.stringify({version:1,businessDigest:'x',date:context.date,visitDigests:['same','same']}),' '.repeat(2001)]){
  f.memory.set(key,value);assert.equal(await f.store.load(context,['a']),null);
 }
});
test('saving default order replaces a prior override',async()=>{
 const f=fixture();await f.store.save(context,['b','a']);await f.store.save(context,['a','b']);
 assert.deepEqual(await f.store.load(context,['a','b']),['a','b']);
});
test('write failure retains prior order and read failure propagates',async()=>{
 const f=fixture();await f.store.save(context,['b','a']);
 const broken=createLocalSavedQueueOrderStore({...f.storage,async setItemAsync(){throw Error('unavailable');}},digest);
 await assert.rejects(()=>broken.save(context,['a','b']),/unavailable/);
 assert.deepEqual(await f.store.load(context,['a','b']),['b','a']);
 const unreadable=createLocalSavedQueueOrderStore({...f.storage,async getItemAsync(){throw Error('unavailable');}},digest);
 await assert.rejects(()=>unreadable.load(context,['a','b']),/unavailable/);
});
test('invalid input and oversized orders reject before a write',async()=>{
 const f=fixture();
 await assert.rejects(()=>f.store.save({...context,subject:''},['a']),/operator/);
 await assert.rejects(()=>f.store.save({...context,date:'2026-02-30'},['a']),/work date/);
 await assert.rejects(()=>f.store.save(context,['a','a']),/unique/);
 await assert.rejects(()=>f.store.load(context,['a','a']),/unique/);
 await assert.rejects(()=>f.store.save(context,Array.from({length:100},(_,i)=>'id-'+i)),/too large/);
 assert.equal(f.memory.size,0);
});
test('restored order restores matching approval; changed estimates still invalidate it',async()=>{
 const f=fixture();const approvals=createLocalSavedQueueApprovalStore(f.storage,digest);
 const visits=[{id:'a',customer:'A',service:'Pool',rateCents:7000,estimatedMinutes:45},{id:'b',customer:'B',service:'Cleaning',rateCents:11000,estimatedMinutes:70}];
 const chosen=[visits[1],visits[0]];
 await f.store.save(context,chosen.map(v=>v.id));
 await approvals.approve(context.subject,createSavedQueueReview(context.businessId,context.date,chosen));
 const ids=await createLocalSavedQueueOrderStore(f.storage,digest).load(context,visits.map(v=>v.id));
 const restored=ids!.map(id=>visits.find(v=>v.id===id)!);
 assert.equal(await approvals.isApproved(context.subject,createSavedQueueReview(context.businessId,context.date,restored)),true);
 assert.equal(await approvals.isApproved(context.subject,createSavedQueueReview(context.businessId,context.date,[{...restored[0],estimatedMinutes:71},restored[1]])),false);
});
