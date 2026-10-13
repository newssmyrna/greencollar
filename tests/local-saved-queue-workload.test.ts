import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createLocalSavedQueueWorkloadStore} from '../src/data/local-saved-queue-workload';

const digest=async(value:string)=>createHash('sha256').update(value).digest('hex');
const context={subject:'operator-a',businessId:'business-a',date:'2026-10-13'};
const limits={hours:'4.25',maxJobs:'3'};
function deferred<T>(){
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(yes=>{resolve=yes;});
  return {promise,resolve};
}
function fixture(){
  const memory=new Map<string,string>();
  const storage={async getItemAsync(key:string){return memory.get(key)??null;},async setItemAsync(key:string,value:string){memory.set(key,value);}};
  return {memory,storage,store:createLocalSavedQueueWorkloadStore(storage,digest)};
}

test('workload limits survive reload with hashed identities and canonical values',async()=>{
  const f=fixture();
  assert.deepEqual(await f.store.save(context,{hours:' 04.25 ',maxJobs:'003'}),limits);
  assert.deepEqual(await createLocalSavedQueueWorkloadStore(f.storage,digest).load(context),limits);
  const stored=[...f.memory.entries()].flat().join('');
  for(const value of [context.subject,context.businessId,context.date])assert.equal(stored.includes(value),false);
  assert.ok([...f.memory.values()][0].length<=512);
});

test('every operator, business and work date has independent restorable limits',async()=>{
  const f=fixture();await f.store.save(context,limits);
  const others=[{...context,subject:'operator-b'},{...context,businessId:'business-b'},{...context,date:'2026-10-14'}];
  for(const other of others){
    assert.equal(await f.store.load(other),null);
    await f.store.save(other,{hours:'',maxJobs:'8'});
    assert.deepEqual(await f.store.load(other),{hours:'',maxJobs:'8'});
    assert.deepEqual(await f.store.load(context),limits);
  }
  assert.equal(f.memory.size,4);
});

test('hours-only and visit-only limits round trip without inventing a missing limit',async()=>{
  const f=fixture();
  for(const input of [{hours:'4.10',maxJobs:''},{hours:'',maxJobs:'6'}]){
    const saved=await f.store.save(context,input);
    assert.deepEqual(await f.store.load(context),saved);
  }
});

test('invalid inputs reject before overwriting a saved record',async()=>{
  const f=fixture();await f.store.save(context,limits);
  const before=[...f.memory];
  for(const input of [{hours:'',maxJobs:''},{hours:'0.2',maxJobs:'3'},{hours:'24.01',maxJobs:''},{hours:'8',maxJobs:'201'},{hours:'1'.repeat(33),maxJobs:''}])
    await assert.rejects(()=>f.store.save(context,input));
  for(const invalid of [{...context,subject:''},{...context,businessId:' '},{...context,date:'2026-02-30'}])
    await assert.rejects(()=>f.store.save(invalid,limits));
  assert.deepEqual([...f.memory],before);
});

test('corrupt, oversized or wrong-scope records reject without deleting original bytes',async()=>{
  const f=fixture();assert.equal(await f.store.load(context),null);
  await f.store.save(context,limits);
  const [key,value]=[...f.memory.entries()][0],record=JSON.parse(value);
  for(const bad of ['not-json',' '.repeat(513),JSON.stringify({...record,version:2}),JSON.stringify({...record,contextDigest:'wrong'}),JSON.stringify({...record,maxJobs:3}),JSON.stringify({...record,hours:'',maxJobs:''})]){
    f.memory.set(key,bad);
    await assert.rejects(()=>f.store.load(context),/could not be read/);
    assert.equal(f.memory.get(key),bad);
  }
});

test('save and load operations execute in invocation order within one scope',async()=>{
  const f=fixture(),entered=deferred<void>(),release=deferred<void>();
  const writes:string[]=[];
  const store=createLocalSavedQueueWorkloadStore({...f.storage,async setItemAsync(key:string,value:string){
    writes.push(JSON.parse(value).hours);
    if(writes.length===1){entered.resolve();await release.promise;}
    await f.storage.setItemAsync(key,value);
  }},digest);
  const first=store.save(context,{hours:'2',maxJobs:''});
  await entered.promise;
  const second=store.save(context,{hours:'3',maxJobs:''});
  const read=store.load(context);
  assert.deepEqual(writes,['2']);
  release.resolve();
  await Promise.all([first,second]);
  assert.deepEqual(await read,{hours:'3',maxJobs:''});
  assert.deepEqual(writes,['2','3']);
});

test('a blocked scope does not block another business',async()=>{
  const f=fixture(),entered=deferred<void>(),release=deferred<void>();
  const store=createLocalSavedQueueWorkloadStore({...f.storage,async setItemAsync(key:string,value:string){
    if(JSON.parse(value).hours==='2'){entered.resolve();await release.promise;}
    await f.storage.setItemAsync(key,value);
  }},digest);
  const first=store.save(context,{hours:'2',maxJobs:''});
  await entered.promise;
  const other={...context,businessId:'business-b'};
  await store.save(other,{hours:'3',maxJobs:''});
  assert.deepEqual(await store.load(other),{hours:'3',maxJobs:''});
  release.resolve();await first;
});

test('pending writes capture input values before caller mutation',async()=>{
  const f=fixture(),capturedContext={...context},capturedLimits={...limits};
  const saving=f.store.save(capturedContext,capturedLimits);
  capturedContext.businessId='business-b';capturedLimits.hours='9';
  await saving;
  assert.deepEqual(await f.store.load(context),limits);
  assert.equal(await f.store.load(capturedContext),null);
});

test('storage failure preserves prior values and does not poison subsequent operations',async()=>{
  const f=fixture();await f.store.save(context,limits);
  let fail=true;
  const store=createLocalSavedQueueWorkloadStore({...f.storage,async setItemAsync(key:string,value:string){
    if(fail){fail=false;throw Error('storage unavailable');}
    await f.storage.setItemAsync(key,value);
  }},digest);
  await assert.rejects(()=>store.save(context,{hours:'6',maxJobs:''}),/unavailable/);
  assert.deepEqual(await store.load(context),limits);
  await store.save(context,{hours:'7',maxJobs:''});
  assert.deepEqual(await store.load(context),{hours:'7',maxJobs:''});
  const unreadable=createLocalSavedQueueWorkloadStore({...f.storage,async getItemAsync(){throw Error('read unavailable');}},digest);
  await assert.rejects(()=>unreadable.load(context),/unavailable/);
});
