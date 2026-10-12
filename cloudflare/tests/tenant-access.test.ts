import test from 'node:test';
import assert from 'node:assert/strict';
import { businessAccess, type Env } from '../src/auth';

function membershipFixture(ownerBusiness:string, ownerSubject:string, role:'owner'|'admin'|'worker'='owner') {
  let sqlUsed='';
  let bound:unknown[]=[];
  const db={
    prepare(sql:string) {
      sqlUsed=sql;
      return {
        bind(...params:unknown[]) {
          bound=params;
          return {async first() {
            return params[0]===ownerBusiness && params[1]===ownerSubject ? {role} : null;
          }};
        }
      };
    }
  };
  return {env:{DB:db} as unknown as Env, query:()=>({sqlUsed,bound})};
}

test('a verified member can read their own business role',async()=>{
  const {env,query}=membershipFixture('business_A','clerk_user_A');
  assert.equal(await businessAccess(env,'clerk_user_A','business_A'),'owner');
  assert.match(query().sqlUsed,/WHERE business_id = \? AND subject = \?/);
  assert.deepEqual(query().bound,['business_A','clerk_user_A']);
});

test('subject from a different business is not authorized',async()=>{
  const {env}=membershipFixture('business_A','clerk_user_A');
  assert.equal(await businessAccess(env,'clerk_user_B','business_A'),null);
});

test('a member cannot select another business by replacing its id',async()=>{
  const {env}=membershipFixture('business_A','clerk_user_A');
  assert.equal(await businessAccess(env,'clerk_user_A','business_B'),null);
});

test('worker membership remains distinct from owner membership',async()=>{
  const {env}=membershipFixture('business_A','clerk_user_A','worker');
  assert.equal(await businessAccess(env,'clerk_user_A','business_A'),'worker');
});
