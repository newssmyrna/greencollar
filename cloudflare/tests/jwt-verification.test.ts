import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import {verifyIdentityToken} from '../src/auth';

test('accepts only valid signed token for matching issuer and audience',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const publicJwk=await exportJWK(publicKey);
  publicJwk.kid='test-key';
  publicJwk.alg='RS256';
  publicJwk.use='sig';
  const keys=createLocalJWKSet({keys:[publicJwk]});
  const sign=(aud:string,issuer='https://clerk.example.test')=>
    new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test-key'})
      .setIssuer(issuer).setAudience(aud).setSubject('user_123')
      .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const valid=await sign('greencollar-api');
  assert.equal(await verifyIdentityToken(valid,keys,'https://clerk.example.test','greencollar-api'),'user_123');
  assert.equal(await verifyIdentityToken(valid,keys,'https://evil.test','greencollar-api'),null);
  assert.equal(await verifyIdentityToken(valid,keys,'https://clerk.example.test','wrong-api'),null);
  const expired=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test-key'})
    .setIssuer('https://clerk.example.test').setAudience('greencollar-api')
    .setSubject('user_123').setIssuedAt(0).setExpirationTime(1).sign(privateKey);
  assert.equal(await verifyIdentityToken(expired,keys,'https://clerk.example.test','greencollar-api'),null);
  const tokenParts=valid.split('.');
  const signature=tokenParts[2];
  tokenParts[2]=(signature[0]==='A'?'B':'A')+signature.slice(1);
  const tampered=tokenParts.join('.');
  assert.equal(await verifyIdentityToken(tampered,keys,'https://clerk.example.test','greencollar-api'),null);
});
