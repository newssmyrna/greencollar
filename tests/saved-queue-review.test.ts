import test from 'node:test';
import assert from 'node:assert/strict';
import {createSavedQueueReview,isSavedQueueApproved} from '../src/domain/saved-queue-review';

const visits=[
 {id:'pool:2026-10-12',customer:'A',service:'Pool',rateCents:7000,estimatedMinutes:45},
 {id:'clean:2026-10-12',customer:'B',service:'Cleaning',rateCents:11000,estimatedMinutes:70}
];
test('reviews saved visits in their current work-queue order',()=>{
 const review=createSavedQueueReview('biz-1','2026-10-12',visits);
 assert.deepEqual(review.visitIds,['pool:2026-10-12','clean:2026-10-12']);
 assert.equal(review.visitCount,2);
 assert.equal(review.estimatedServiceMinutes,115);
 assert.equal(review.expectedRevenueCents,18000);
 assert.match(review.approvalKey,/biz-1/);
});
test('approval is session-bound to the exact business, date, order, and estimate snapshot',()=>{
 const first=createSavedQueueReview('biz-1','2026-10-12',visits);
 assert.equal(isSavedQueueApproved(first,first.approvalKey),true);
 assert.equal(isSavedQueueApproved(createSavedQueueReview('biz-1','2026-10-13',visits),first.approvalKey),false);
 assert.equal(isSavedQueueApproved(createSavedQueueReview('biz-2','2026-10-12',visits),first.approvalKey),false);
 assert.equal(isSavedQueueApproved(createSavedQueueReview('biz-1','2026-10-12',[...visits].reverse()),first.approvalKey),false);
 assert.equal(isSavedQueueApproved(createSavedQueueReview('biz-1','2026-10-12',[{...visits[0],estimatedMinutes:60},visits[1]]),first.approvalKey),false);
});
test('empty queues cannot be approved',()=>{
 const empty=createSavedQueueReview('biz-1','2026-10-12',[]);
 assert.equal(isSavedQueueApproved(empty,empty.approvalKey),false);
});
test('rejects invalid, duplicate, or negative visit values',()=>{
 assert.throws(()=>createSavedQueueReview('','2026-10-12',visits),/Business/);
 assert.throws(()=>createSavedQueueReview('biz-1','2026-02-30',visits),/service date/);
 assert.throws(()=>createSavedQueueReview('biz-1','2026-10-12',[visits[0],visits[0]]),/unique/);
 assert.throws(()=>createSavedQueueReview('biz-1','2026-10-12',[{...visits[0],rateCents:-1}]),/prices/);
 assert.throws(()=>createSavedQueueReview('biz-1','2026-10-12',[{...visits[0],estimatedMinutes:-1}]),/durations/);
});
