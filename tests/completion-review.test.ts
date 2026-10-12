import test from 'node:test';
import assert from 'node:assert/strict';
import {completionReviewKey,isCompletionReviewConfirmed} from '../src/domain/completion-review';
import {completeWork,startWork} from '../src/domain/work-session';

const completed=completeWork(startWork('agreement-1:2026-10-12',1000),121000);
test('review key binds the operator, exact completed timer, and workday',()=>{
 const key=completionReviewKey('operator-1',completed,'2026-10-12');
 assert.ok(key);
 assert.equal(isCompletionReviewConfirmed(key,key),true);
 assert.equal(isCompletionReviewConfirmed(key,'another-key'),false);
});
test('confirmation becomes stale when operator, session, or workday changes',()=>{
 const key=completionReviewKey('operator-1',completed,'2026-10-12');
 assert.ok(key);
 assert.notEqual(completionReviewKey('operator-2',completed,'2026-10-12'),key);
 assert.notEqual(completionReviewKey('operator-1',completeWork(startWork('agreement-1:2026-10-12',1000),181000),'2026-10-12'),key);
 assert.notEqual(completionReviewKey('operator-1',completed,'2026-10-13'),key);
});
test('demo, unfinished, missing-context, and invalid-date records cannot be acknowledged',()=>{
 assert.equal(completionReviewKey('operator-1',completeWork(startWork('demo-job',1000),2000),'2026-10-12'),null);
 assert.equal(completionReviewKey('operator-1',startWork('visit',1000),'2026-10-12'),null);
 assert.equal(completionReviewKey(null,completed,'2026-10-12'),null);
 assert.equal(completionReviewKey('operator-1',completed,'2026-02-30'),null);
});
test('empty review cannot enable a completion write',()=>{
 assert.equal(isCompletionReviewConfirmed(null,''),false);
 assert.equal(isCompletionReviewConfirmed('review',''),false);
});
