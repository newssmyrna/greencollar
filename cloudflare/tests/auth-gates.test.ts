import test from 'node:test';
import assert from 'node:assert/strict';
import { customerApi } from '../src/customer-api';
import { dayDataApi } from '../src/day-data-api';
import { businessApi } from '../src/business-api';
import type { Env } from '../src/auth';

const noDb = {get DB(){throw new Error('DB must never be used before authentication');}} as unknown as Env;
const configured = {
  get DB(){throw new Error('DB must never be used before authentication');},
  OIDC_ISSUER:'https://identity.example.test',
  OIDC_AUDIENCE:'greencollar-api',
  OIDC_JWKS_URL:'https://identity.example.test/.well-known/jwks.json'
} as Env;
const get = (p:string)=>new Request('https://api.example.test'+p);

test('customer API fails closed when Clerk verification is not configured',async()=>{
 const r=await customerApi(get('/v1/customers?business_id=demo'),noDb,new URL('https://api.example.test/v1/customers?business_id=demo'));
 assert.equal(r.status,503);
 assert.equal((await r.json() as {error:string}).error,'authentication_unconfigured');
});
test('day API fails closed before any database access',async()=>{
 const u=new URL('https://api.example.test/v1/day?business_id=demo&date=2026-10-12');
 const r=await dayDataApi(get(u.pathname+u.search),noDb,u);
 assert.equal(r.status,503);
});
test('business creation rejects requests with no verified token',async()=>{
 const r=await businessApi(new Request('https://api.example.test/v1/business',{method:'POST',body:JSON.stringify({name:'Unverified Company'})}),configured);
 assert.equal(r.status,401);
});
test('customer and day APIs reject missing bearer authentication even with configured issuer',async()=>{
 const a=new URL('https://api.example.test/v1/customers?business_id=demo');
 const b=new URL('https://api.example.test/v1/day?business_id=demo&date=2026-10-12');
 assert.equal((await customerApi(get(a.pathname+a.search),configured,a)).status,401);
 assert.equal((await dayDataApi(get(b.pathname+b.search),configured,b)).status,401);
});
