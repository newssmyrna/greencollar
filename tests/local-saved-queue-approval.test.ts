import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSavedQueueApprovalStore} from '../src/data/local-saved-queue-approval';
import {createSavedQueueReview} from '../src/domain/saved-queue-review';

const memory=new Map<string,string>();
const storage={
 async getItemAsync(key:string){return memory.get(key)??null;},
 async setItemAsync(key:string,value:string){memory.set(key,value);}
};
const digest=async(value:string)=>'test-hash:'+value;
const store=createLocalSavedQueueApprovalStore(storage,digest);
const makeReview=(business='business-1',date='2026-10-12',minutes=45)=>createSavedQueueReview(business,date,[{
 id:'agreement-1:'+date,customer:'A',service:'Mowing',rateCents:5000,estimatedMinutes:minutes
}]);
test('approval survives a store reload and matches only the approved operator, business, date and plan',async()=>{
 memory.clear();
 const review=makeReview();
 await store.approve('operator-1',review);
 const reloaded=createLocalSavedQueueApprovalStore(storage,digest);
 assert.equal(await reloaded.isApproved('operator-1',review),true);
 assert.equal(await reloaded.isApproved('operator-2',review),false);
 assert.equal(await reloaded.isApproved('operator-1',makeReview('business-2')),false);
 assert.equal(await reloaded.isApproved('operator-1',makeReview('business-1','2026-10-13')),false);
 assert.equal(await reloaded.isApproved('operator-1',makeReview('business-1','2026-10-12',60)),false);
});
test('a later approval replaces the previous saved approval for that operator',async()=>{
 memory.clear();
 await store.approve('operator-1',makeReview());
 await store.approve('operator-1',makeReview('business-2'));
 assert.equal(await store.isApproved('operator-1',makeReview()),false);
 assert.equal(await store.isApproved('operator-1',makeReview('business-2')),true);
});
test('missing and malformed stored approvals fail closed',async()=>{
 memory.clear();
 assert.equal(await store.isApproved('operator-1',makeReview()),false);
 memory.set('greencollar_approved_queue_test-hash:operator-1','not-json');
 assert.equal(await store.isApproved('operator-1',makeReview()),false);
});
test('cannot approve without a signed-in user or an eligible visit',async()=>{
 await assert.rejects(()=>store.approve('',makeReview()),/Signed-in/);
 await assert.rejects(()=>store.approve('operator-1',createSavedQueueReview('business-1','2026-10-12',[])),/no visits/);
});
