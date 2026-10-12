import test from 'node:test';
import assert from 'node:assert/strict';
import {orderSavedQueue,moveSavedQueueVisit} from '../src/domain/saved-queue-order';
import {createSavedQueueReview,isSavedQueueApproved} from '../src/domain/saved-queue-review';

const visits=[
  {id:'a',customer:'A',service:'Pool',rateCents:7000,estimatedMinutes:45},
  {id:'b',customer:'B',service:'Cleaning',rateCents:11000,estimatedMinutes:70},
  {id:'c',customer:'C',service:'Maintenance',rateCents:8000,estimatedMinutes:30}
];
const ids=(rows:typeof visits)=>rows.map(row=>row.id);
test('moving earlier/later preserves complete visit objects and does not mutate the source',()=>{
  const source=visits.map(visit=>Object.freeze({...visit}));
  Object.freeze(source);
  const earlier=moveSavedQueueVisit(source,'b','earlier');
  assert.deepEqual(ids(earlier),['b','a','c']);
  assert.strictEqual(earlier[0],source[1]);
  assert.deepEqual(ids(moveSavedQueueVisit(earlier,'b','later')),['a','b','c']);
  assert.deepEqual(ids(source),['a','b','c']);
});
test('first/last boundary moves are harmless and missing visits are rejected',()=>{
  assert.deepEqual(moveSavedQueueVisit(visits,'a','earlier'),visits);
  assert.deepEqual(moveSavedQueueVisit(visits,'c','later'),visits);
  assert.throws(()=>moveSavedQueueVisit(visits,'removed','earlier'),/no longer/);
});
test('a refresh removes handled visits, retains chosen relative order, and appends new visits',()=>{
  const order={scopeKey:'operator-1/business-1/date-1',visitIds:['c','b','a']};
  const newVisit={...visits[0],id:'new'};
  assert.deepEqual(ids(orderSavedQueue([visits[0],visits[2],newVisit],order.scopeKey,order)),['c','a','new']);
});
test('foreign operator, business, or date scopes cannot apply the old order',()=>{
  const scope=JSON.stringify(['operator-1','business-1','2026-10-12']);
  const order={scopeKey:scope,visitIds:['c','b','a']};
  for(const context of [
    ['operator-2','business-1','2026-10-12'],
    ['operator-1','business-2','2026-10-12'],
    ['operator-1','business-1','2026-10-13']
  ])assert.deepEqual(orderSavedQueue(visits,JSON.stringify(context),order),visits);
});
test('stale or duplicate override IDs never duplicate or drop authorized visits',()=>{
  const rows=orderSavedQueue(visits,'scope',{scopeKey:'scope',visitIds:['missing','b','b']});
  assert.deepEqual(ids(rows),['b','a','c']);
  assert.equal(new Set(ids(rows)).size,visits.length);
  assert.deepEqual(orderSavedQueue(visits,'scope',null),visits);
  assert.deepEqual(orderSavedQueue([],'scope',{scopeKey:'scope',visitIds:['b']}),[]);
  assert.throws(()=>orderSavedQueue([visits[0],visits[0]],'scope',null),/unique/);
});
test('reordered snapshots invalidate prior approval and preserve price/duration totals',()=>{
  const before=createSavedQueueReview('business-1','2026-10-12',visits);
  const moved=moveSavedQueueVisit(visits,'b','earlier');
  const after=createSavedQueueReview('business-1','2026-10-12',moved);
  assert.equal(isSavedQueueApproved(after,before.approvalKey),false);
  assert.equal(isSavedQueueApproved(after,after.approvalKey),true);
  assert.equal(after.expectedRevenueCents,before.expectedRevenueCents);
  assert.equal(after.estimatedServiceMinutes,before.estimatedServiceMinutes);
});
