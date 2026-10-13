import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearLocalDemoWorkspace,
  createInitialDemoWorkspace,
  demoDayForDate,
  LOCAL_DEMO_STORAGE_KEY,
  loadLocalDemoWorkspace,
  saveLocalDemoWorkspace,
  type DemoStorage,
} from '../src/demo/local-demo-store';

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
