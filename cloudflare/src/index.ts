type Env = { DB: D1Database };

function json(data: unknown, status=200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options':'nosniff' }
  });
}

// Intentionally no customer endpoints until verified authentication/authorization is implemented.
// This worker must never expose raw D1 SQL, private customer data or administrative actions.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      try {
        await env.DB.prepare('SELECT 1 AS ok').first();
        return json({service:'greencollar-api',status:'ok',database:'connected'});
      } catch {
        return json({service:'greencollar-api',status:'unavailable'},503);
      }
    }
    return json({error:'not_found'},404);
  }
};
