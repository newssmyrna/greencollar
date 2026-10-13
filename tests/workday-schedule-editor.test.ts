import test from 'node:test';
import assert from 'node:assert/strict';
import {hydrateSingleRouteDraft} from '../src/domain/workday-schedule-editor';
import type {WorkdaySchedule} from '../src/data/workday-schedules';

const workDate='2026-10-13';
function sampleSchedule():WorkdaySchedule{
  return{
    businessId:'business-a',workDate,version:4,updatedBy:'owner-a',updatedAt:'2026-10-13T12:00:00Z',
    routes:[{
      routeId:'route-west',truckId:'truck-2',startMinute:480,endMinute:1020,
      workers:[{subject:'worker-a',startMinute:480,endMinute:1020,breaks:[{startMinute:720,endMinute:750}]}],
      stops:[
        {visitId:'agreement-b:'+workDate,order:2,tasks:[{taskId:'task-b',label:'Trim',assignedSubjects:['worker-a'],estimatedMinutes:20}]},
        {visitId:'agreement-a:'+workDate,order:1,tasks:[{taskId:'task-a',label:'Mow',assignedSubjects:['worker-a'],estimatedMinutes:45}]}
      ]
    }]
  };
}

test('hydrates an editable single-route draft without losing route, worker, stop, task, or break data',()=>{
  const result=hydrateSingleRouteDraft(sampleSchedule(),'business-a',workDate,['agreement-a','agreement-b']);
  assert.deepEqual(result,{
    routeId:'route-west',truckId:'truck-2',start:'08:00',end:'17:00',
    workerSubjects:['worker-a'],
    lunchBlocks:{'worker-a':[{start:'12:00',end:'12:30'}]},
    agreementIds:['agreement-a','agreement-b'],
    tasksByAgreement:{
      'agreement-a':[{taskId:'task-a',label:'Mow',assignedSubjects:['worker-a'],estimatedMinutes:45}],
      'agreement-b':[{taskId:'task-b',label:'Trim',assignedSubjects:['worker-a'],estimatedMinutes:20}]
    }
  });
});

test('keeps a draft read-only when its business scope does not match',()=>{
  assert.throws(()=>hydrateSingleRouteDraft(sampleSchedule(),'business-b',workDate,['agreement-a','agreement-b']),/different business/);
});

test('keeps multi-route drafts read-only instead of dropping routes',()=>{
  const schedule=sampleSchedule();
  schedule.routes.push({...schedule.routes[0],routeId:'route-east'});
  assert.throws(()=>hydrateSingleRouteDraft(schedule,'business-a',workDate,['agreement-a','agreement-b']),/single-route/);
});

test('keeps a draft read-only when a saved stop is no longer in the loaded workday',()=>{
  assert.throws(()=>hydrateSingleRouteDraft(sampleSchedule(),'business-a',workDate,['agreement-a']),/no longer available/);
});

test('keeps a draft read-only when worker shift hours cannot be represented',()=>{
  const schedule=sampleSchedule();
  schedule.routes[0].workers[0].endMinute=960;
  assert.throws(()=>hydrateSingleRouteDraft(schedule,'business-a',workDate,['agreement-a','agreement-b']),/different shift hours/);
});
