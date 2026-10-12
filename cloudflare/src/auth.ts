import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type Env = {
  DB: D1Database;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  OIDC_JWKS_URL?: string;
};

/** Testable cryptographic verification shared by every protected endpoint. */
export async function verifyIdentityToken(token:string, keys:JWTVerifyGetKey, issuer:string, audience:string):Promise<string|null> {
  try {
    const verified=await jwtVerify(token,keys,{issuer,audience,algorithms:['RS256','ES256']});
    return typeof verified.payload.sub==='string' && verified.payload.sub.length>0 ? verified.payload.sub : null;
  } catch { return null; }
}
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function authenticatedSubject(request: Request, env: Env): Promise<string | null> {
  // Unconfigured authentication is a hard stop, not a bypass.
  if (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE || !env.OIDC_JWKS_URL) return null;
  const header = request.headers.get('Authorization') ?? '';
  const token = /^Bearer (.+)$/i.exec(header)?.[1];
  if (!token) return null;
  try {
    const url = new URL(env.OIDC_JWKS_URL);
    if (url.protocol !== 'https:') return null;
    // The issuer/JWKS URL must be configured by the operator, not supplied by clients.
    let jwks = jwksCache.get(url.href);
    if (!jwks) { jwks = createRemoteJWKSet(url); jwksCache.set(url.href,jwks); }
    return await verifyIdentityToken(token,jwks,env.OIDC_ISSUER,env.OIDC_AUDIENCE);
  } catch { return null; }
}
export async function businessAccess(env: Env,subject: string,businessId: string): Promise<'owner'|'admin'|'worker'|null> {
  const row = await env.DB.prepare(
    'SELECT role FROM business_memberships WHERE business_id = ? AND subject = ?'
  ).bind(businessId,subject).first<{role:'owner'|'admin'|'worker'}>();
  return row?.role ?? null;
}
