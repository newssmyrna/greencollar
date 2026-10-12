import test from 'node:test';
import assert from 'node:assert/strict';
import {locationEventStorageKey,locationIndexStorageKey,locationStorageSubject} from '../src/data/location-storage-keys';

test('standard operator identifiers retain existing secure-store keys',()=>{
 assert.equal(locationStorageSubject('user_2abc-123'),'user_2abc-123');
 assert.equal(locationIndexStorageKey('user_2abc-123'),'greencollar_location_index_user_2abc-123');
 assert.equal(locationEventStorageKey('user_2abc-123','m1_event-2'),'greencollar_location_event_user_2abc-123_m1_event-2');
});
test('unsafe aliases that normalize or truncate to colliding keys are rejected',()=>{
 for(const id of ['user/one','user_one','user'.repeat(30)+'a','user'.repeat(30)+'b','']){
  if(/^[a-zA-Z0-9_-]{1,80}$/.test(id))continue;
  assert.throws(()=>locationStorageSubject(id),/Invalid operator storage context/);
  assert.throws(()=>locationIndexStorageKey(id),/Invalid operator storage context/);
 }
});
test('unsafe event IDs are rejected before key construction',()=>{
 assert.throws(()=>locationEventStorageKey('user_1','event/one'),/Invalid local confirmation ID/);
 assert.throws(()=>locationEventStorageKey('user_1','e'.repeat(81)),/Invalid local confirmation ID/);
});
test('nearby valid operator IDs have distinct keys',()=>{
 assert.notEqual(locationIndexStorageKey('user_a'),locationIndexStorageKey('user_a1'));
 assert.notEqual(locationIndexStorageKey('user_a'),locationIndexStorageKey('user-a'));
});
