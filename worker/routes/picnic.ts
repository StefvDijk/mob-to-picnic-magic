import { assertRecentVerification, requirePrincipal, type AuthEnv, type Principal } from '../auth';
import { decryptCredential, encryptCredential, type PicnicKeyEnv } from '../security/credentials';
import { formatRational } from '../../shared/quantities';
import { sessionExpiryMillisSql } from '../db';
import { createAbortablePicnicProvider, PicnicTransportUncertainError, type PicnicProvider } from '../adapters/picnic';
import type { PicnicCart, PicnicConnectionDto } from '../../shared/picnic';

const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };
const PENDING_LIFETIME = 10 * 60_000;
const ATTEMPT_WINDOW = 15 * 60_000;
const SESSION_EXPIRY_SQL = `(${sessionExpiryMillisSql})`;
function activeSessionSql(ownerColumn: string): string {
  return `EXISTS(SELECT 1 FROM app_accounts a
    JOIN session_metadata sm ON sm.owner_id=a.id AND sm.session_id=? AND sm.revoked_at IS NULL
    JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id
    WHERE a.id=${ownerColumn} AND a.status='active' AND ${SESSION_EXPIRY_SQL}>?
      AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?)`;
}

type PicnicEnv = AuthEnv & PicnicKeyEnv;
export interface PicnicDependencies { provider?: PicnicProvider }

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: NO_STORE });
}
function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}
function empty(status = 204): Response { return new Response(null, { status, headers: NO_STORE }); }
function noContentType(request: Request): boolean { return request.method === 'DELETE'; }
function checkOrigin(request: Request, env: PicnicEnv): Response | null {
  if (request.headers.get('Origin') !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED', 'Dit verzoek is niet toegestaan.');
  if (!noContentType(request) && request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return fail(400, 'INVALID_CONTENT_TYPE', 'Verstuur geldige JSON.');
  }
  return null;
}
async function body(request: Request): Promise<Record<string, unknown> | null> {
  try { const value: unknown = await request.json(); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}
async function principalFor(request: Request, env: PicnicEnv): Promise<Principal | Response> {
  const principal = await requirePrincipal(request, env);
  return principal ?? fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
}
function provider(deps: PicnicDependencies): PicnicProvider { return deps.provider ?? createAbortablePicnicProvider(); }
function statusDto(status: string): PicnicConnectionDto { return { status: status as PicnicConnectionDto['status'] }; }

async function reserveAttempt(env: PicnicEnv, principal: Principal, now: number): Promise<{ attemptId: string; connectionId: string; expectedGeneration: number } | Response> {
  const attemptId = crypto.randomUUID();
  const connectionId = crypto.randomUUID();
  await env.DB.prepare(`DELETE FROM picnic_pending_verifications WHERE owner_id=? AND expires_at<=?`).bind(principal.ownerId, now).run();
  // A single INSERT ... SELECT serializes per owner and snapshots the authenticated session.
  const result = await env.DB.prepare(`
    INSERT INTO picnic_connect_limits(owner_id,window_started_at,attempt_count)
    VALUES(?,?,1)
    ON CONFLICT(owner_id) DO UPDATE SET
      window_started_at=CASE WHEN picnic_connect_limits.window_started_at+?<=? THEN excluded.window_started_at ELSE picnic_connect_limits.window_started_at END,
      attempt_count=CASE WHEN picnic_connect_limits.window_started_at+?<=? THEN 1 ELSE picnic_connect_limits.attempt_count+1 END
    WHERE picnic_connect_limits.window_started_at+?<=? OR picnic_connect_limits.attempt_count<5
  `).bind(principal.ownerId, now, ATTEMPT_WINDOW, now, ATTEMPT_WINDOW, now, ATTEMPT_WINDOW, now).run();
  if (result.meta.changes !== 1) return fail(429, 'PICNIC_ATTEMPTS', 'Te veel koppelverzoeken. Probeer het later opnieuw.');
  const reservation = await env.DB.prepare(`
    INSERT INTO picnic_pending_verifications(owner_id,attempt_id,connection_id,expected_generation,starting_session_id,state,created_at,expires_at)
    SELECT ?,?,?,0,?,'authenticating',?,?
    FROM app_accounts a JOIN session_metadata sm ON sm.owner_id=a.id AND sm.session_id=?
      JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id
    WHERE a.id=? AND a.status='active' AND sm.revoked_at IS NULL
      AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>? AND ${SESSION_EXPIRY_SQL} > ?
      AND NOT EXISTS (SELECT 1 FROM picnic_pending_verifications p WHERE p.owner_id=a.id AND p.expires_at>?)
    LIMIT 1
  `).bind(principal.ownerId, attemptId, connectionId, principal.sessionId, now, now + PENDING_LIFETIME,
    principal.sessionId, principal.ownerId, now, now, now, now).run();
  if (reservation.meta.changes !== 1) return fail(409, 'PICNIC_CONNECT_BUSY', 'Er loopt al een koppelverzoek.');
  const existing = await env.DB.prepare(`SELECT id,generation,status FROM connections WHERE owner_id=? ORDER BY updated_at DESC LIMIT 1`)
    .bind(principal.ownerId).first<{ id: string; generation: number; status: string }>();
  if (existing) {
    if (existing.status === 'connected' && !assertRecentVerification(principal, now)) {
      await env.DB.prepare(`DELETE FROM picnic_pending_verifications WHERE owner_id=? AND attempt_id=?`).bind(principal.ownerId, attemptId).run();
      return fail(403, 'VERIFICATION_REQUIRED', 'Bevestig je e-mailadres opnieuw voordat je een koppeling vervangt.');
    }
    // Correct the reserved connection id/snapshot to reuse the stable connection identity.
    const changed = await env.DB.prepare(`UPDATE picnic_pending_verifications SET connection_id=?,expected_generation=? WHERE owner_id=? AND attempt_id=?`)
      .bind(existing.id, existing.generation, principal.ownerId, attemptId).run();
    if (changed.meta.changes !== 1) return fail(409, 'PICNIC_CONNECT_BUSY', 'Er loopt al een koppelverzoek.');
    if (existing.status !== 'connected') {
      const statusChange = await env.DB.prepare(`UPDATE connections SET status='verification_required',updated_at=? WHERE owner_id=? AND id=? AND generation=? AND status IN ('disconnected','invalid','verification_required')
        AND EXISTS(SELECT 1 FROM picnic_pending_verifications p JOIN app_accounts a ON a.id=p.owner_id AND a.status='active'
          JOIN session_metadata sm ON sm.owner_id=p.owner_id AND sm.session_id=p.starting_session_id AND sm.revoked_at IS NULL
          JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id AND (${SESSION_EXPIRY_SQL})>?
          WHERE p.owner_id=? AND p.attempt_id=? AND p.connection_id=? AND p.expected_generation=? AND p.expires_at>?
            AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?)`)
        .bind(now, principal.ownerId, existing.id, existing.generation, now, principal.ownerId, attemptId, existing.id,
          existing.generation, now, now, now).run();
      if (statusChange.meta.changes !== 1) {
        await env.DB.prepare(`DELETE FROM picnic_pending_verifications WHERE owner_id=? AND attempt_id=?`).bind(principal.ownerId, attemptId).run();
        return fail(409, 'PICNIC_CONNECT_STALE', 'De koppeling is verlopen. Probeer opnieuw.');
      }
    }
    return { attemptId, connectionId: existing.id, expectedGeneration: existing.generation };
  }
  const created = await env.DB.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
      SELECT ?,?,'verification_required',1,NULL,NULL,?,? WHERE EXISTS(SELECT 1 FROM picnic_pending_verifications p
        JOIN app_accounts a ON a.id=p.owner_id AND a.status='active'
        JOIN session_metadata sm ON sm.owner_id=p.owner_id AND sm.session_id=p.starting_session_id AND sm.revoked_at IS NULL
        JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id AND (${SESSION_EXPIRY_SQL})>?
        WHERE p.owner_id=? AND p.attempt_id=? AND p.connection_id=? AND p.expected_generation=0 AND p.expires_at>?
          AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?)`)
    .bind(connectionId, principal.ownerId, now, now, now, principal.ownerId, attemptId, connectionId, now, now, now).run();
  if (created.meta.changes !== 1) {
    await env.DB.prepare(`DELETE FROM picnic_pending_verifications WHERE owner_id=? AND attempt_id=?`).bind(principal.ownerId, attemptId).run();
    return fail(409, 'PICNIC_CONNECT_BUSY', 'Er loopt al een koppelverzoek.');
  }
  return { attemptId, connectionId, expectedGeneration: 0 };
}

async function clearFailedAttempt(env: PicnicEnv, ownerId: string, attemptId: string, connectionId: string, expectedGeneration: number, now: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM picnic_pending_verifications WHERE owner_id=? AND attempt_id=?`).bind(ownerId, attemptId),
    env.DB.prepare(`UPDATE connections SET status='disconnected',encrypted_resume_key=NULL,key_version=NULL,external_identity=NULL,updated_at=?
      WHERE owner_id=? AND id=? AND generation=? AND status='verification_required'
      AND NOT EXISTS(SELECT 1 FROM picnic_pending_verifications WHERE owner_id=?)`)
      .bind(now, ownerId, connectionId, expectedGeneration || 1, ownerId),
  ]);
}

async function persistenceStillAllowed(env: PicnicEnv, principal: Principal, attemptId: string, connectionId: string, expectedGeneration: number, now: number): Promise<boolean> {
  const pending = await env.DB.prepare(`SELECT 1 FROM picnic_pending_verifications p
    JOIN app_accounts a ON a.id=p.owner_id AND a.status='active'
    JOIN session_metadata sm ON sm.owner_id=p.owner_id AND sm.session_id=p.starting_session_id AND sm.revoked_at IS NULL
    JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id AND ${SESSION_EXPIRY_SQL} > ?
    JOIN connections c ON c.owner_id=p.owner_id AND c.id=p.connection_id AND c.generation=CASE WHEN p.expected_generation=0 THEN 1 ELSE p.expected_generation END
    WHERE p.owner_id=? AND p.attempt_id=? AND p.connection_id=? AND p.expected_generation=?
      AND p.expires_at>? AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?
      AND (c.status<>'connected' OR sm.last_verified_at BETWEEN ? AND ?)`)
    .bind(now, principal.ownerId, attemptId, connectionId, expectedGeneration, now, now, now, now - 600_000, now)
    .first<{ 1: number }>();
  return !!pending;
}

async function persistConnection(env: PicnicEnv, principal: Principal, attemptId: string, connectionId: string,
  expectedGeneration: number, authKey: string, externalIdentity: string | null, now: number): Promise<boolean> {
  const encrypted = await encryptCredential(env, principal.ownerId, connectionId, 'resume', authKey);
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE connections SET status='connected',generation=?,encrypted_resume_key=?,key_version=?,
      external_identity=?,updated_at=? WHERE owner_id=? AND id=? AND generation=?
      AND EXISTS(SELECT 1 FROM picnic_pending_verifications p JOIN app_accounts a ON a.id=p.owner_id AND a.status='active'
        JOIN session_metadata sm ON sm.owner_id=p.owner_id AND sm.session_id=p.starting_session_id AND sm.revoked_at IS NULL
        JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id AND ${SESSION_EXPIRY_SQL} > ?
        WHERE p.owner_id=? AND p.attempt_id=? AND p.connection_id=? AND p.expected_generation=? AND p.expires_at>?
          AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?
          AND (connections.status<>'connected' OR sm.last_verified_at BETWEEN ? AND ?))`)
      .bind(expectedGeneration + 1, encrypted.ciphertext, encrypted.keyVersion, externalIdentity, now,
        principal.ownerId, connectionId, expectedGeneration || 1, now, principal.ownerId, attemptId, connectionId,
        expectedGeneration, now, now, now, now - 600_000, now),
    env.DB.prepare(`UPDATE proposals SET status='stale',version=version+1,updated_at=?
      WHERE owner_id=? AND connection_id=? AND connection_generation=? AND status IN ('draft','ready','approved')
        AND EXISTS(SELECT 1 FROM connections WHERE owner_id=? AND id=? AND generation=? AND status='connected')`)
      .bind(now, principal.ownerId, connectionId, expectedGeneration || 1, principal.ownerId, connectionId, expectedGeneration + 1),
    env.DB.prepare(`UPDATE approvals SET invalidated_at=COALESCE(invalidated_at,?) WHERE owner_id=? AND invalidated_at IS NULL
      AND proposal_id IN (SELECT id FROM proposals WHERE owner_id=? AND connection_id=? AND status='stale')
      AND EXISTS(SELECT 1 FROM connections WHERE owner_id=? AND id=? AND generation=? AND status='connected')`)
      .bind(now, principal.ownerId, principal.ownerId, connectionId, principal.ownerId, connectionId, expectedGeneration + 1),
    env.DB.prepare(`UPDATE basket_allocations SET status='stale' WHERE owner_id=? AND status='active'
      AND proposal_id IN (SELECT id FROM proposals WHERE owner_id=? AND connection_id=? AND status='stale')
      AND EXISTS(SELECT 1 FROM connections WHERE owner_id=? AND id=? AND generation=? AND status='connected')`)
      .bind(principal.ownerId, principal.ownerId, connectionId, principal.ownerId, connectionId, expectedGeneration + 1),
    env.DB.prepare(`DELETE FROM picnic_pending_verifications WHERE owner_id=? AND attempt_id=? AND EXISTS(
      SELECT 1 FROM connections WHERE owner_id=? AND id=? AND generation=? AND status='connected')`)
      .bind(principal.ownerId, attemptId, principal.ownerId, connectionId, expectedGeneration + 1),
  ]);
  return results[0].meta.changes === 1;
}

async function connect(request: Request, env: PicnicEnv, principal: Principal, deps: PicnicDependencies): Promise<Response> {
  const data = await body(request);
  const username = typeof data?.username === 'string' ? data.username.trim() : '';
  const password = typeof data?.password === 'string' ? data.password : '';
  if (!username || username.length > 254 || /[\r\n\0]/.test(username) || !password || password.length > 1024) {
    return fail(400, 'INVALID_CREDENTIALS', 'Controleer je Picnic-inloggegevens.');
  }
  const current = await env.DB.prepare(`SELECT id,status,generation FROM connections WHERE owner_id=? ORDER BY updated_at DESC LIMIT 1`)
    .bind(principal.ownerId).first<{ id: string; status: string; generation: number }>();
  if (current?.status === 'connected' && !assertRecentVerification(principal)) {
    return fail(403, 'VERIFICATION_REQUIRED', 'Bevestig je e-mailadres opnieuw voordat je een koppeling vervangt.');
  }
  const reserved = await reserveAttempt(env, principal, Date.now());
  if (reserved instanceof Response) return reserved;
  const api = provider(deps);
  if (!(await persistenceStillAllowed(env, principal, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration, Date.now()))) {
    await clearFailedAttempt(env, principal.ownerId, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration, Date.now());
    return fail(409, 'PICNIC_CONNECT_STALE', 'De koppeling is verlopen. Probeer opnieuw.');
  }
  try {
    const result = await api.login(username, password);
    if (result.requiresSms) {
      const encrypted = await encryptCredential(env, principal.ownerId, reserved.connectionId, 'pending-sms', result.authKey);
      const claim = await env.DB.prepare(`UPDATE picnic_pending_verifications SET state='verification_required',encrypted_auth_key=?,key_version=?,external_identity=?
        WHERE owner_id=? AND attempt_id=? AND state='authenticating' AND expires_at>?
        AND EXISTS(SELECT 1 FROM app_accounts a JOIN session_metadata sm ON sm.owner_id=a.id AND sm.session_id=? AND sm.revoked_at IS NULL
          JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id
          WHERE a.id=picnic_pending_verifications.owner_id AND a.status='active' AND ${SESSION_EXPIRY_SQL}>?
          AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?)`)
        .bind(encrypted.ciphertext, encrypted.keyVersion, result.externalIdentity.slice(0, 255), principal.ownerId, reserved.attemptId,
          Date.now(), principal.sessionId, Date.now(), Date.now(), Date.now()).run();
      if (claim.meta.changes !== 1 || !(await persistenceStillAllowed(env, principal, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration, Date.now()))) {
        await clearFailedAttempt(env, principal.ownerId, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration, Date.now());
        return fail(409, 'PICNIC_CONNECT_STALE', 'De koppeling is verlopen. Probeer opnieuw.');
      }
      let deliveryUncertain = false;
      try { await api.requestSms(result.authKey); }
      catch (error) {
        if (!(error instanceof PicnicTransportUncertainError)) throw error;
        deliveryUncertain = true;
      }
      if (!(await persistenceStillAllowed(env, principal, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration, Date.now()))) {
        await clearFailedAttempt(env, principal.ownerId, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration, Date.now());
        return fail(409, 'PICNIC_CONNECT_STALE', 'De koppeling is verlopen. Probeer opnieuw.');
      }
      const remainsConnected = current?.status === 'connected';
      return json({ connection: statusDto(remainsConnected ? 'connected' : 'verification_required'), verificationRequired: true,
        ...(deliveryUncertain ? { deliveryUncertain: true } : {}) }, 202);
    }
    if (!(await persistenceStillAllowed(env, principal, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration, Date.now())) ||
        !(await persistConnection(env, principal, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration,
          result.authKey, result.externalIdentity.slice(0, 255), Date.now()))) {
      await clearFailedAttempt(env, principal.ownerId, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration, Date.now());
      return fail(409, 'PICNIC_CONNECT_STALE', 'De koppeling is verlopen. Probeer opnieuw.');
    }
    return json({ connection: statusDto('connected') });
  } catch {
    await clearFailedAttempt(env, principal.ownerId, reserved.attemptId, reserved.connectionId, reserved.expectedGeneration, Date.now());
    return fail(503, 'PICNIC_UNAVAILABLE', 'Picnic is tijdelijk niet bereikbaar. Probeer het later opnieuw.');
  }
}

async function verify(request: Request, env: PicnicEnv, principal: Principal, deps: PicnicDependencies): Promise<Response> {
  const data = await body(request);
  const code = typeof data?.code === 'string' ? data.code : '';
  if (!/^\d{4,8}$/.test(code)) return fail(400, 'INVALID_CODE', 'Vul de verificatiecode in.');
  const now = Date.now();
  const pending = await env.DB.prepare(`UPDATE picnic_pending_verifications SET state='verifying',attempts=attempts+1
      WHERE owner_id=? AND state='verification_required' AND expires_at>? AND attempts<5
      AND ${activeSessionSql('picnic_pending_verifications.owner_id')}
      RETURNING attempt_id AS attemptId,connection_id AS connectionId,expected_generation AS expectedGeneration,
        encrypted_auth_key AS encryptedAuthKey,key_version AS keyVersion,external_identity AS externalIdentity,attempts`)
    .bind(principal.ownerId, now, principal.sessionId, now, now, now)
    .first<{ attemptId: string; connectionId: string; expectedGeneration: number; encryptedAuthKey: string; keyVersion: string; externalIdentity: string | null; attempts: number }>();
  if (!pending) return fail(409, 'PICNIC_VERIFICATION_EXPIRED', 'Er staat geen geldige Picnic-verificatie open.');
  let authKey: string;
  try {
    authKey = await decryptCredential(env, principal.ownerId, pending.connectionId, 'pending-sms', pending.keyVersion, pending.encryptedAuthKey);
  } catch {
    await clearFailedAttempt(env, principal.ownerId, pending.attemptId, pending.connectionId, pending.expectedGeneration, Date.now());
    return fail(503, 'PICNIC_KEY_UNAVAILABLE', 'De Picnic-verificatie kan tijdelijk niet worden gebruikt.');
  }
  if (!(await persistenceStillAllowed(env, principal, pending.attemptId, pending.connectionId, pending.expectedGeneration, Date.now()))) {
    await clearFailedAttempt(env, principal.ownerId, pending.attemptId, pending.connectionId, pending.expectedGeneration, Date.now());
    return fail(409, 'PICNIC_CONNECT_STALE', 'De koppeling is verlopen. Probeer opnieuw.');
  }
  let verified: { authKey: string };
  try {
    verified = await provider(deps).verifySms(authKey, code);
  } catch (error) {
    if (error instanceof PicnicTransportUncertainError) {
      await clearFailedAttempt(env, principal.ownerId, pending.attemptId, pending.connectionId, pending.expectedGeneration, Date.now());
      return fail(503, 'PICNIC_VERIFY_UNCERTAIN', 'De uitkomst van de Picnic-verificatie is onbekend. Begin de koppeling opnieuw.');
    }
    if (pending.attempts >= 5) await clearFailedAttempt(env, principal.ownerId, pending.attemptId, pending.connectionId, pending.expectedGeneration, Date.now());
    else await env.DB.prepare(`UPDATE picnic_pending_verifications SET state='verification_required' WHERE owner_id=? AND attempt_id=? AND state='verifying'`)
      .bind(principal.ownerId, pending.attemptId).run();
    return fail(400, 'PICNIC_CODE_REJECTED', 'De code is ongeldig of verlopen.');
  }
  if (!(await persistenceStillAllowed(env, principal, pending.attemptId, pending.connectionId, pending.expectedGeneration, Date.now()))) {
    await clearFailedAttempt(env, principal.ownerId, pending.attemptId, pending.connectionId, pending.expectedGeneration, Date.now());
    return fail(409, 'PICNIC_CONNECT_STALE', 'De koppeling is verlopen. Probeer opnieuw.');
  }
  try {
    const persisted = await persistConnection(env, principal, pending.attemptId, pending.connectionId, pending.expectedGeneration,
      verified.authKey, pending.externalIdentity, Date.now());
    if (!persisted) {
      await clearFailedAttempt(env, principal.ownerId, pending.attemptId, pending.connectionId, pending.expectedGeneration, Date.now());
      return fail(409, 'PICNIC_CONNECT_STALE', 'De koppeling is verlopen. Probeer opnieuw.');
    }
  } catch {
    await clearFailedAttempt(env, principal.ownerId, pending.attemptId, pending.connectionId, pending.expectedGeneration, Date.now());
    return fail(503, 'PICNIC_SAVE_FAILED', 'De Picnic-koppeling kon niet worden opgeslagen. Probeer het later opnieuw.');
  }
  return json({ connection: statusDto('connected') });
}

async function disconnect(env: PicnicEnv, principal: Principal): Promise<Response> {
  const now = Date.now();
  const active = () => [principal.sessionId, now, now, now] as const;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM picnic_pending_verifications WHERE owner_id=? AND ${activeSessionSql('picnic_pending_verifications.owner_id')}`)
      .bind(principal.ownerId, ...active()),
    env.DB.prepare(`UPDATE connections SET status='disconnected',encrypted_resume_key=NULL,key_version=NULL,external_identity=NULL,generation=generation+1,updated_at=?
      WHERE owner_id=? AND status IN ('connected','verification_required','invalid') AND ${activeSessionSql('connections.owner_id')}`)
      .bind(now, principal.ownerId, ...active()),
    env.DB.prepare(`UPDATE basket_allocations SET status='stale' WHERE owner_id=? AND status='active'
      AND ${activeSessionSql('basket_allocations.owner_id')}`).bind(principal.ownerId, ...active()),
    env.DB.prepare(`UPDATE proposals SET status='stale',version=version+1,updated_at=? WHERE owner_id=? AND status IN ('draft','ready','approved')
      AND EXISTS(SELECT 1 FROM connections c WHERE c.owner_id=proposals.owner_id AND c.id=proposals.connection_id AND c.status='disconnected')
      AND ${activeSessionSql('proposals.owner_id')}`).bind(now, principal.ownerId, ...active()),
    env.DB.prepare(`UPDATE approvals SET invalidated_at=COALESCE(invalidated_at,?) WHERE owner_id=? AND invalidated_at IS NULL
      AND proposal_id IN (SELECT id FROM proposals WHERE owner_id=? AND status='stale')
      AND ${activeSessionSql('approvals.owner_id')}`).bind(now, principal.ownerId, principal.ownerId, ...active()),
  ]);
  return empty();
}

async function connectedKey(env: PicnicEnv, principal: Principal): Promise<{ id: string; generation: number; key: string } | Response> {
  const row = await env.DB.prepare(`SELECT id,generation,encrypted_resume_key AS encryptedResumeKey,key_version AS keyVersion
    FROM connections WHERE owner_id=? AND status='connected' AND encrypted_resume_key IS NOT NULL LIMIT 1`)
    .bind(principal.ownerId).first<{ id: string; generation: number; encryptedResumeKey: string; keyVersion: string }>();
  if (!row) return fail(409, 'PICNIC_NOT_CONNECTED', 'Koppel eerst je Picnic-account.');
  try { return { id: row.id, generation: row.generation, key: await decryptCredential(env, principal.ownerId, row.id, 'resume', row.keyVersion, row.encryptedResumeKey) }; }
  catch { return fail(503, 'PICNIC_KEY_UNAVAILABLE', 'De Picnic-koppeling kan tijdelijk niet worden gebruikt.'); }
}
async function keyStillCurrent(env: PicnicEnv, principal: Principal, connection: { id: string; generation: number }): Promise<boolean> {
  return !!(await env.DB.prepare(`SELECT 1 FROM connections c JOIN app_accounts a ON a.id=c.owner_id AND a.status='active'
    JOIN session_metadata sm ON sm.owner_id=c.owner_id AND sm.session_id=? AND sm.revoked_at IS NULL
    JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id AND ${SESSION_EXPIRY_SQL} > ?
    WHERE c.owner_id=? AND c.id=? AND c.generation=? AND c.status='connected'
      AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?`)
    .bind(principal.sessionId, Date.now(), principal.ownerId, connection.id, connection.generation, Date.now(), Date.now()).first());
}

async function searchProducts(request: Request, env: PicnicEnv, principal: Principal, deps: PicnicDependencies): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!query || query.length > 100 || /[\0\r\n]/.test(query)) return fail(400, 'INVALID_QUERY', 'Vul een zoekterm van maximaal 100 tekens in.');
  const connection = await connectedKey(env, principal);
  if (connection instanceof Response) return connection;
  try {
    const products = await provider(deps).search(connection.key, query);
    if (!(await keyStillCurrent(env, principal, connection))) return fail(409, 'PICNIC_CONNECTION_CHANGED', 'De Picnic-koppeling is gewijzigd.');
    return json({ products: products.slice(0, 40) });
  } catch { return fail(503, 'PICNIC_UNAVAILABLE', 'Picnic is tijdelijk niet bereikbaar.'); }
}

async function getCart(env: PicnicEnv, principal: Principal, deps: PicnicDependencies): Promise<Response> {
  const connection = await connectedKey(env, principal);
  if (connection instanceof Response) return connection;
  try {
    const lines = await provider(deps).cart(connection.key);
    if (!(await keyStillCurrent(env, principal, connection))) return fail(409, 'PICNIC_CONNECTION_CHANGED', 'De Picnic-koppeling is gewijzigd.');
    const allocations = await env.DB.prepare(`SELECT id,proposal_id AS proposalId,need_id AS needId,product_id AS productId,
      quantity_num AS quantityNum,quantity_den AS quantityDen,unit,quantity_basis AS quantityBasis,status FROM basket_allocations WHERE owner_id=? AND status IN ('active','stale') ORDER BY checked_at DESC LIMIT 100`)
      .bind(principal.ownerId).all<{ id: string; proposalId: string; needId: string; productId: string; quantityNum: number; quantityDen: number; unit: string; quantityBasis: 'net' | 'drained' | null; status: string }>();
    if (!(await keyStillCurrent(env, principal, connection))) return fail(409, 'PICNIC_CONNECTION_CHANGED', 'De Picnic-koppeling is gewijzigd.');
    const cart: PicnicCart = { lines, allocations: allocations.results.map(item => ({ id: item.id, proposalId: item.proposalId,
      needId: item.needId, productId: item.productId, quantity: formatRational({ numerator: item.quantityNum, denominator: item.quantityDen }),
      unit: item.unit, quantityBasis: item.quantityBasis, status: item.status })) };
    return json({ cart });
  } catch { return fail(503, 'PICNIC_UNAVAILABLE', 'Picnic is tijdelijk niet bereikbaar.'); }
}

/** Returns null when the path belongs to another route module. */
export async function handlePicnic(request: Request, env: PicnicEnv, deps: PicnicDependencies = {}): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const known = path === '/api/picnic/connect' || path === '/api/picnic/verify' || path === '/api/picnic/connection' ||
    path === '/api/picnic/cart' || path === '/api/picnic/products';
  if (!known) return null;
  if (request.method !== 'GET') {
    const denied = checkOrigin(request, env);
    if (denied) return denied;
  }
  const principal = await principalFor(request, env);
  if (principal instanceof Response) return principal;
  if (path === '/api/picnic/connect' && request.method === 'POST') return connect(request, env, principal, deps);
  if (path === '/api/picnic/verify' && request.method === 'POST') return verify(request, env, principal, deps);
  if (path === '/api/picnic/connection' && request.method === 'DELETE') return disconnect(env, principal);
  if (path === '/api/picnic/products' && request.method === 'GET') return searchProducts(request, env, principal, deps);
  if (path === '/api/picnic/cart' && request.method === 'GET') return getCart(env, principal, deps);
  return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
}
