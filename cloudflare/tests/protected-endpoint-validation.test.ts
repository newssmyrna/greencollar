import test from 'node:test';
import assert from 'node:assert/strict';
import {exportJWK,generateKeyPair,SignJWT} from 'jose';
import {customerApi} from '../src/customer-api';
import {completeVisitApi} from '../src/visit-completion-api';
import type {Env} from '../src/auth';

async function signedEnv(db:unknown){
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);
  jwk.kid='endpoint-validation-key';
  jwk.alg='RS256';
  jwk.use='sig';
  const jwksUrl='https://validation.example.test/'+crypto.randomUUID()+'/jwks.json';
  const token=await new SignJWT({})
    .setProtectedHeader({alg:'RS256',kid:'endpoint-validation-key'})
    .setIssuer('https://clerk.validation.example.test')
    .setAudience('greencollar-api')
    .setSubject('user_123')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json'}});
  return {
    token,
    env:{DB:db,OIDC_ISSUER:'https://clerk.validation.example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:jwksUrl} as unknown as Env,
    restore:()=>{globalThis.fetch=originalFetch;}
  };
}

function customerDb(){
  const queries:string[]=[];
  const db={
    prepare(sql:string){
      queries.push(sql);
      return {bind(..._values:unknown[]){return {async first(){return {role:'owner'};},async run(){throw new Error('Invalid payload must not write');}};}};}
  };
  return {db,queries};
}

test('customer API returns controlled 400 responses for null, arrays, and invalid field types',async()=>{
  const {db,queries}=customerDb();
  const auth=await signedEnv(db);
  try{
    for(const body of [null,[],{name:42},{name:'A'.repeat(161)}]){
      const request=new Request('https://api.example.test/v1/customers?business_id=business_1',{
        method:'POST',
        headers:{Authorization:'Bearer '+auth.token,'content-type':'application/json'},
        body:JSON.stringify(body)
      });
      const url=new URL(request.url);
      const response=await customerApi(request,auth.env,url);
      assert.equal(response.status,400);
      assert.equal((await response.json() as {error:string}).error,'invalid_input');
    }
    assert.equal(queries.filter(sql=>sql.includes('INSERT')).length,0);
  }finally{auth.restore();}
});

function visitDb(options:{agreement?:Record<string,unknown>|null;visit?:Record<string,unknown>|null}={}){
  const queries:string[]=[];
  const writes:string[]=[];
  const db={
    prepare(sql:string){
      queries.push(sql);
      return {bind(..._values:unknown[]){return {
        async first(){
          if(sql.includes('business_memberships'))return {role:'owner'};
          if(sql.includes('FROM service_agreements'))return options.agreement===undefined?{id:'agreement_1',starts_on:'2026-10-01',ends_on:null,frequency:'weekly',interval_days:null,days_of_week:'[1]'}:options.agreement;
          if(sql.includes('FROM service_visits'))return options.visit??null;
          throw new Error('Unexpected query: '+sql);
        },
        async run(){writes.push(sql);return {meta:{changes:1}};}
      };}};}
  };
  return {db,queries,writes};
}

async function complete(env:Env,token:string,date='2026-10-12',actualMinutes=45){
  return completeVisitApi(new Request('https://api.example.test/v1/visits/complete',{
    method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({businessId:'business_1',agreementId:'agreement_1',date,actualMinutes})
  }),env);
}

test('visit completion rejects dates that are not due under the agreement recurrence',async()=>{
  const {db,queries,writes}=visitDb({agreement:{id:'agreement_1',starts_on:'2026-10-01',ends_on:null,frequency:'weekly',interval_days:null,days_of_week:'[2]'}});
  const auth=await signedEnv(db);
  try{
    const response=await complete(auth.env,auth.token);
    assert.equal(response.status,409);
    assert.equal((await response.json() as {error:string}).error,'visit_not_due');
    assert.equal(queries.some(sql=>sql.includes('FROM service_visits')),false);
    assert.equal(writes.length,0);
  }finally{auth.restore();}
});

test('visit completion rejects inactive agreements before reading or writing visits',async()=>{
  const {db,queries,writes}=visitDb({agreement:null});
  const auth=await signedEnv(db);
  try{
    const response=await complete(auth.env,auth.token);
    assert.equal(response.status,404);
    assert.equal((await response.json() as {error:string}).error,'agreement_not_found');
    assert.equal(queries.some(sql=>sql.includes('FROM service_visits')),false);
    assert.equal(writes.length,0);
  }finally{auth.restore();}
});

test('skipped visits cannot be changed to completed',async()=>{
  const {db,writes}=visitDb({visit:{id:'visit_1',status:'skipped',actual_minutes:null}});
  const auth=await signedEnv(db);
  try{
    const response=await complete(auth.env,auth.token);
    assert.equal(response.status,409);
    assert.equal((await response.json() as {error:string}).error,'visit_state_conflict');
    assert.equal(writes.length,0);
  }finally{auth.restore();}
});

test('repeating the same completion is idempotent; changing its duration conflicts',async()=>{
  const {db,writes}=visitDb({visit:{id:'visit_1',status:'completed',actual_minutes:45}});
  const auth=await signedEnv(db);
  try{
    assert.equal((await complete(auth.env,auth.token,'2026-10-12',45)).status,200);
    assert.equal((await complete(auth.env,auth.token,'2026-10-12',50)).status,409);
    assert.equal(writes.length,0);
  }finally{auth.restore();}
});

test('due visits can transition to completed once',async()=>{
  const {db,writes}=visitDb({visit:{id:'visit_1',status:'due',actual_minutes:null}});
  const auth=await signedEnv(db);
  try{
    const response=await complete(auth.env,auth.token);
    assert.equal(response.status,201);
    assert.equal(writes.length,1);
    assert.match(writes[0],/status IN \('due','planned','in_progress'\)/);
  }finally{auth.restore();}
});
