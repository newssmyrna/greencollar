import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVisitApi} from '../src/visit-completion-api';
import type {Env} from '../src/auth';
const noDb={get DB(){throw new Error('Database must not be accessed before JWT verification');}} as unknown as Env;
const config={...noDb,OIDC_ISSUER:'https://example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:'https://example.test/.well-known/jwks.json'} as Env;
const post=(body:unknown)=>new Request('https://example.test/v1/visits/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('completion rejects unauthenticated requests without touching the database',async()=>{
 const r=await completeVisitApi(post({businessId:'b1',agreementId:'a1',date:'2026-10-12',actualMinutes:45}),config);
 assert.equal(r.status,401);
});
test('completion fails closed without configured JWT verification',async()=>{
 const r=await completeVisitApi(post({businessId:'b1',agreementId:'a1',date:'2026-10-12',actualMinutes:45}),noDb);
 assert.equal(r.status,503);
});
test('completion only accepts POST even before authentication',async()=>{
 const r=await completeVisitApi(new Request('https://example.test/v1/visits/complete'),config);
 assert.equal(r.status,405);
});
