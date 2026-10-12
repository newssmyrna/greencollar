import test from 'node:test';
import assert from 'node:assert/strict';
import {filterLocationConfirmations} from '../src/domain/location-confirmation-filter';
import type {ServerLocationConfirmation} from '../src/data/location-confirmation-api';

const event=(id:string,kind:'arrival'|'departure',source:'manual'|'gps_suggestion'):ServerLocationConfirmation=>({
  id,agreement_id:'agreement-1',service_date:'2026-10-12',kind,operator_subject:'worker-1',
  confirmed_at:1791763200000,source,proximity:source==='manual'?'manual':kind==='arrival'?'within_radius':'outside_radius',
  manual_reason:source==='manual'?'Gate was open':null,created_at:'2026-10-12T10:00:00Z'
});
const events=[event('arrival-manual','arrival','manual'),event('arrival-gps','arrival','gps_suggestion'),event('departure-gps','departure','gps_suggestion')];

test('filters loaded events by kind and source together without changing source records',()=>{
  const filtered=filterLocationConfirmations(events,'arrival','manual');
  assert.deepEqual(filtered.map(item=>item.id),['arrival-manual']);
  assert.equal(events.length,3);
});

test('all filters preserve the page and single filters retain matching events',()=>{
  assert.deepEqual(filterLocationConfirmations(events,'all','all'),events);
  assert.deepEqual(filterLocationConfirmations(events,'departure','all').map(item=>item.id),['departure-gps']);
  assert.deepEqual(filterLocationConfirmations(events,'all','gps_suggestion').map(item=>item.id),['arrival-gps','departure-gps']);
});
