import test from 'node:test';
import assert from 'node:assert/strict';
import {startWork,pauseWork,completeWork} from '../src/domain/work-session';
import {canStartNextWork,startNextWork,hasSavedWorkCompletion,workSessionDate} from '../src/domain/work-handoff';
const completed=()=>completeWork(startWork('agreement:2026-10-12',1000),61000);
test('running and paused work cannot be replaced by saved or demo jobs',()=>{
 const running=startWork('agreement:2026-10-12',1000);
 for(const session of [running,pauseWork(running,61000)]){
  assert.equal(canStartNextWork(session,true),false);
  for(const next of ['next:2026-10-12','demo-job'])assert.throws(()=>startNextWork(next,121000,session,true),/active job/);
 }
});
test('unsaved completed visits cannot be discarded by any new start',()=>{
 const current=completed();
 assert.equal(canStartNextWork(current,false),false);
 for(const next of ['next:2026-10-12','demo-job'])assert.throws(()=>startNextWork(next,121000,current,false),/Save the completed visit/);
 assert.equal(current.jobId,'agreement:2026-10-12');
 assert.equal(current.elapsedMs,60000);
});
test('confirmed saved completion allows the next job without changing the old record',()=>{
 const current=completed();
 assert.equal(canStartNextWork(current,true),true);
 const next=startNextWork('next:2026-10-12',121000,current,true);
 assert.equal(next.jobId,'next:2026-10-12');assert.equal(next.status,'running');
 assert.equal(current.status,'completed');assert.equal(current.elapsedMs,60000);
});
test('empty and completed demo sessions can start another job',()=>{
 assert.equal(startNextWork('new',0,null,false).jobId,'new');
 const demo=completeWork(startWork('demo-job',1000),61000);
 assert.equal(canStartNextWork(demo,false),true);
 assert.equal(startNextWork('new',121000,demo,false).jobId,'new');
});
test('server completion evidence must match visit date, agreement, status, and duration',()=>{
 const evidence={agreement_id:'agreement',scheduled_date:'2026-10-12',status:'completed',actual_minutes:1};
 assert.equal(hasSavedWorkCompletion(completed(),[evidence]),true);
 for(const changed of [{...evidence,agreement_id:'other'},{...evidence,scheduled_date:'2026-10-13'},{...evidence,status:'pending'},{...evidence,actual_minutes:2},{...evidence,actual_minutes:null}])assert.equal(hasSavedWorkCompletion(completed(),[changed]),false);
 assert.equal(hasSavedWorkCompletion(null,[evidence]),false);
 assert.equal(hasSavedWorkCompletion(startWork('agreement:2026-10-12',1000),[evidence]),false);
 assert.equal(hasSavedWorkCompletion(completed(),[]),false);
});
test('prior workday recovery accepts only a scheduled visit with a real calendar date',()=>{
 assert.equal(workSessionDate(completed()),'2026-10-12');
 assert.equal(workSessionDate(startWork('agreement:2026-10-11',1000)),'2026-10-11');
 for(const id of ['demo-job','agreement:2026-02-30','agreement:invalid',':2026-10-12'])assert.equal(workSessionDate(startWork(id,1000)),null);
 assert.equal(workSessionDate(null),null);
});
