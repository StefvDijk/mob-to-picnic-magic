import {
  assertRecentVerification,
  clearAuthCookie,
  hashForAddress,
  requirePrincipal,
  sendInvitationEmail,
  type AuthDependencies,
  type AuthEnv,
  type Principal,
} from '../auth';
import { getSessionAccess, reserveEmailSend, revokeAllSessions, revokeSession, settleEmailSend } from '../db';

const NO_STORE = { 'Cache-Control': 'no-store' };
const DAY = 86_400_000;
const INVITATION_LIFETIME = 7 * DAY;
const AMSTERDAM_MONTH = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit',
});

/** The AI budget rolls over at midnight in the pilot's Europe/Amsterdam timezone. */
export function budgetMonthAmsterdam(now: number): string {
  const parts = AMSTERDAM_MONTH.formatToParts(new Date(now));
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  if (!year || !month) throw new Error('Budget month could not be determined');
  return `${year}-${month}`;
}

function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: NO_STORE });
}

function empty(status = 204): Response {
  return new Response(null, { status, headers: NO_STORE });
}

function requireOrigin(request: Request, env: AuthEnv): Response | null {
  const origin = request.headers.get('Origin');
  if (origin !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED', 'Dit verzoek is niet toegestaan.');
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json' &&
      request.method !== 'DELETE') {
    return fail(400, 'INVALID_CONTENT_TYPE', 'Verstuur geldige JSON.');
  }
  return null;
}

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function requireAccount(request: Request, env: AuthEnv): Promise<Principal | Response> {
  const principal = await requirePrincipal(request, env);
  return principal ?? fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
}

function requireAdmin(principal: Principal, recent = false): Response | null {
  if (principal.role !== 'admin') return fail(403, 'FORBIDDEN', 'Geen toegang.');
  if (recent && !assertRecentVerification(principal)) {
    return fail(403, 'VERIFICATION_REQUIRED', 'Bevestig je e-mailadres opnieuw.');
  }
  return null;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function me(request: Request, env: AuthEnv, principal: Principal): Promise<Response> {
  const now = Date.now();
  const access = await getSessionAccess(env.DB, principal.ownerId, principal.sessionId, now);
  if (!access.success) return fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
  const month = budgetMonthAmsterdam(now);
  const [connection, userBudget, appBudget] = await Promise.all([
    env.DB.prepare(`SELECT status FROM connections WHERE owner_id=? ORDER BY updated_at DESC LIMIT 1`)
      .bind(principal.ownerId).first<{ status: string }>(),
    env.DB.prepare(`SELECT cap_cents AS capCents,spent_cents AS spentCents,reserved_cents AS reservedCents
      FROM user_budget_months WHERE owner_id=? AND month=?`).bind(principal.ownerId, month).first(),
    env.DB.prepare(`SELECT cap_cents AS capCents,spent_cents AS spentCents,reserved_cents AS reservedCents
      FROM app_budget_months WHERE month=?`).bind(month).first(),
  ]);
  return json({
    account: { id: principal.ownerId, email: principal.email, role: principal.role, status: 'active' },
    session: { authenticatedAt: access.value.authenticatedAt, lastActivityAt: access.value.lastActivityAt,
      expiresAt: Math.min(access.value.authenticatedAt + 30 * DAY, access.value.lastActivityAt + 14 * DAY, access.value.sessionExpiresAt),
      recentlyVerified: assertRecentVerification(principal) },
    picnic: { status: connection?.status ?? 'disconnected' },
    budgets: { month, user: userBudget ?? { capCents: 500, spentCents: 0, reservedCents: 0 },
      app: appBudget ?? { capCents: 1500, spentCents: 0, reservedCents: 0 } },
    environment: env.APP_ENV,
  });
}

async function logout(request: Request, env: AuthEnv, principal: Principal, all: boolean): Promise<Response> {
  const now = Date.now();
  if (all) await revokeAllSessions(env.DB, principal.ownerId, now);
  else await revokeSession(env.DB, principal.ownerId, principal.sessionId, now);
  return clearAuthCookie(request, env);
}

async function overview(env: AuthEnv): Promise<Response> {
  const now = Date.now();
  const month = budgetMonthAmsterdam(now);
  const utcDay = new Date(now).toISOString().slice(0, 10);
  const utcMonth = utcDay.slice(0, 7);
  const [accounts, invitations, spend, emails, switches] = await Promise.all([
    env.DB.prepare(`SELECT id,email,role,status,created_at AS createdAt,updated_at AS updatedAt
      FROM app_accounts ORDER BY created_at LIMIT 20`).all(),
    env.DB.prepare(`SELECT id,email,status,created_at AS createdAt,expires_at AS expiresAt
      FROM invitations ORDER BY created_at DESC LIMIT 30`).all(),
    env.DB.prepare(`SELECT cap_cents AS capCents,spent_cents AS spentCents,reserved_cents AS reservedCents
      FROM app_budget_months WHERE month=?`).bind(month).first(),
    env.DB.prepare(`SELECT period,cap_count AS capCount,sent_count AS sentCount,reserved_count AS reservedCount
      FROM email_send_usage WHERE period IN (?,?)`).bind(utcDay, utcMonth).all(),
    env.DB.prepare(`SELECT ai_enabled AS aiEnabled,add_enabled AS addEnabled FROM app_switches WHERE singleton=1`)
      .first<{ aiEnabled: number; addEnabled: number }>(),
  ]);
  return json({ accounts: accounts.results, invitations: invitations.results,
    switches: { aiEnabled: switches?.aiEnabled === 1, addEnabled: switches?.addEnabled === 1 },
    usage: { month, ai: spend ?? { capCents: 1500, spentCents: 0, reservedCents: 0 }, email: emails.results },
    errors: [] });
}

async function invite(request: Request, env: AuthEnv, principal: Principal, deps: AuthDependencies): Promise<Response> {
  const body = await bodyObject(request);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(400, 'INVALID_EMAIL', 'Vul een geldig e-mailadres in.');
  }
  const now = Date.now();
  const nativeNow = new Date(now).toISOString();
  const id = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const token = randomToken();
  const addressHash = await hashForAddress(env, email);
  const sendId = crypto.randomUUID();
  const day = new Date(now).toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  try {
    await reserveEmailSend(env.DB, { id: sendId, ownerId: principal.ownerId, addressHash,
      day, month, createdAt: now });
  } catch (error) {
    if (String(error).includes('quota')) return fail(429, 'EMAIL_QUOTA', 'De verzendlimiet is bereikt.');
    throw error;
  }
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt)
        VALUES(?,?,?,0,?,?)`).bind(userId, email, email, nativeNow, nativeNow),
      env.DB.prepare(`INSERT INTO invitations(id,email,token_hash,status,invited_by,created_at,expires_at)
        VALUES(?,?,?,'pending',?,?,?)`).bind(id, email, await sha256(token), principal.ownerId, now, now + INVITATION_LIFETIME),
      env.DB.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at)
        VALUES(?,?,'member','invited',?,?,?)`).bind(userId, email, id, now, now),
    ]);
  } catch (error) {
    await settleEmailSend(env.DB, sendId, 'failed', Date.now());
    const message = String(error);
    if (message.includes('pilot_capacity_reached')) return fail(409, 'PILOT_FULL', 'De pilot heeft geen vrije plek.');
    if (message.includes('UNIQUE')) return fail(409, 'ALREADY_INVITED', 'Dit adres heeft al toegang of een uitnodiging.');
    throw error;
  }
  try {
    await sendInvitationEmail(env, email, token, principal.ownerId, deps);
    await settleEmailSend(env.DB, sendId, 'sent', Date.now());
  } catch {
    await settleEmailSend(env.DB, sendId, 'unknown', Date.now());
    return fail(503, 'EMAIL_UNAVAILABLE', 'De uitnodiging is vastgelegd, maar bezorging kon niet worden bevestigd.');
  }
  return json({ invitation: { id, email, status: 'pending', expiresAt: now + INVITATION_LIFETIME } }, 201);
}

async function revokeInvite(env: AuthEnv, invitationId: string): Promise<Response> {
  const invitation = await env.DB.prepare(`SELECT status FROM invitations WHERE id=?`).bind(invitationId)
    .first<{ status: string }>();
  if (!invitation) return fail(404, 'NOT_FOUND', 'Niet gevonden.');
  if (invitation.status !== 'pending') return fail(409, 'INVITATION_USED', 'Deze uitnodiging is niet meer open.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE invitations SET status='revoked' WHERE id=? AND status='pending'`).bind(invitationId),
    env.DB.prepare(`DELETE FROM user WHERE id IN (SELECT id FROM app_accounts WHERE invitation_id=? AND status='invited')`)
      .bind(invitationId),
  ]);
  return empty();
}

async function changeAccount(request: Request, env: AuthEnv, principal: Principal, targetId: string): Promise<Response> {
  const body = await bodyObject(request);
  const status = body?.status;
  if (status !== 'active' && status !== 'blocked') return fail(400, 'INVALID_STATUS', 'Ongeldige accountstatus.');
  if (targetId === principal.ownerId) return fail(409, 'SELF_CHANGE', 'Je kunt je eigen toegang niet blokkeren.');
  const target = await env.DB.prepare(`SELECT status,role FROM app_accounts WHERE id=?`).bind(targetId)
    .first<{ status: string; role: string }>();
  if (!target) return fail(404, 'NOT_FOUND', 'Niet gevonden.');
  if (target.status === 'deleting' || target.status === 'invited') return fail(409, 'INVALID_STATE', 'Dit account kan niet worden gewijzigd.');
  if (target.role === 'admin') return fail(403, 'ADMIN_PROTECTED', 'Beheerderstoegang kan hier niet worden gewijzigd.');
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE app_accounts SET status=?,updated_at=? WHERE id=? AND role='member' AND status IN ('active','blocked')`)
      .bind(status, now, targetId),
    ...(status === 'blocked' ? [env.DB.prepare(`UPDATE session_metadata SET revoked_at=COALESCE(revoked_at,?)
      WHERE owner_id=? AND revoked_at IS NULL`).bind(now, targetId)] : []),
  ]);
  return json({ account: { id: targetId, status } });
}

async function changeSwitches(request: Request, env: AuthEnv, principal: Principal): Promise<Response> {
  const body = await bodyObject(request);
  const aiEnabled = body?.aiEnabled;
  const addEnabled = body?.addEnabled;
  if ((aiEnabled === undefined && addEnabled === undefined) ||
      (aiEnabled !== undefined && typeof aiEnabled !== 'boolean') ||
      (addEnabled !== undefined && typeof addEnabled !== 'boolean')) {
    return fail(400, 'INVALID_SWITCH', 'Ongeldige schakelaar.');
  }
  const changed = await env.DB.prepare(`UPDATE app_switches SET
      ai_enabled=COALESCE(?,ai_enabled),add_enabled=COALESCE(?,add_enabled),
      updated_at=?,updated_by=? WHERE singleton=1
      RETURNING ai_enabled AS aiEnabled,add_enabled AS addEnabled`)
    .bind(aiEnabled === undefined ? null : Number(aiEnabled),
      addEnabled === undefined ? null : Number(addEnabled), Date.now(), principal.ownerId)
    .first<{ aiEnabled: number; addEnabled: number }>();
  if (!changed) return fail(503, 'SWITCH_UNAVAILABLE', 'De schakelaars zijn tijdelijk niet beschikbaar.');
  return json({ aiEnabled: !!changed.aiEnabled, addEnabled: !!changed.addEnabled });
}

async function deleteAccount(request: Request, env: AuthEnv, principal: Principal): Promise<Response> {
  if (!assertRecentVerification(principal)) return fail(403, 'VERIFICATION_REQUIRED', 'Bevestig je e-mailadres opnieuw.');
  const body = await bodyObject(request);
  if (body?.confirm !== 'VERWIJDER ACCOUNT') return fail(400, 'CONFIRMATION_REQUIRED', 'Bevestig de verwijdering.');
  const now = Date.now();
  const taskId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`UPDATE app_accounts SET status='deleting',updated_at=? WHERE id=? AND status='active'`)
      .bind(now, principal.ownerId),
    env.DB.prepare(`UPDATE session_metadata SET revoked_at=COALESCE(revoked_at,?) WHERE owner_id=? AND revoked_at IS NULL`)
      .bind(now, principal.ownerId),
    env.DB.prepare(`UPDATE connections SET status='disconnected',encrypted_resume_key=NULL,key_version=NULL,
      generation=generation+1,updated_at=? WHERE owner_id=? AND status IN ('connected','verification_required','invalid')`)
      .bind(now, principal.ownerId),
    env.DB.prepare(`INSERT INTO deletion_tasks(id,owner_id,status,object_keys_json,requested_at,delete_after)
      SELECT ?,?,'queued',COALESCE((SELECT json_group_array(object_key) FROM uploads WHERE owner_id=? AND status!='deleted'),'[]'),?,?`)
      .bind(taskId, principal.ownerId, principal.ownerId, now, now + DAY),
  ]);
  const response = await clearAuthCookie(request, env);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify({ deletion: { id: taskId, status: 'queued' } }), {
    status: 202, headers,
  });
}

/** Returns null for routes owned by another module. */
export async function handleAccounts(request: Request, env: AuthEnv, deps: AuthDependencies = {}): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const known = path === '/api/me' || path === '/api/logout' || path === '/api/logout-all' ||
    path === '/api/account' || path === '/api/admin/overview' || path === '/api/admin/invitations' ||
    path === '/api/admin/switches' || /^\/api\/admin\/invitations\/[^/]+$/.test(path) ||
    /^\/api\/admin\/accounts\/[^/]+$/.test(path);
  if (!known) return null;
  if (request.method !== 'GET') {
    const denied = requireOrigin(request, env);
    if (denied) return denied;
  }
  const account = await requireAccount(request, env);
  if (account instanceof Response) return account;
  if (path === '/api/me' && request.method === 'GET') return me(request, env, account);
  if (path === '/api/logout' && request.method === 'POST') return logout(request, env, account, false);
  if (path === '/api/logout-all' && request.method === 'POST') return logout(request, env, account, true);
  if (path === '/api/account' && request.method === 'DELETE') return deleteAccount(request, env, account);
  if (path.startsWith('/api/admin/')) {
    const forbidden = requireAdmin(account, request.method !== 'GET');
    if (forbidden) return forbidden;
    if (path === '/api/admin/overview' && request.method === 'GET') return overview(env);
    if (path === '/api/admin/invitations' && request.method === 'POST') return invite(request, env, account, deps);
    if (path === '/api/admin/switches' && request.method === 'PATCH') return changeSwitches(request, env, account);
    const inviteId = path.match(/^\/api\/admin\/invitations\/([^/]+)$/)?.[1];
    if (inviteId && request.method === 'DELETE') return revokeInvite(env, inviteId);
    const targetId = path.match(/^\/api\/admin\/accounts\/([^/]+)$/)?.[1];
    if (targetId && request.method === 'PATCH') return changeAccount(request, env, account, targetId);
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
}
