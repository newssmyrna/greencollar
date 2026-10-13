import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const migration1=readFileSync(new URL('../migrations/0001_core.sql',import.meta.url),'utf8');
const migration2=readFileSync(new URL('../migrations/0002_auth_memberships.sql',import.meta.url),'utf8');
const migration10=readFileSync(new URL('../migrations/0010_routing_provider_controls.sql',import.meta.url),'utf8');

test('routing migration creates tenant consent controls and an aggregate-only bounded meter',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');db.exec(migration1);db.exec(migration2);db.exec(migration10);
  db.prepare('INSERT INTO businesses(id,name) VALUES(?,?)').run('business-a','A');
  db.prepare("INSERT INTO business_memberships(business_id,subject,role) VALUES(?,?,'owner')").run('business-a','operator-a');
  db.prepare('INSERT INTO business_routing_settings(business_id,enabled,notice_version,updated_by) VALUES(?,0,?,?)').run('business-a','notice-1','operator-a');
  db.prepare('INSERT INTO routing_notice_acknowledgements(business_id,subject,notice_version) VALUES(?,?,?)').run('business-a','operator-a','notice-1');
  db.prepare('INSERT INTO road_provider_usage_monthly(billing_month,element_count,estimated_cost_micro_usd,updated_at) VALUES(?,?,?,?)').run('2026-10',144,720000,'2026-10-13T12:00:00.000Z');
  assert.equal(db.prepare('SELECT enabled FROM business_routing_settings WHERE business_id=?').get('business-a').enabled,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM routing_notice_acknowledgements').get().count,1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.throws(()=>db.prepare('INSERT INTO road_provider_usage_monthly(billing_month,element_count,estimated_cost_micro_usd,updated_at) VALUES(?,?,?,?)').run('2026-11',19501,1,'now'));
  assert.throws(()=>db.prepare('INSERT INTO road_provider_usage_monthly(billing_month,element_count,estimated_cost_micro_usd,updated_at) VALUES(?,?,?,?)').run('2026-12',1,120000001,'now'));
  const columns=db.prepare('PRAGMA table_info(road_provider_usage_monthly)').all().map(row=>row.name);
  assert.deepEqual(columns,['billing_month','element_count','estimated_cost_micro_usd','updated_at']);
 }finally{db.close();}
});
