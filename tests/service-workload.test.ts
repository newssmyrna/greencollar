import test from 'node:test';
import assert from 'node:assert/strict';
import {assessServiceWorkload} from '../src/domain/service-workload';

const jobs=[{id:'a',minutes:45},{id:'b',minutes:90},{id:'c',minutes:120}];

test('reports selected service minutes and a clear within-hours result',()=>{
  assert.deepEqual(assessServiceWorkload(jobs,'4.25','3'),{
    status:'within_service_hours',availableMinutes:255,selectedJobCount:3,
    selectedMinutes:255,jobsOutsideCap:0,overtimeMinutes:0
  });
});

test('reports service-only overtime without claiming route infeasibility',()=>{
  const result=assessServiceWorkload(jobs,'4','3');
  assert.equal(result.status,'over_service_hours');
  assert.equal(result.overtimeMinutes,15);
  assert.equal(result.selectedMinutes,255);
});

test('applies the job cap in source order and reports excluded samples',()=>{
  const result=assessServiceWorkload(jobs,'8','2');
  assert.equal(result.selectedJobCount,2);
  assert.equal(result.selectedMinutes,135);
  assert.equal(result.jobsOutsideCap,1);
});

test('rejects malformed or out-of-range hours and job caps',()=>{
  for(const hours of ['', '0.1', '24.1', '-2', '8.123', 'Infinity'])
    assert.equal(assessServiceWorkload(jobs,hours,'3').status,'invalid_hours');
  for(const cap of ['', '0', '-1', '2.5', '201', 'Infinity'])
    assert.equal(assessServiceWorkload(jobs,'8',cap).status,'invalid_job_cap');
});

test('rejects duplicate IDs and invalid service durations',()=>{
  assert.equal(assessServiceWorkload([{id:'a',minutes:30},{id:'a',minutes:40}],'8','2').status,'invalid_jobs');
  for(const minutes of [0,-1,1.5,1441,Number.MAX_SAFE_INTEGER+1])
    assert.equal(assessServiceWorkload([{id:'a',minutes}],'8','2').status,'invalid_jobs');
});

test('empty sample set has no service workload and stays within the hours limit',()=>{
  const result=assessServiceWorkload([],'8','6');
  assert.equal(result.status,'within_service_hours');
  assert.equal(result.selectedMinutes,0);
  assert.equal(result.selectedJobCount,0);
});
