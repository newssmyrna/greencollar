import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWorkNote,withWorkNote} from '../src/domain/work-note';
import {startWork} from '../src/domain/work-session';

test('normalizes whitespace while preserving operational note text',()=>{
 const source=startWork('agreement-a:2026-10-12',1000);
 const saved=withWorkNote(source,'  Gate code is in lockbox.\nClose side gate.  ');
 assert.equal(saved.note,'Gate code is in lockbox.\nClose side gate.');
 assert.equal(source.note,undefined);
 assert.equal(saved.status,'running');
});
test('empty note is represented explicitly for later server clearing',()=>{
 assert.equal(withWorkNote(startWork('visit',1000),'   ').note,'');
});
test('rejects notes beyond the storage and server limit without truncating',()=>{
 assert.equal(normalizeWorkNote('x'.repeat(1000)).length,1000);
 assert.throws(()=>normalizeWorkNote('x'.repeat(1001)),/1,000 characters/);
});
