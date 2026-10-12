import test from 'node:test';
import assert from 'node:assert/strict';
import {startWork,pauseWork,completeWork} from '../src/domain/work-session';
import {createLocalWorkSessionStore,parseWorkSessionRecord} from '../src/data/local-work-session-store';
const running=startWork('visit',1000);
const paused=pauseWork(running,3000);
const completed=completeWork(running,4000);
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
function fixture(){
 const memory=new Map<string,string>();
 const storage={async getItemAsync(key:string){return memory.get(key)??null;},async setItemAsync(key:string,value:string){memory.set(key,value);},async deleteItemAsync(key:string){memory.delete(key);}};
 return {memory,storage,store:createLocalWorkSessionStore(storage,()=>10000)};
}
test('valid existing records restore for running, paused and completed states',async()=>{
 const f=fixture();
 for(const session of [running,paused,completed]){
  f.memory.set('greencollar_timer_user_one',JSON.stringify(session));
  assert.deepEqual(await f.store.loadWorkSession('user_one'),session);
 }
 assert.equal(await f.store.loadWorkSession('user_missing'),null);
});
test('corrupt, contradictory, negative, future and excessive elapsed records fail closed',()=>{
 for(const value of ['','not-json','null',JSON.stringify({...running,jobId:''}),JSON.stringify({...running,startedAt:-1}),JSON.stringify({...running,lastResumedAt:null}),JSON.stringify({...running,lastResumedAt:10001}),JSON.stringify({...running,elapsedMs:1}),JSON.stringify({...paused,elapsedMs:10000}),JSON.stringify({...paused,completedAt:4000}),JSON.stringify({...completed,completedAt:999}),JSON.stringify({...completed,lastResumedAt:1000}),JSON.stringify({...completed,elapsedMs:4000})])assert.throws(()=>parseWorkSessionRecord(value,10000));
 assert.throws(()=>parseWorkSessionRecord(JSON.stringify(running),999));
});
test('older writes cannot overwrite newer timers and loads wait for latest queued state',async()=>{
 const f=fixture(),started=deferred(),release=deferred();let calls=0,reads=0;
 const store=createLocalWorkSessionStore({...f.storage,
  async setItemAsync(key:string,value:string){calls++;if(calls===1){started.resolve();await release.promise;}await f.storage.setItemAsync(key,value);},
  async getItemAsync(key:string){reads++;return f.storage.getItemAsync(key);}
 },()=>10000);
 const first=store.saveWorkSession('user_one',running);const second=store.saveWorkSession('user_one',paused);
 const loaded=store.loadWorkSession('user_one');
 await started.promise;assert.equal(calls,1);assert.equal(reads,0);
 release.resolve();await Promise.all([first,second]);
 assert.deepEqual(await loaded,paused);assert.equal(calls,2);
});
test('deletion runs after a pending save and cannot resurrect an old timer',async()=>{
 const f=fixture(),started=deferred(),release=deferred();
 const store=createLocalWorkSessionStore({...f.storage,async setItemAsync(key:string,value:string){started.resolve();await release.promise;await f.storage.setItemAsync(key,value);}},()=>10000);
 const save=store.saveWorkSession('user_one',running);const remove=store.saveWorkSession('user_one',null);
 await started.promise;release.resolve();await Promise.all([save,remove]);
 assert.equal(await store.loadWorkSession('user_one'),null);
});
test('a failed write is reported while a later queued write can recover',async()=>{
 const f=fixture();let calls=0;
 const store=createLocalWorkSessionStore({...f.storage,async setItemAsync(key:string,value:string){if(++calls===1)throw Error('storage unavailable');await f.storage.setItemAsync(key,value);}},()=>10000);
 const first=store.saveWorkSession('user_one',running);
 const failure=assert.rejects(()=>first,/storage unavailable/);
 const second=store.saveWorkSession('user_one',paused);
 await Promise.all([failure,second]);assert.deepEqual(await store.loadWorkSession('user_one'),paused);
});
test('operators have independent queues and unsupported subjects cannot collide',async()=>{
 const f=fixture(),started=deferred(),release=deferred();
 const store=createLocalWorkSessionStore({...f.storage,async setItemAsync(key:string,value:string){if(key.endsWith('user_one')){started.resolve();await release.promise;}await f.storage.setItemAsync(key,value);}},()=>10000);
 const first=store.saveWorkSession('user_one',running);await started.promise;
 await store.saveWorkSession('user_two',paused);assert.deepEqual(await store.loadWorkSession('user_two'),paused);
 release.resolve();await first;assert.deepEqual(await store.loadWorkSession('user_one'),running);
 for(const subject of ['', 'user.one','a'.repeat(81)])await assert.rejects(()=>store.loadWorkSession(subject),/operator storage/);
});
test('save snapshots its input before waiting on prior writes',async()=>{
 const f=fixture();const input={...running};const save=f.store.saveWorkSession('user_one',input);
 input.jobId='mutated';await save;assert.equal((await f.store.loadWorkSession('user_one'))?.jobId,'visit');
});
test('invalid restore and write input do not overwrite stored data',async()=>{
 const f=fixture();f.memory.set('greencollar_timer_user_one','corrupt');
 await assert.rejects(()=>f.store.loadWorkSession('user_one'),/unreadable/);
 assert.equal(f.memory.get('greencollar_timer_user_one'),'corrupt');
 await assert.rejects(()=>f.store.saveWorkSession('user_one',{...running,elapsedMs:-1}),/invalid/);
 assert.equal(f.memory.get('greencollar_timer_user_one'),'corrupt');
});
test('a load also waits for another write queued while its first wait is pending',async()=>{
 const f=fixture(),started=deferred(),release=deferred();let count=0;
 const store=createLocalWorkSessionStore({...f.storage,async setItemAsync(key:string,value:string){if(++count===1){started.resolve();await release.promise;}await f.storage.setItemAsync(key,value);}},()=>10000);
 const first=store.saveWorkSession('user_one',running);
 const loaded=store.loadWorkSession('user_one');
 await started.promise;
 const second=store.saveWorkSession('user_one',paused);
 release.resolve();await Promise.all([first,second]);
 assert.deepEqual(await loaded,paused);
});

test('work notes persist on the timer and invalid notes fail closed',async()=>{
 const f=fixture(),withNote={...running,note:'Close the side gate'};
 await f.store.saveWorkSession('user_one',withNote);
 assert.deepEqual(await f.store.loadWorkSession('user_one'),withNote);
 const invalid={...withNote,note:'x'.repeat(1001)};
 await assert.rejects(()=>f.store.saveWorkSession('user_one',invalid),/invalid/);
 assert.deepEqual(await f.store.loadWorkSession('user_one'),withNote);
 assert.throws(()=>parseWorkSessionRecord(JSON.stringify(invalid),10000),/invalid/);
});
