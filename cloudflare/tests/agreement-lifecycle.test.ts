import test from 'node:test';
import assert from 'node:assert/strict';
import {exportJWK,generateKeyPair,SignJWT} from 'jose';
import {agreementsApi} from '../src/agreements-api';
import type {Env} from '../src/auth';

async function signedDb(options:{role?:'owner'|'admin'|'worker';active?:number|null;changes?:number}={}){
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const jwk=await exportJWK(publicKey);Object.assign(jwk,{kid:'agreement-lifecycle-key',alg:'RS256',use:'sig'});
 const jwksUrl='https://agreement-lifecycle.example.test/'+crypto.randomUUID()+'/jwks.json';
 const token=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'agreement-lifecycle-key'})
  .setIssuer('https://clerk.validation.example.test').setAudience('greencollar-api')
  .setSubject('user_123').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json'}});
 const queries:string[]=[];const writes:string[]=[];
 const db={prepare(sql:string){queries.push(sql);return {bind(..._values:unknown[]){return {
  async first(){if(sql.includes('business_memberships'))return {role:options.role??'owner'};if(sql.includes('SELECT active FROM service_agreements'))return options.active===null?null:{active:options.active??1};return null;},
  async all(){return {results:[]};},
  async run(){writes.push(sql);return {meta:{changes:options.changes??1}};}
 };}};}};
 return {token,env:{DB:db,OIDC_ISSUER:'https://clerk.validation.example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:jwksUrl} as unknown as Env,
  queries,writes,restore:()=>{globalThis.fetch=originalFetch;}};
}
const agreementId='00000000-0000-4000-8000-000000000099';
function patch(token:string,body:unknown,id=agreementId){
 return new Request('https://api.example.test/v1/agreements?business_id=business_1&id='+id,{
  method:'PATCH',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)
 });
}
test('owner can pause a tenant-scoped agreement without deleting it',async()=>{
 const auth=await signedDb({active:1});
 try{
  const response=await agreementsApi(patch(auth.token,{active:false}),auth.env,new URL(patch(auth.token,{active:false}).url));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{id:agreementId,active:0});
  const update=auth.writes[0]??'';
  assert.match(update,/UPDATE service_agreements SET active=\? WHERE business_id=\? AND id=\?/);
 }finally{auth.restore();}
});
test('repeating the requested active state is idempotent',async()=>{
 const auth=await signedDb({active:0});
 try{
  const request=patch(auth.token,{active:false});
  const response=await agreementsApi(request,auth.env,new URL(request.url));
  assert.equal(response.status,200);
  assert.equal(auth.writes.length,0);
 }finally{auth.restore();}
});
test('agreement IDs must be valid and exist in the selected business',async()=>{
 const auth=await signedDb({active:null});
 try{
  const request=patch(auth.token,{active:false});
  const response=await agreementsApi(request,auth.env,new URL(request.url));
  assert.equal(response.status,404);
  assert.equal(auth.writes.length,0);
 }finally{auth.restore();}
});
test('workers cannot pause agreements',async()=>{
 const auth=await signedDb({role:'worker'});
 try{
  const request=patch(auth.token,{active:false});
  const response=await agreementsApi(request,auth.env,new URL(request.url));
  assert.equal(response.status,403);
  assert.equal(auth.writes.length,0);
 }finally{auth.restore();}
});
test('pause endpoint accepts only a boolean active field',async()=>{
 const auth=await signedDb();
 try{
  const request=patch(auth.token,{active:false,customerId:'other'});
  const response=await agreementsApi(request,auth.env,new URL(request.url));
  assert.equal(response.status,400);
  assert.equal(auth.writes.length,0);
 }finally{auth.restore();}
});
