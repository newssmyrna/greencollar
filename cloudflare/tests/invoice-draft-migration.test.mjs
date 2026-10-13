import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const migration8=readFileSync(new URL('../migrations/0008_invoice_drafts.sql',import.meta.url),'utf8');
const migration9=readFileSync(new URL('../migrations/0009_invoice_draft_visit_integrity.sql',import.meta.url),'utf8');

function fixture({orphan=false}={}){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(`
    CREATE TABLE businesses(id TEXT PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE service_visits(id TEXT PRIMARY KEY,business_id TEXT NOT NULL);
    INSERT INTO businesses(id,name) VALUES ('business-a','A'),('business-b','B');
    INSERT INTO service_visits(id,business_id) VALUES ('visit-a','business-a'),('visit-b','business-b');
  `);
  db.exec(migration8);
  db.prepare(`INSERT INTO invoice_drafts(
    id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,
    service_description,quantity,unit_price_cents,tax_basis_points,status,notes
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'invoice-a','business-a',orphan?'missing-visit':'visit-a','customer-a','Customer A',
    '2026-10-12','2026-10-19','Pool service',1,6500,0,'draft','Service visit visit-a'
  );
  return db;
}

function applyMigration(db,sql){
  db.exec('BEGIN');
  try{db.exec(sql);db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
}

function insertDraft(db,{id,businessId,visitId}){
  db.prepare(`INSERT INTO invoice_drafts(
    id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,
    service_description,quantity,unit_price_cents,tax_basis_points,status,notes
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,businessId,visitId,'customer-x','Customer X','2026-10-12','2026-10-19',
    'Service',1,1000,0,'draft',''
  );
}

test('integrity migration preserves drafts and rejects cross-business or deleted visit links',()=>{
  const db=fixture();
  try{
    applyMigration(db,migration9);
    const saved=db.prepare('SELECT id,business_id,service_visit_id,unit_price_cents FROM invoice_drafts').get();
    assert.deepEqual(saved,{id:'invoice-a',business_id:'business-a',service_visit_id:'visit-a',unit_price_cents:6500});
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.throws(()=>insertDraft(db,{id:'invoice-cross',businessId:'business-b',visitId:'visit-a'}));
    assert.throws(()=>db.prepare('DELETE FROM service_visits WHERE id=?').run('visit-a'));
    insertDraft(db,{id:'invoice-b',businessId:'business-b',visitId:'visit-b'});
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM invoice_drafts').get().count,2);
  }finally{db.close();}
});

test('integrity migration fails closed when a prepared draft has no matching visit',()=>{
  const db=fixture({orphan:true});
  try{
    assert.throws(()=>applyMigration(db,migration9));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM invoice_drafts WHERE id=?').get('invoice-a').count,1);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='invoice_drafts_next'`).get().count,0);
  }finally{db.close();}
});
