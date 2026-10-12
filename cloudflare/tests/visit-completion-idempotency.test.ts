import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {completeVisitApi,type Env} from '../src/visit-completion-api';

test('repeating the same accepted completion is safe after a lost response',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);
  jwk.kid='completion-test-key';
  jwk.alg='RS256';
  jwk.use='sig';
  const jwksUrl='https://green-test.example/'+crypto.randomUUID()+'/jwks.json';
  const token=await new SignJWT({})
    .setProtectedHeader({alg:'RS256',kid:'completion-test-key'})
    .setIssuer('https://clerk.example.test')
    .setAudience('greencollar-api')
    .setSubject('user_123')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json'}});
  try{
    const env={
      OIDC_ISSUER:'https://clerk.example.test',
      OIDC_AUDIENCE:'greencollar-api',
      OIDC_JWKS_URL:jwksUrl,
      DB:{
        prepare(sql:string){
          return {
            bind(...values:unknown[]){
              return {
                async first(){
                  if(sql.includes('business_memberships'))return {role:'owner'};
                  if(sql.includes('service_agreements'))return {id:'agreement-1',starts_on:'2026-10-12',ends_on:null,frequency:'daily',interval_days:null,days_of_week:null};
                  if(sql.includes('service_visits'))return {id:'visit-1',status:'completed',actual_minutes:45};
                  throw new Error('Unexpected query: '+sql+' '+JSON.stringify(values));
                },
                async run(){throw new Error('Unexpected write for an existing completed visit');}
              };
            }
          };
        }
      }
    } as unknown as Env;
    const post=(actualMinutes:number)=>new Request('https://api.example.test/v1/visits/complete',{
      method:'POST',
      headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({businessId:'business-1',agreementId:'agreement-1',date:'2026-10-12',actualMinutes})
    });
    const repeated=await completeVisitApi(post(45),env);
    assert.equal(repeated.status,200);
    assert.deepEqual(await repeated.json(),{agreementId:'agreement-1',date:'2026-10-12',status:'completed',actualMinutes:45});
    const different=await completeVisitApi(post(50),env);
    assert.equal(different.status,409);
  }finally{
    globalThis.fetch=originalFetch;
  }
});
