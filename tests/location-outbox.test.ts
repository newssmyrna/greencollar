import test from 'node:test';
import assert from 'node:assert/strict';
import {oldestSyncedConfirmationId} from '../src/domain/location-outbox';

test('evicts only the oldest server-synced local copy',()=>{
  assert.equal(oldestSyncedConfirmationId([
    {eventId:'pending-1',syncStatus:'pending'},
    {eventId:'synced-1',syncStatus:'synced'},
    {eventId:'synced-2',syncStatus:'synced'}
  ]),'synced-1');
});

test('preserves pending and legacy device-only confirmations when no synced copy exists',()=>{
  assert.equal(oldestSyncedConfirmationId([
    {eventId:'pending-1',syncStatus:'pending'},
    {eventId:'local-only-1',syncStatus:'local_only'}
  ]),undefined);
  assert.equal(oldestSyncedConfirmationId([]),undefined);
});
