import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearLocalDemoWorkspace,
  createInitialDemoWorkspace,
  createEmptyDemoWorkday,
  createDemoVisitId,
  demoDayForDate,
  LOCAL_DEMO_STORAGE_KEY,
  LEGACY_LOCAL_DEMO_STORAGE_KEY,
  loadLocalDemoWorkspace,
  saveLocalDemoWorkspace,
  MAX_LOCAL_DEMO_PHOTOS_PER_VISIT,
  type DemoStorage,
} from '../src/demo/local-demo-store';
import {beginLocalDemoTravel,beginLocalDemoWorkday,buildLocalDemoPlan,confirmLocalDemoArrival,deferLocalDemoStop,prepareLocalDemoInvoiceDrafts,undoLocalDemoStopDefer} from '../src/demo/local-demo-workday';
import {buildIllustrativeTravelMatrix,estimateIllustrativeRoute,findIllustrativeLunchSlots,type IllustrativeRouteStop} from '../src/demo/local-demo-route';
import {createSavedQueueReview,canApproveSavedQueueReview,isSavedQueueApproved} from '../src/domain/saved-queue-review';
import {invoiceTotals} from '../src/domain/invoice';
import {startWork} from '../src/domain/work-session';

function memoryStorage():DemoStorage{
  const values=new Map<string,string>();
  return {
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>{values.set(key,value);},
    removeItem:key=>{values.delete(key);},
  };
}

test('seeds synthetic customers and due sample jobs using the app data shape',()=>{
  const date='2026-10-13';
  const workspace=createInitialDemoWorkspace(date);
  const day=demoDayForDate(workspace,date);
  assert.equal(workspace.customers.length,3);
  assert.equal(day.customers[0].name,'Example Customer 1');
  assert.equal(day.agreements.length,3);
  assert.equal(day.visits.length,3);
  assert.ok(day.visits.every(visit=>visit.status==='pending'));
  assert.equal(day.roadOptimization,false);
});

test('fresh browser preview gets an approved sample assignment for the worker start-of-day screen',()=>{
  const date='2026-10-13';
  const loaded=loadLocalDemoWorkspace(memoryStorage(),date);
  const workday=loaded.workspace.workdays.find(item=>item.date===date)!;
  assert.equal(workday.plannedVisitIds.length,3);
  assert.equal(workday.approvedQueueKey,'local-preview-2026-10-13-sample-assignment');
  assert.equal(workday.dayStartedAt,null);
  assert.equal(workday.workSession,null,'starting the sample day does not start a visit timer');
  assert.equal(workday.lunchDurationMinutes,30);
  assert.equal(workday.lunchAfterVisitId,workday.plannedVisitIds[2]);
  assert.equal(workday.delayMinutes,0);
});

test('starting a sample workday is idempotent and independent from its visit timer',()=>{
  const storage=memoryStorage();
  const workspace=createInitialDemoWorkspace('2026-10-13',true);
  const workday=workspace.workdays[0];
  const started=beginLocalDemoWorkday(workday,1000);
  const repeated=beginLocalDemoWorkday(started,2000);
  assert.equal(started.dayStartedAt,1000);
  assert.strictEqual(repeated,started,'a repeated Start action keeps the original day-start record');
  assert.equal(started.workSession,null);
  assert.throws(()=>beginLocalDemoWorkday(workday,-1),/valid timestamp/);
  workspace.workdays[0]={...started,lunchDurationMinutes:60,lunchAfterVisitId:workday.plannedVisitIds[2],delayMinutes:15};
  assert.equal(saveLocalDemoWorkspace(workspace,storage),true);
  const restored=loadLocalDemoWorkspace(storage,'2026-10-13').workspace.workdays[0];
  assert.equal(restored.dayStartedAt,1000,'the separate day-start record survives a browser reload');
  assert.equal(restored.workSession,null,'a reload does not turn day start into a visit timer');
  assert.equal(restored.lunchDurationMinutes,60,'the worker lunch choice survives a reload');
  assert.equal(restored.lunchAfterVisitId,workday.plannedVisitIds[2]);
  assert.equal(restored.delayMinutes,15,'the delay adjustment survives a reload');
});

test('stores local preview edits under a versioned key and restores them',()=>{
  const storage=memoryStorage();
  const workspace=createInitialDemoWorkspace('2026-10-13');
  workspace.customers.push({
    id:'preview-customer-local',name:'Example Customer Added',phone:null,email:null,notes:null,
    created_at:'2026-10-13T12:00:00.000Z',
  });
  assert.equal(saveLocalDemoWorkspace(workspace,storage),true);
  assert.equal(storage.getItem(LOCAL_DEMO_STORAGE_KEY)!==null,true);
  const loaded=loadLocalDemoWorkspace(storage,'2026-10-13');
  assert.equal(loaded.persistence,'browser');
  assert.equal(loaded.workspace.customers.length,4);
  assert.equal(loaded.workspace.customers[3].name,'Example Customer Added');
});

test('stores only planned synthetic arrival confirmations and rejects dangling arrival IDs',()=>{
  const storage=memoryStorage();
  const date='2026-10-13';
  const workspace=createInitialDemoWorkspace(date);
  const {workday}=buildLocalDemoPlan(workspace,date,'8','6');
  workday.arrivedVisitId=workday.plannedVisitIds[0];
  workspace.workdays.push(workday);
  assert.equal(saveLocalDemoWorkspace(workspace,storage),true);
  assert.equal(loadLocalDemoWorkspace(storage,date).workspace.workdays[0].arrivedVisitId,workday.plannedVisitIds[0]);
  workday.arrivedVisitId='preview-visit-not-in-plan';
  storage.setItem(LOCAL_DEMO_STORAGE_KEY,JSON.stringify(workspace));
  const restored=loadLocalDemoWorkspace(storage,date);
  assert.equal(restored.workspace.workdays.length,1,'invalid local data falls back to the fresh sample assignment');
  assert.equal(restored.workspace.workdays[0].approvedQueueKey,'local-preview-2026-10-13-sample-assignment');
  assert.match(restored.notice??'',/could not be read/);
});

test('worker travel and arrival are separate local transitions and survive reload',()=>{
  const storage=memoryStorage();
  const date='2026-10-13';
  const workspace=createInitialDemoWorkspace(date);
  const {workday}=buildLocalDemoPlan(workspace,date,'8','6');
  const visitId=workday.plannedVisitIds[0];
  const started=beginLocalDemoWorkday(workday,1000);
  assert.throws(()=>confirmLocalDemoArrival(started,visitId),/Begin sample travel/);
  const traveling=beginLocalDemoTravel(started,visitId);
  assert.equal(traveling.travelingVisitId,visitId);
  assert.equal(traveling.arrivedVisitId,null);
  assert.strictEqual(beginLocalDemoTravel(traveling,visitId),traveling,'repeated travel start is idempotent');
  const arrived=confirmLocalDemoArrival(traveling,visitId);
  assert.equal(arrived.travelingVisitId,null);
  assert.equal(arrived.arrivedVisitId,visitId);
  assert.throws(()=>beginLocalDemoTravel(workday,visitId),/Start the sample day/);
  workspace.workdays.push(traveling);
  assert.equal(saveLocalDemoWorkspace(workspace,storage),true);
  const restored=loadLocalDemoWorkspace(storage,date).workspace.workdays[0];
  assert.equal(restored.travelingVisitId,visitId,'in-progress sample travel survives reload');
  assert.equal(restored.arrivedVisitId,null);
});

test('an uncompleted stop can be deferred after travel or arrival and clears the in-progress leg',()=>{
  const storage=memoryStorage();
  const date='2026-10-13';
  const workspace=createInitialDemoWorkspace(date,true);
  const day=workspace.workdays[0];
  const visitId=day.plannedVisitIds[2];
  const locationId=workspace.agreements.find(item=>`${item.id}:${date}`===visitId)!.location_id;
  const started=beginLocalDemoWorkday(day,1000);
  const traveling=beginLocalDemoTravel(started,visitId);
  const deferredInTransit=deferLocalDemoStop(traveling,visitId,'customer_unavailable','',2000,visitId,
    {locationId,minute:9*60+20,visitId});
  assert.equal(deferredInTransit.travelingVisitId,null);
  assert.equal(deferredInTransit.arrivedVisitId,null);
  assert.equal(deferredInTransit.routePositionLocationId,locationId);
  assert.equal(deferredInTransit.routePositionMinute,9*60+20);
  assert.equal(deferredInTransit.lunchAfterVisitId,visitId,'lunch can remain anchored at the current position');
  assert.deepEqual(deferredInTransit.visits,day.visits);
  assert.equal(saveLocalDemoWorkspace({...workspace,workdays:[deferredInTransit]},storage),true);
  const restored=loadLocalDemoWorkspace(storage,date).workspace.workdays[0];
  assert.equal(restored.routePositionVisitId,visitId);
  assert.equal(restored.deferredStops?.[0].reason,'customer_unavailable');

  const freshStarted=beginLocalDemoWorkday(day,1000);
  const arrived=confirmLocalDemoArrival(beginLocalDemoTravel(freshStarted,visitId),visitId);
  const deferredOnsite=deferLocalDemoStop(arrived,visitId,'access_issue','Gate code missing',3000,null,
    {locationId,minute:9*60+25,visitId});
  assert.equal(deferredOnsite.arrivedVisitId,null);
  assert.equal(deferredOnsite.travelingVisitId,null);
  assert.equal(deferredOnsite.deferredStops?.[0].note,'Gate code missing');
});

test('deferring a stop preserves assignment and visit history, recalculates lunch and return, and supports undo after reload',()=>{
  const storage=memoryStorage();
  const date='2026-10-13';
  const workspace=createInitialDemoWorkspace(date,true);
  const workday=workspace.workdays[0];
  const stopIds=workday.plannedVisitIds;
  const routeStops:IllustrativeRouteStop[]=stopIds.map(id=>{
    const agreement=workspace.agreements.find(item=>`${item.id}:${date}`===id)!;
    return {id,locationId:agreement.location_id,serviceMinutes:agreement.estimated_minutes};
  });
  const travelMinutes=buildIllustrativeTravelMatrix(workspace.locations.map(item=>item.id));
  const baseline=estimateIllustrativeRoute({stops:routeStops,travelMinutes,startMinute:workday.startMinute,endMinute:workday.endMinute,lunchDurationMinutes:30,lunchAfterVisitId:workday.lunchAfterVisitId});
  const afterDeferralStops=routeStops.filter(stop=>stop.id!==stopIds[2]);
  const candidateSlots=findIllustrativeLunchSlots({stops:afterDeferralStops,travelMinutes,startMinute:workday.startMinute,endMinute:workday.endMinute,durationMinutes:30});
  const replacementLunch=candidateSlots.find(slot=>slot.feasible)?.afterVisitId??candidateSlots.at(-1)?.afterVisitId??null;
  const deferred=deferLocalDemoStop(workday,stopIds[2],'customer_unavailable','',12345,replacementLunch);
  const recalculated=estimateIllustrativeRoute({stops:afterDeferralStops,travelMinutes,startMinute:workday.startMinute,endMinute:workday.endMinute,lunchDurationMinutes:30,lunchAfterVisitId:deferred.lunchAfterVisitId});
  assert.deepEqual(deferred.plannedVisitIds,stopIds,'deferral keeps the approved assignment record');
  assert.deepEqual(deferred.visits,workday.visits,'deferral does not create or rewrite a completed/skipped visit');
  assert.equal(deferred.deferredStops?.[0].visitId,stopIds[2]);
  assert.equal(deferred.deferredStops?.[0].previousLunchAfterVisitId,stopIds[2]);
  assert.equal(deferred.deferredStops?.[0].replacementLunchAfterVisitId,replacementLunch);
  assert.equal(recalculated.stops.some(stop=>stop.id===stopIds[2]),false);
  assert.equal(recalculated.lunch?.afterVisitId,replacementLunch);
  assert.ok(recalculated.finishMinute<baseline.finishMinute,'the route finish reflects the removed service and new lunch slot');
  assert.equal(saveLocalDemoWorkspace({...workspace,workdays:[deferred]},storage),true);
  const restoredFromStorage=loadLocalDemoWorkspace(storage,date).workspace.workdays[0];
  assert.equal(restoredFromStorage.deferredStops?.[0].reason,'customer_unavailable');
  const originalSlots=findIllustrativeLunchSlots({stops:routeStops,travelMinutes,startMinute:workday.startMinute,endMinute:workday.endMinute,durationMinutes:30});
  const restored=undoLocalDemoStopDefer(restoredFromStorage,stopIds[2],originalSlots.map(slot=>slot.afterVisitId),originalSlots.filter(slot=>slot.feasible).map(slot=>slot.afterVisitId));
  assert.deepEqual(restored.deferredStops,[]);
  assert.equal(restored.lunchAfterVisitId,stopIds[2],'undo restores the worker’s earlier lunch choice');
  assert.deepEqual(restored.visits,workday.visits);
});

test('stop deferral rejects active or visited work, requires an Other note, and preserves a newer lunch choice on undo',()=>{
  const date='2026-10-13';
  const workspace=createInitialDemoWorkspace(date,true);
  const workday=workspace.workdays[0];
  const [first,second,third]=workday.plannedVisitIds;
  assert.throws(()=>deferLocalDemoStop({...workday,workSession:startWork(first,1000)},first,'customer_unavailable','',2000,third),/active sample visit/);
  assert.throws(()=>deferLocalDemoStop(workday,third,'other','  ',2000,second),/short note/);
  const deferred=deferLocalDemoStop(workday,third,'weather_safety','Storm nearby',2000,second);
  const currentAfterManualChoice={...deferred,lunchAfterVisitId:first};
  const restored=undoLocalDemoStopDefer(currentAfterManualChoice,third,[first,second,third],[first,second,third]);
  assert.equal(restored.lunchAfterVisitId,first,'undo does not overwrite a lunch choice made after deferral');
  const sameSlotChosenAgain=undoLocalDemoStopDefer({...deferred,deferredStops:deferred.deferredStops?.map(stop=>({...stop,lunchChoiceWasManual:true}))},third,[first,second,third],[first,second,third]);
  assert.equal(sameSlotChosenAgain.lunchAfterVisitId,second,'even reselecting the automatic slot is treated as a manual choice');
  assert.throws(()=>beginLocalDemoTravel({...deferred,dayStartedAt:1000},third),/deferred sample stop/);
});

test('rebuilding a sample day preserves deferral markers for stops that remain due',()=>{
  const date='2026-10-13';
  const workspace=createInitialDemoWorkspace(date,true);
  const workday=workspace.workdays[0];
  const deferred=deferLocalDemoStop(workday,workday.plannedVisitIds[1],'access_issue','',2000,workday.plannedVisitIds[2]);
  const rebuilt=buildLocalDemoPlan({...workspace,workdays:[deferred]},date,'8','6').workday;
  assert.equal(rebuilt.deferredStops?.length,1);
  assert.equal(rebuilt.deferredStops?.[0].visitId,workday.plannedVisitIds[1]);
  assert.equal(rebuilt.deferredStops?.[0].originalIndex,1);
  assert.equal(rebuilt.approvedQueueKey,null,'a rebuilt workday still needs fresh approval');
});

test('compressed local sample photos are bounded, keyed by visit, and persist in the browser workspace',()=>{
  const storage=memoryStorage();
  const date='2026-10-13';
  const workspace=createInitialDemoWorkspace(date);
  const {workday}=buildLocalDemoPlan(workspace,date,'8','6');
  const visitId=workday.plannedVisitIds[0];
  const photo={id:'preview-photo-one',name:'before.jpg',dataUrl:'data:image/jpeg;base64,/9j/4AAQSkZJRg==',createdAt:'2026-10-13T12:00:00.000Z'};
  workday.photosByVisitId={[visitId]:[photo]};
  workspace.workdays.push(workday);
  assert.equal(saveLocalDemoWorkspace(workspace,storage),true);
  const restored=loadLocalDemoWorkspace(storage,date).workspace.workdays[0];
  assert.deepEqual(restored.photosByVisitId?.[visitId],[photo]);

  const tooMany={...workspace,workdays:[{...workday,photosByVisitId:{[visitId]:Array.from({length:MAX_LOCAL_DEMO_PHOTOS_PER_VISIT+1},(_,index)=>({...photo,id:`preview-photo-${index}`}))}}]};
  storage.setItem(LOCAL_DEMO_STORAGE_KEY,JSON.stringify(tooMany));
  const rejectedCount=loadLocalDemoWorkspace(storage,date);
  assert.match(rejectedCount.notice??'',/could not be read/);
  assert.deepEqual(rejectedCount.workspace.workdays[0].photosByVisitId,{});

  const invalidUrl={...workspace,workdays:[{...workday,photosByVisitId:{[visitId]:[{...photo,dataUrl:'data:image/png;base64,AA=='}]}}]};
  storage.setItem(LOCAL_DEMO_STORAGE_KEY,JSON.stringify(invalidUrl));
  assert.match(loadLocalDemoWorkspace(storage,date).notice??'',/could not be read/);
});

test('replanning preserves current sample travel and photos for visits that remain assigned',()=>{
  const date='2026-10-13';
  const workspace=createInitialDemoWorkspace(date);
  const {workday}=buildLocalDemoPlan(workspace,date,'8','6');
  const first=workday.plannedVisitIds[0];
  const second=workday.plannedVisitIds[1];
  workday.dayStartedAt=1000;
  workday.travelingVisitId=second;
  workday.photosByVisitId={[first]:[{id:'preview-photo-kept',name:'kept.jpg',dataUrl:'data:image/jpeg;base64,/9j/4AAQSkZJRg==',createdAt:'2026-10-13T12:00:00.000Z'}]};
  workspace.workdays=[workday];
  const rebuilt=buildLocalDemoPlan(workspace,date,'8','6').workday;
  assert.equal(rebuilt.travelingVisitId,second);
  assert.deepEqual(rebuilt.photosByVisitId,workday.photosByVisitId);
});

test('migrates v1 browser data in place without losing saved customers, addresses, or recurring jobs',()=>{
  const storage=memoryStorage();
  const versionOne=createInitialDemoWorkspace('2026-10-13');
  storage.setItem(LEGACY_LOCAL_DEMO_STORAGE_KEY,JSON.stringify({
    version:1,customers:versionOne.customers,locations:versionOne.locations,agreements:versionOne.agreements,
  }));
  const loaded=loadLocalDemoWorkspace(storage,'2026-10-13');
  assert.equal(loaded.workspace.version,2);
  assert.equal(loaded.workspace.customers.length,3);
  assert.equal(loaded.workspace.locations.length,3);
  assert.equal(loaded.workspace.agreements.length,3);
  assert.deepEqual(loaded.workspace.workdays,[]);
  assert.equal(storage.getItem(LEGACY_LOCAL_DEMO_STORAGE_KEY),null);
  assert.notEqual(storage.getItem(LOCAL_DEMO_STORAGE_KEY),null);
});

test('uses a stable, backend-compatible synthetic service visit ID within the saved API ID bounds',()=>{
  const first=createDemoVisitId('a'.repeat(100),'2026-10-13');
  assert.equal(first,createDemoVisitId('a'.repeat(100),'2026-10-13'));
  assert.match(first,/^[a-zA-Z0-9_-]{1,100}$/);
});

test('builds a bounded workday from real recurring agreements and preserves unscheduled due visits',()=>{
  const workspace=createInitialDemoWorkspace('2026-10-13');
  const {workday,plan}=buildLocalDemoPlan(workspace,'2026-10-13','1','1');
  assert.equal(plan.dueCount,3);
  assert.equal(workday.plannedVisitIds.length,1);
  assert.equal(workday.unscheduledVisitIds.length,2);
  assert.equal(workday.startMinute,480);
  assert.equal(workday.endMinute,540);
  const review=createSavedQueueReview('preview-business',workday.date,plan.stops.map(stop=>{
    const visit=plan.predictions.find(item=>item.agreementId===stop.jobId.split(':')[0]);
    const agreement=workspace.agreements.find(item=>item.id===stop.jobId.split(':')[0])!;
    return {id:stop.jobId,customer:agreement.customer_id,service:agreement.service_name,rateCents:agreement.rate_cents,estimatedMinutes:visit?.minutes??agreement.estimated_minutes,travelMinutesBefore:0};
  }),{hours:workday.hours,maxJobs:workday.maxJobs,workdayStart:'08:00',workdayFinish:'09:00'});
  assert.equal(canApproveSavedQueueReview(review),true);
  assert.equal(isSavedQueueApproved(review,workday.approvedQueueKey),false);
  const firstAgreement=workspace.agreements.find(item=>item.id===workday.plannedVisitIds[0].split(':')[0])!;
  const completed={
    ...workday,approvedQueueKey:'stale-approval',visits:[{
      id:createDemoVisitId(firstAgreement.id,'2026-10-13'),agreement_id:firstAgreement.id,
      scheduled_date:'2026-10-13',status:'completed',actual_minutes:40,
    }],dayStartedAt:12345,
  };
  const rebuilt=buildLocalDemoPlan({...workspace,workdays:[completed]},'2026-10-13','8','6');
  assert.equal(rebuilt.workday.approvedQueueKey,null,'a rebuilt queue requires a new approval');
  assert.equal(rebuilt.workday.dayStartedAt,12345,'a replan does not erase the started-day state');
  assert.equal(rebuilt.workday.plannedVisitIds.includes(`${firstAgreement.id}:2026-10-13`),false,'completed visits stay out of a rebuilt queue');
  assert.throws(()=>buildLocalDemoPlan({...workspace,workdays:[{...completed,workSession:startWork('sample-job',1000)}]},'2026-10-13','8','6'),/active sample visit/);
  assert.throws(()=>buildLocalDemoPlan(workspace,'2026-10-13','0','1'),/available hours/);
  assert.throws(()=>buildLocalDemoPlan(workspace,'2026-10-13','24','1'),/starts at 08:00/);
  assert.throws(()=>buildLocalDemoPlan(workspace,'2026-10-13','8','0'),/job limit/);
});

test('completion snapshots and invoice drafts persist locally and draft preparation is idempotent',()=>{
  const storage=memoryStorage();
  const workspace=createInitialDemoWorkspace('2026-10-13');
  const {workday}=buildLocalDemoPlan(workspace,'2026-10-13','8','6');
  const id=workday.plannedVisitIds[0];
  const agreement=workspace.agreements.find(item=>item.id===id.split(':')[0])!;
  const serviceVisitId=createDemoVisitId(agreement.id,'2026-10-13');
  const customer=workspace.customers.find(item=>item.id===agreement.customer_id)!;
  workday.visits=[{
    id:serviceVisitId,agreement_id:agreement.id,scheduled_date:'2026-10-13',status:'completed',actual_minutes:42,work_note:'Sample work note',
    completed_customer_id:customer.id,completed_customer_name:customer.name,
    completed_service_name:agreement.service_name,completed_rate_cents:agreement.rate_cents,
  }];
  workspace.workdays.push(workday);
  assert.equal(saveLocalDemoWorkspace(workspace,storage),true);
  const restored=loadLocalDemoWorkspace(storage,'2026-10-13').workspace;
  const day=demoDayForDate(restored,'2026-10-13');
  assert.equal(day.visits.find(visit=>visit.id===serviceVisitId)?.status,'completed');
  assert.deepEqual(day.durationHistory,[],'same-day service is not historical feedback for its own workday');
  assert.deepEqual(demoDayForDate(restored,'2026-10-20').durationHistory,[{agreement_id:agreement.id,actual_minutes:42}]);
  const drafts=prepareLocalDemoInvoiceDrafts(day,'preview-business',[]);
  assert.equal(drafts.length,1);
  assert.equal(drafts[0].lines[0].unitPriceCents,agreement.rate_cents);
  assert.equal(invoiceTotals(drafts[0].lines,drafts[0].taxBasisPoints).totalCents,agreement.rate_cents);
  assert.equal(drafts[0].dueOn,'2026-10-27');
  const repeated=prepareLocalDemoInvoiceDrafts(day,'preview-business',drafts);
  assert.equal(repeated.length,1);
  restored.workdays[0].invoiceDrafts=repeated;
  assert.equal(saveLocalDemoWorkspace(restored,storage),true);
  const again=loadLocalDemoWorkspace(storage,'2026-10-13').workspace;
  assert.equal(again.workdays[0].invoiceDrafts[0].serviceVisitId,serviceVisitId);
});

test('reset removes preview edits and the next load returns sample fixtures',()=>{
  const storage=memoryStorage();
  const workspace=createInitialDemoWorkspace('2026-10-13');
  workspace.customers=[];
  saveLocalDemoWorkspace(workspace,storage);
  assert.equal(clearLocalDemoWorkspace(storage),true);
  assert.equal(storage.getItem(LOCAL_DEMO_STORAGE_KEY),null);
  assert.equal(loadLocalDemoWorkspace(storage,'2026-10-13').workspace.customers.length,3);
});

test('unreadable saved preview data falls back to clearly identified sample fixtures',()=>{
  const storage=memoryStorage();
  storage.setItem(LOCAL_DEMO_STORAGE_KEY,'not-json');
  const loaded=loadLocalDemoWorkspace(storage,'2026-10-13');
  assert.equal(loaded.workspace.customers.length,3);
  assert.match(loaded.notice??'',/could not be read/);
});

test('malformed preview rows and dangling service references fall back to fixtures',()=>{
  const storage=memoryStorage();
  const workspace=createInitialDemoWorkspace('2026-10-13');
  workspace.agreements[0].location_id='missing-sample-location';
  storage.setItem(LOCAL_DEMO_STORAGE_KEY,JSON.stringify(workspace));
  const loaded=loadLocalDemoWorkspace(storage,'2026-10-13');
  assert.equal(loaded.workspace.agreements.length,3);
  assert.match(loaded.notice??'',/could not be read/);

  storage.setItem(LOCAL_DEMO_STORAGE_KEY,JSON.stringify({version:1,customers:[null],locations:[],agreements:[]}));
  assert.equal(loadLocalDemoWorkspace(storage,'2026-10-13').workspace.customers.length,3);
});
