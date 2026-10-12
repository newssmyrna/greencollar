import test from 'node:test';
import assert from 'node:assert/strict';
import {createServiceLocationApi,serviceLocationApi} from '../src/service-location-api';
import type {Env} from '../src/auth';
const configured={OIDC_ISSUER:'https://identity.example.test',OIDC_AUDIENCE:'greencollar-api',OIDC_JWKS_URL:'https://identity.example.test/jwks'};
function fixture(role:'owner'|'admin'|'worker'|null='owner',customerBusiness='business-a',fail=false,count=1){
  const queries:Array<{sql:string;values:unknown[]}>=[];
  const DB={prepare(sql:string){return {bind(...values:unknown[]){
    queries.push({sql,values});
    return {
      async first(){
        if(fail)throw new Error('storage failed');
        if(sql.includes('business_memberships'))return role&&values[0]==='business-a'?{role}:null;
        return values[0]===customerBusiness&&values[1]==='customer-a'?{id:'customer-a'}:null;
      },
      async all(){return {results:Array.from({length:count},(_,i)=>({id:'location-'+i,customer_id:'customer-a',address:'Test address',preferences:null,lat:null,lon:null}))};},
      async run(){return {meta:{changes:values[1]===customerBusiness&&values[2]==='customer-a'?1:0}};}
    };
  }};}};
  return {env:{...configured,DB} as unknown as Env,queries};
}
const api=createServiceLocationApi(async()=> 'signed-user');
function request(method='GET',body?:string,business='business-a'){
 const url=new URL('https://api.example.test/v1/locations?business_id='+business+'&customer_id=customer-a');
 return {url,request:new Request(url,{method,...(body!==undefined?{body}: {})})};
}
test('production endpoint fails closed before database access',async()=>{
 const env={get DB(){throw new Error('unexpected database access');}} as unknown as Env;
 const r=request();assert.equal((await serviceLocationApi(r.request,env,r.url)).status,503);
 const missing={...configured,get DB(){throw new Error('unexpected database access');}} as unknown as Env;
 assert.equal((await serviceLocationApi(r.request,missing,r.url)).status,401);
});
test('membership and customer tenancy are checked separately',async()=>{
 const foreign=request('GET',undefined,'business-b');
 assert.equal((await api(foreign.request,fixture().env,foreign.url)).status,403);
 const own=request();
 assert.equal((await api(own.request,fixture('owner','business-b').env,own.url)).status,404);
});
test('worker can read but cannot create addresses',async()=>{
 const read=request();assert.equal((await api(read.request,fixture('worker').env,read.url)).status,200);
 const write=request('POST',JSON.stringify({address:'Test street'}));
 const f=fixture('worker');
 assert.equal((await api(write.request,f.env,write.url)).status,403);
 assert.equal(f.queries.length,1);
});
test('owner creates an address with ownership rechecked in the insert',async()=>{
 const f=fixture();const r=request('POST',JSON.stringify({address:' Test street ',preferences:' Side gate '}));
 const response=await api(r.request,f.env,r.url);
 assert.equal(response.status,201);
 const body=await response.json() as {location:{id:string;address:string;preferences:string}};
 assert.equal(body.location.address,'Test street');assert.equal(body.location.preferences,'Side gate');
 const insertion=f.queries.find(q=>q.sql.startsWith('INSERT'))!;
 assert.match(insertion.sql,/WHERE EXISTS.*business_id=\? AND id=\?/);
 assert.deepEqual(insertion.values.slice(1),['business-a','customer-a','Test street','Side gate','business-a','customer-a']);
});
test('rejects invalid address and oversized request without insert',async()=>{
 for(const [body,status] of [[JSON.stringify({address:''}),400],['{',400],[JSON.stringify({address:'x',preferences:'x'.repeat(9000)}),413]] as const){
   const f=fixture();const r=request('POST',body);
   assert.equal((await api(r.request,f.env,r.url)).status,status);
   assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')),false);
 }
});
test('read identifies partial coverage and storage failures are explicit',async()=>{
 const r=request();const response=await api(r.request,fixture('owner','business-a',false,201).env,r.url);
 const data=await response.json() as {locations:unknown[];hasMore:boolean};
 assert.equal(data.locations.length,200);assert.equal(data.hasMore,true);
 // Failure after membership has passed must produce an explicit storage error.
 const f=fixture();
 const db=f.env.DB;
 const original=db.prepare.bind(db);
 db.prepare=((sql:string)=>{if(sql.startsWith('SELECT id FROM customers'))throw Error('unavailable');return original(sql);}) as typeof db.prepare;
 const failed=request();assert.equal((await api(failed.request,f.env,failed.url)).status,503);
});
