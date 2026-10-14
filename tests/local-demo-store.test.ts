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
  type DemoStorage,
} from '../src/demo/local-demo-store';
import {buildLocalDemoPlan,prepareLocalDemoInvoiceDrafts} from '../src/demo/local-demo-workday';
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
  assert.deepEqual(restored.workspace.workdays,[]);
  assert.match(restored.notice??'',/could not be read/);
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
    }],
  };
  const rebuilt=buildLocalDemoPlan({...workspace,workdays:[completed]},'2026-10-13','8','6');
  assert.equal(rebuilt.workday.approvedQueueKey,null,'a rebuilt queue requires a new approval');
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
