import test from 'node:test';
import assert from 'node:assert/strict';
import {locationConfirmationsCsv} from '../src/domain/location-confirmation-export';
import type {ServerLocationConfirmation} from '../src/data/location-confirmation-api';

const event:ServerLocationConfirmation={
  id:'evt-1',agreement_id:'agreement-1',service_date:'2026-10-12',kind:'arrival',
  operator_subject:'worker-1',confirmed_at:1791763200000,source:'manual',proximity:'manual',
  manual_reason:'Gate, "side"\\nwas open',created_at:'2026-10-12T10:00:00Z'
};

test('exports quoted CSV columns and preserves commas, quotes, and line breaks',()=>{
  const csv=locationConfirmationsCsv([event]);
  assert.ok(csv.startsWith('"event_id","service_date","agreement_id"'));
  assert.ok(csv.includes('"Gate, ""side""\\nwas open"'));
  assert.ok(csv.endsWith('\\r\\n'));
});

test('escapes spreadsheet formula prefixes in text fields',()=>{
  const csv=locationConfirmationsCsv([{...event,manual_reason:'=IMPORTXML("unsafe")'}]);
  assert.ok(csv.includes('"\'=IMPORTXML(""unsafe"")"'));
});
