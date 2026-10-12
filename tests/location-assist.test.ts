import test from 'node:test';
import assert from 'node:assert/strict';
import {assessProximity,createLocationConfirmation,appendLocationConfirmation} from '../src/domain/location-assist';

const target={latitude:29,longitude:-80.9};
const settings={radiusMeters:100,maxAccuracyMeters:50};

test('a fix whose full accuracy radius is inside suggests arrival',()=>{
 const result=assessProximity(target,{latitude:29,longitude:-80.9,accuracyMeters:10},settings);
 assert.equal(result.status,'within_radius');
});
test('a fix whose uncertainty circle is outside suggests departure',()=>{
 const result=assessProximity(target,{latitude:29.002,longitude:-80.9,accuracyMeters:10},settings);
 assert.equal(result.status,'outside_radius');
});
test('boundary overlap is uncertain rather than a confident arrival or departure',()=>{
 const result=assessProximity(target,{latitude:29.0009,longitude:-80.9,accuracyMeters:25},settings);
 assert.equal(result.status,'uncertain');
});
test('poor GPS accuracy returns unavailable even when reported point is at the site',()=>{
 assert.deepEqual(assessProximity(target,{...target,accuracyMeters:51},settings),{status:'unavailable'});
});
test('invalid coordinates accuracy and thresholds are rejected',()=>{
 assert.throws(()=>assessProximity(target,{latitude:91,longitude:0,accuracyMeters:5},settings),/coordinates/);
 assert.throws(()=>assessProximity(target,{...target,accuracyMeters:-1},settings),/accuracy/);
 assert.throws(()=>assessProximity(target,{...target,accuracyMeters:5},{...settings,radiusMeters:0}),/settings/);
});
test('GPS suggestions become audit events only for operator-confirmed matching actions',()=>{
 const assessment=assessProximity(target,{...target,accuracyMeters:5},settings);
 const event=createLocationConfirmation({jobId:'job-1',operatorId:'worker-1',kind:'arrival',confirmedAt:1000,source:'gps_suggestion',assessment});
 assert.deepEqual(event,{jobId:'job-1',operatorId:'worker-1',kind:'arrival',confirmedAt:1000,source:'gps_suggestion',proximity:'within_radius'});
 assert.equal('latitude' in event,false);
 assert.throws(()=>createLocationConfirmation({jobId:'job-1',operatorId:'worker-1',kind:'departure',confirmedAt:1000,source:'gps_suggestion',assessment}),/does not support/);
});
test('manual confirmations require a reason and do not require GPS',()=>{
 assert.throws(()=>createLocationConfirmation({jobId:'job-1',operatorId:'worker-1',kind:'arrival',confirmedAt:1000,source:'manual'}),/reason/);
 const event=createLocationConfirmation({jobId:'job-1',operatorId:'worker-1',kind:'departure',confirmedAt:1000,source:'manual',manualReason:' Customer asked me to leave '});
 assert.equal(event.proximity,'manual');assert.equal(event.manualReason,'Customer asked me to leave');
 assert.throws(()=>createLocationConfirmation({jobId:'job-1',operatorId:'worker-1',kind:'arrival',confirmedAt:1000,source:'manual',manualReason:'x'.repeat(281)}),/at most 280/);
});

test('confirmation history appends without replacing entries and refuses to exceed its limit',()=>{
 const first=createLocationConfirmation({jobId:'job-1',operatorId:'worker-1',kind:'arrival',confirmedAt:1000,source:'manual',manualReason:'Gate was open'});
 const second=createLocationConfirmation({jobId:'job-1',operatorId:'worker-1',kind:'departure',confirmedAt:2000,source:'manual',manualReason:'Work completed'});
 assert.deepEqual(appendLocationConfirmation([first],second,2),[first,second]);
 assert.throws(()=>appendLocationConfirmation([first,second],first,2),/history is full/);
 assert.throws(()=>appendLocationConfirmation([],first,0),/limit/);
});
