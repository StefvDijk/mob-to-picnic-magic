import { handleAuth, type AuthDependencies, type AuthEnv } from './auth';
import { handleAccounts } from './routes/accounts';
import { handleRecipes } from './routes/recipes';
import { boundedRequest, privateApiResponse } from './http';
import { handlePicnic, type PicnicDependencies } from './routes/picnic';
import type { PicnicKeyEnv } from './security/credentials';
import { runMaintenance } from './jobs/maintenance';

/** Test mail injection is explicitly rejected by the auth module in production. */
export async function handleRequest(request: Request, env: AuthEnv & PicnicKeyEnv, deps: AuthDependencies & PicnicDependencies = {}): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return privateApiResponse(Response.json({ status: "ok", service: "picnic" }));
    }
    const bounded = await boundedRequest(request, url.pathname.startsWith('/api/recipes') ? 256 * 1024 : 8 * 1024);
    if (bounded instanceof Response) return privateApiResponse(bounded);
    const response = await handleAuth(bounded, env, deps)
      ?? await handleAccounts(bounded, env, deps)
      ?? await handleRecipes(bounded, env)
      ?? await handlePicnic(bounded, env, deps)
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
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runMaintenance(env));
  },
};
