import { maintainCatalog } from './catalog/maintenance';
import { handleCatalog } from './routes/catalog';
import { handleShopping } from './routes/shopping';
import { handleAuth, type AuthDependencies, type AuthEnv } from './auth';
import { handleAccounts } from './routes/accounts';
import { handleRecipes } from './routes/recipes';
import { boundedRequest, privateApiResponse } from './http';
import { handlePicnic, type PicnicDependencies } from './routes/picnic';
import type { PicnicKeyEnv } from './security/credentials';
import { runMaintenance } from './jobs/maintenance';
import { handleImports } from './routes/imports';
import { dispatchImportOutbox } from './imports/outbox';
import { handleQueue } from './queue';
import { handleProposals } from './routes/proposals';
import { handleActions } from './routes/actions';
import { dispatchAdditionOutbox } from './additions/outbox';
import { dispatchAiAttempts } from './imports/ai';
import { handleUploads, type UploadEnv } from './routes/uploads';

/** Test mail injection is explicitly rejected by the auth module in production. */
export async function handleRequest(request: Request, env: AuthEnv & PicnicKeyEnv & { UPLOADS?: R2Bucket }, deps: AuthDependencies & PicnicDependencies = {}): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return privateApiResponse(Response.json({ status: "ok", service: "picnic" }));
    }
    const uploadBody = url.pathname === '/api/uploads' && request.method === 'POST';
    const largeBody = url.pathname.startsWith('/api/recipes') || url.pathname === '/api/imports' || url.pathname.startsWith('/api/shopping/');
    const bounded = await boundedRequest(request, uploadBody ? 8 * 1024 * 1024 : largeBody ? 256 * 1024 : 8 * 1024);
    if (bounded instanceof Response) return privateApiResponse(bounded);
    const response = await handleAuth(bounded, env, deps)
      ?? await handleAccounts(bounded, env, deps)
      ?? await handleRecipes(bounded, env)
      ?? await handlePicnic(bounded, env, deps)
      ?? await handleCatalog(bounded, env, deps)
      ?? await handleShopping(bounded, env, deps)
      ?? await handleProposals(bounded, env, deps)
      ?? await handleActions(bounded, env)
      ?? (env.UPLOADS ? await handleUploads(bounded, env as UploadEnv) : null)
      ?? await handleImports(bounded, env)
      ?? Response.json({ error: { code: 'NOT_FOUND', message: 'Niet gevonden.' } }, { status: 404 });
    return privateApiResponse(response);
  } catch {
    // Never expose provider messages, submitted credentials, or SQL in responses.
    return privateApiResponse(Response.json({ error: {
      code: 'SERVICE_UNAVAILABLE', message: 'Dit lukt nu niet. Probeer het later opnieuw.',
    } }, { status: 503 }));
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await handleRequest(request, env);
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/imports' && response.status === 202) {
      // The outbox was committed before the response; cron also recovers a failed immediate dispatch.
      ctx.waitUntil(dispatchImportOutbox(env));
    }
    if (request.method === 'POST' && /\/api\/proposals\/[^/]+\/approve$/.test(new URL(request.url).pathname) && response.ok) {
      ctx.waitUntil(dispatchAdditionOutbox(env));
    }
    return response;
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(Promise.all([runMaintenance(env), dispatchImportOutbox(env), dispatchAdditionOutbox(env),
      dispatchAiAttempts(env), maintainCatalog(env)]));
  },
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    return handleQueue(batch, env);
  },
};
