import test from 'node:test';
import assert from 'node:assert/strict';
import {hydrateScheduleRouteDrafts,hydrateSingleRouteDraft,replaceScheduleRouteAtIndex,validateScheduleTasksForCrew} from '../src/domain/workday-schedule-editor';
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

test('accepts valid named task drafts assigned to the selected route crew',()=>{
  assert.equal(validateScheduleTasksForCrew(['agreement-a'],{
    'agreement-a':[{taskId:'task-a',label:'Mow',assignedSubjects:['worker-a'],estimatedMinutes:45}]
  },['worker-a']),null);
});

test('requires every selected stop to keep a task and every task to have a name and valid estimate',()=>{
  assert.match(validateScheduleTasksForCrew(['agreement-a'],{},['worker-a'])??'',/at least one task/);
  assert.match(validateScheduleTasksForCrew(['agreement-a'],{
    'agreement-a':[{taskId:'task-a',label:'  ',assignedSubjects:['worker-a'],estimatedMinutes:45}]
  },['worker-a'])??'',/task a name/);
  assert.match(validateScheduleTasksForCrew(['agreement-a'],{
    'agreement-a':[{taskId:'task-a',label:'Mow',assignedSubjects:['worker-a'],estimatedMinutes:1441}]
  },['worker-a'])??'',/whole minutes/);
  assert.match(validateScheduleTasksForCrew(['agreement-a'],{
    'agreement-a':[{taskId:'task-a',label:'x'.repeat(81),assignedSubjects:['worker-a'],estimatedMinutes:45}]
  },['worker-a'])??'',/80 characters/);
});

test('limits each stop to 20 tasks',()=>{
  const tasks=Array.from({length:21},(_,index)=>({taskId:'task-'+index,label:'Mow',assignedSubjects:['worker-a'],estimatedMinutes:45}));
  assert.match(validateScheduleTasksForCrew(['agreement-a'],{'agreement-a':tasks},['worker-a'])??'',/no more than 20 tasks/);
});

test('requires task assignment to at least one worker on the selected route',()=>{
  assert.match(validateScheduleTasksForCrew(['agreement-a'],{
    'agreement-a':[{taskId:'task-a',label:'Mow',assignedSubjects:[],estimatedMinutes:45}]
  },['worker-a'])??'',/at least one route crew member/);
});

test('rejects duplicate worker assignments within one task',()=>{
  assert.match(validateScheduleTasksForCrew(['agreement-a'],{
    'agreement-a':[{taskId:'task-a',label:'Mow',assignedSubjects:['worker-a','worker-a'],estimatedMinutes:45}]
  },['worker-a'])??'',/duplicate worker assignments/);
});

test('blocks a task still assigned to a worker removed from the selected route crew',()=>{
  assert.match(validateScheduleTasksForCrew(['agreement-a'],{
    'agreement-a':[{taskId:'task-a',label:'Mow',assignedSubjects:['worker-removed'],estimatedMinutes:45}]
  },['worker-a'])??'',/current route crew/);
});

test('keeps saved tasks read-only when task identity, name, estimate, or assignment data is invalid',()=>{
  const cases=[
    (schedule:WorkdaySchedule)=>{schedule.routes[0].stops[0].tasks[0].taskId='';},
    (schedule:WorkdaySchedule)=>{schedule.routes[0].stops[0].tasks[0].label='  ';},
    (schedule:WorkdaySchedule)=>{schedule.routes[0].stops[0].tasks[0].estimatedMinutes=0;},
    (schedule:WorkdaySchedule)=>{schedule.routes[0].stops[0].tasks[0].assignedSubjects=[];}
  ];
  for(const invalidate of cases){
    const schedule=sampleSchedule();invalidate(schedule);
    assert.throws(()=>hydrateSingleRouteDraft(schedule,'business-a',workDate,['agreement-a','agreement-b']),/saved task has invalid data/);
  }
});

test('keeps saved tasks read-only when task IDs are duplicated within a stop',()=>{
  const schedule=sampleSchedule();
  schedule.routes[0].stops[0].tasks.push({...schedule.routes[0].stops[0].tasks[0],taskId:schedule.routes[0].stops[0].tasks[0].taskId});
  assert.throws(()=>hydrateSingleRouteDraft(schedule,'business-a',workDate,['agreement-a','agreement-b']),/saved task has invalid data/);
});


test('keeps saved stops read-only when they exceed the task count limit',()=>{
  const schedule=sampleSchedule();
  schedule.routes[0].stops[0].tasks=Array.from({length:21},(_,index)=>({taskId:'task-'+index,label:'Mow',assignedSubjects:['worker-a'],estimatedMinutes:45}));
  assert.throws(()=>hydrateSingleRouteDraft(schedule,'business-a',workDate,['agreement-a','agreement-b']),/saved stop has invalid task data/);
});

function addSecondRoute(schedule:WorkdaySchedule):WorkdaySchedule{
  schedule.routes.push({
    routeId:'route-east',truckId:'truck-3',startMinute:600,endMinute:900,
    workers:[{subject:'worker-b',startMinute:600,endMinute:900}],
    stops:[{visitId:'agreement-c:'+workDate,order:1,tasks:[{taskId:'task-c',label:'Cleanup',assignedSubjects:['worker-b'],estimatedMinutes:35}]}]
  });
  return schedule;
}

test('hydrates every route in a multi-route draft without losing route-specific crew, stops, tasks, or breaks',()=>{
  const schedule=addSecondRoute(sampleSchedule());
  const result=hydrateScheduleRouteDrafts(schedule,'business-a',workDate,['agreement-a','agreement-b','agreement-c']);
  assert.equal(result.length,2);
  assert.deepEqual(result[0],hydrateSingleRouteDraft({...schedule,routes:[schedule.routes[0]]},'business-a',workDate,['agreement-a','agreement-b','agreement-c']));
  assert.deepEqual(result[1],{
    routeId:'route-east',truckId:'truck-3',start:'10:00',end:'15:00',
    workerSubjects:['worker-b'],lunchBlocks:{'worker-b':[]},
    agreementIds:['agreement-c'],
    tasksByAgreement:{'agreement-c':[{taskId:'task-c',label:'Cleanup',assignedSubjects:['worker-b'],estimatedMinutes:35}]}
  });
});

test('keeps a multi-route draft read-only when route IDs or visits are duplicated',()=>{
  const duplicateRoute=addSecondRoute(sampleSchedule());
  duplicateRoute.routes[1].routeId=duplicateRoute.routes[0].routeId;
  assert.throws(()=>hydrateScheduleRouteDrafts(duplicateRoute,'business-a',workDate,['agreement-a','agreement-b','agreement-c']),/duplicate route/);
  const duplicateVisit=addSecondRoute(sampleSchedule());
  duplicateVisit.routes[1].stops[0].visitId='agreement-a:'+workDate;
  assert.throws(()=>hydrateScheduleRouteDrafts(duplicateVisit,'business-a',workDate,['agreement-a','agreement-b','agreement-c']),/more than one saved route/);
});

test('keeps a multi-route draft read-only when trucks or workers overlap',()=>{
  const sharedTruck=addSecondRoute(sampleSchedule());
  sharedTruck.routes[1].truckId='truck-2';
  sharedTruck.routes[1].startMinute=600;
  sharedTruck.routes[1].endMinute=900;
  sharedTruck.routes[1].workers[0].startMinute=600;
  sharedTruck.routes[1].workers[0].endMinute=900;
  assert.throws(()=>hydrateScheduleRouteDrafts(sharedTruck,'business-a',workDate,['agreement-a','agreement-b','agreement-c']),/same truck/);
  const sharedWorker=addSecondRoute(sampleSchedule());
  sharedWorker.routes[1].workers[0].subject='worker-a';
  assert.throws(()=>hydrateScheduleRouteDrafts(sharedWorker,'business-a',workDate,['agreement-a','agreement-b','agreement-c']),/overlapping saved routes/);
});

test('validates every route before enabling edits to any route',()=>{
  const malformed=addSecondRoute(sampleSchedule());
  malformed.routes[1].stops[0].tasks[0].assignedSubjects=['worker-a'];
  assert.throws(()=>hydrateScheduleRouteDrafts(malformed,'business-a',workDate,['agreement-a','agreement-b','agreement-c']),/outside this route crew/);
});

test('replaces only the selected saved route and preserves all other routes and schedule metadata',()=>{
  const schedule=addSecondRoute(sampleSchedule());
  const otherRoute=schedule.routes[0];
  const replacement={...schedule.routes[1],truckId:'truck-4',stops:[{...schedule.routes[1].stops[0],order:2}]};
  const updated=replaceScheduleRouteAtIndex(schedule,1,replacement);
  assert.equal(updated.version,schedule.version);
  assert.equal(updated.updatedBy,schedule.updatedBy);
  assert.deepEqual(updated.routes[0],otherRoute);
  assert.deepEqual(updated.routes[1],replacement);
  assert.deepEqual(schedule.routes[1].truckId,'truck-3');
  assert.throws(()=>replaceScheduleRouteAtIndex(schedule,2,replacement),/Select a saved route/);
});
