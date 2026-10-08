import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins/email-otp';
import {
  createSessionMetadata,
  getSessionAccess,
  reserveEmailSend,
  settleEmailSend,
  touchSession,
} from '../db';

const HOUR = 60 * 60 * 1000;
const RECENT_VERIFICATION_MS = 10 * 60 * 1000;
const NEUTRAL = { success: true };

export interface AuthEnv {
  DB: D1Database;
  AUTH_SECRET: string;
  OTP_HMAC_SECRET: string;
  EMAIL_ADDRESS_HMAC_SECRET: string;
  APP_ORIGIN: string;
  APP_ENV?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface Principal {
  ownerId: string;
  sessionId: string;
  role: 'admin' | 'member';
  email: string;
  lastVerifiedAt: number | null;
}

export interface AuthDependencies {
  /** Explicit test/development mail capture. Never configure this in production. */
  sendEmail?: (message: { to: string; subject: string; text: string }) => Promise<void>;
}

type AccountRow = { id: string; email: string; role: 'admin' | 'member'; status: string; invitationId: string | null };

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const outputHeaders = new Headers(headers);
  outputHeaders.set('Content-Type', 'application/json; charset=utf-8');
  outputHeaders.set('Cache-Control', 'no-store, private');
  outputHeaders.set('Pragma', 'no-cache');
  return new Response(JSON.stringify(body), { status, headers: outputHeaders });
}

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, private');
  headers.set('Pragma', 'no-cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(secret: string, value: string): Promise<string> {
  if (secret.length < 32) throw new Error('Authentication secret is not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

export async function hashForAddress(env: AuthEnv, email: string): Promise<string> {
  return hmac(env.EMAIL_ADDRESS_HMAC_SECRET, normalizedEmail(email));
}

async function hashOtp(env: AuthEnv, otp: string): Promise<string> {
  return hmac(env.OTP_HMAC_SECRET, otp);
}

function isProduction(env: AuthEnv): boolean {
  return (env.APP_ENV ?? 'production') === 'production';
}

async function deliver(env: AuthEnv, deps: AuthDependencies, message: { to: string; subject: string; text: string }): Promise<void> {
  if (deps.sendEmail) {
    if (isProduction(env)) throw new Error('Mail capture is disabled in production');
    await deps.sendEmail(message);
    return;
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error('Email provider is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

/** The caller owns email quota reservation and settlement for invitations. */
export async function sendInvitationEmail(
  env: AuthEnv,
  email: string,
  token: string,
  _ownerId?: string,
  deps: AuthDependencies = {},
): Promise<void> {
  const url = new URL('/invite', env.APP_ORIGIN);
  url.searchParams.set('token', token);
  await deliver(env, deps, {
    to: normalizedEmail(email),
    subject: 'Je Picnic-uitnodiging',
    text: `Je bent uitgenodigd voor Picnic. Open deze link om verder te gaan: ${url.toString()}`,
  });
}

async function accountForEmail(env: AuthEnv, email: string): Promise<AccountRow | null> {
  return env.DB.prepare(`SELECT id,email,role,status,invitation_id AS invitationId FROM app_accounts WHERE email=? COLLATE NOCASE`)
    .bind(normalizedEmail(email)).first<AccountRow>();
}

async function accountForId(env: AuthEnv, ownerId: string): Promise<AccountRow | null> {
  return env.DB.prepare(`SELECT id,email,role,status,invitation_id AS invitationId FROM app_accounts WHERE id=?`)
    .bind(ownerId).first<AccountRow>();
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

async function reserveFixedWindowRate(env: AuthEnv, key: string, now: number, windowMs: number, max: number): Promise<boolean> {
  const bucketStart = Math.floor(now / windowMs) * windowMs;
  // One statement makes the counter safe under concurrent requests for the same address or IP.
  const changed = await env.DB.prepare(`INSERT INTO rateLimit(id,key,count,lastRequest) VALUES(?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN rateLimit.lastRequest=excluded.lastRequest THEN rateLimit.count+1 ELSE 1 END,
      lastRequest=excluded.lastRequest
    WHERE rateLimit.lastRequest!=excluded.lastRequest OR rateLimit.count<?`)
    .bind(crypto.randomUUID(), key, bucketStart, max).run();
  return changed.meta.changes === 1;
}

async function reserveAddressCooldown(env: AuthEnv, key: string, now: number): Promise<boolean> {
  const changed = await env.DB.prepare(`INSERT INTO rateLimit(id,key,count,lastRequest) VALUES(?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=1,lastRequest=excluded.lastRequest
    WHERE rateLimit.lastRequest <= excluded.lastRequest - 60000`)
    .bind(crypto.randomUUID(), key, now).run();
  return changed.meta.changes === 1;
}

async function prefilterAndThrottle(request: Request, env: AuthEnv, email: string, now: number): Promise<AccountRow | null> {
  const account = await accountForEmail(env, email);
  if (!account || !['active', 'invited'].includes(account.status)) return null;
  if (account.status === 'invited') {
    const validInvite = await env.DB.prepare(`SELECT 1 FROM invitations WHERE id=? AND email=? COLLATE NOCASE AND status='pending' AND expires_at>?`)
      .bind(account.invitationId, normalizedEmail(email), now).first();
    if (!validInvite) return null;
  }
  const addressHash = await hashForAddress(env, email);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await hmac(env.EMAIL_ADDRESS_HMAC_SECRET, `ip:${ip}`);
  const cooldownAllowed = await reserveAddressCooldown(env, `picnic:otp:cooldown:${addressHash}`, now);
  if (!cooldownAllowed) return null;
  const addressAllowed = await reserveFixedWindowRate(env, `picnic:otp:email-hour:${addressHash}`, now, HOUR, 5);
  if (!addressAllowed) return null;
  const ipAllowed = await reserveFixedWindowRate(env, `picnic:otp:ip-hour:${ipHash}`, now, HOUR, 20);
  if (!ipAllowed) return null;
  return account;
}

function createAuth(env: AuthEnv, deps: AuthDependencies) {
  return betterAuth({
    database: env.DB,
    secret: env.AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    basePath: '/api/auth',
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 0,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: isProduction(env),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: isProduction(env) },
    },
    rateLimit: { enabled: false },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const account = await accountForId(env, session.userId);
            return account && ['active', 'invited'].includes(account.status) ? undefined : false;
          },
          after: async (session) => {
            const now = Date.now();
            const account = await accountForId(env, session.userId);
            if (!account) throw new Error('Account unavailable');
            if (account.status === 'invited') {
              await env.DB.prepare(`INSERT INTO invitation_consumptions(invitation_id,owner_id,verified_email,consumed_at)
                SELECT ?,?,u.email,? FROM user u WHERE u.id=? AND u.emailVerified=1`)
                .bind(account.invitationId, account.id, now, account.id).run();
            }
            const accepted = await createSessionMetadata(env.DB, session.userId, session.id, now);
            if (!accepted) throw new Error('Session could not be activated');
            await env.DB.prepare(`UPDATE session_metadata SET last_verified_at=? WHERE owner_id=? AND session_id=?`)
              .bind(now, session.userId, session.id).run();
          },
        },
      },
    },
    plugins: [emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      disableSignUp: true,
      storeOTP: { hash: (otp) => hashOtp(env, otp) },
      sendVerificationOTP: async ({ email, otp, type }, context) => {
        if (type !== 'sign-in') throw new Error('Unsupported OTP type');
        const request = context?.request;
        if (!request) throw new Error('Request context unavailable');
        const account = await accountForEmail(env, email);
        if (!account || !['active', 'invited'].includes(account.status)) return;
        const now = Date.now();
        if (account.status === 'invited') {
          const validInvite = await env.DB.prepare(`SELECT 1 FROM invitations WHERE id=? AND email=? COLLATE NOCASE AND status='pending' AND expires_at>?`)
            .bind(account.invitationId, normalizedEmail(email), now).first();
          if (!validInvite) return;
        }
        const addressHash = await hashForAddress(env, email);
        const reservationId = crypto.randomUUID();
        let reserved = false;
        let deliveryAttempted = false;
        try {
          await reserveEmailSend(env.DB, {
            id: reservationId,
            ownerId: account.id,
            addressHash,
            day: utcDay(now),
            month: utcDay(now).slice(0, 7),
            createdAt: now,
            dailyCap: 90,
            monthlyCap: 2700,
          });
          reserved = true;
          // A rejected provider call may have delivered the message before timing out.
          deliveryAttempted = true;
          await deliver(env, deps, { to: normalizedEmail(email), subject: 'Je Picnic-inlogcode', text: `Je inlogcode is ${otp}. De code verloopt over 10 minuten.` });
          await settleEmailSend(env.DB, reservationId, 'sent', Date.now());
        } catch (error) {
          if (reserved) await settleEmailSend(env.DB, reservationId, deliveryAttempted ? 'unknown' : 'failed', Date.now()).catch(() => undefined);
          throw error;
        }
      },
    })],
  });
}

const endpointPaths = new Set([
  '/api/auth/email-otp/send-verification-otp',
  '/api/auth/sign-in/email-otp',
  '/api/auth/get-session',
  '/api/auth/sign-out',
]);

function scrubTokens(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubTokens);
  if (!value || typeof value !== 'object') return value;
  const clean: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === 'token') continue;
    clean[key] = scrubTokens(entry);
  }
  return clean;
}

function sameOrigin(request: Request, env: AuthEnv): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env.APP_ORIGIN).origin; } catch { return false; }
}

export async function handleAuth(request: Request, env: AuthEnv, deps: AuthDependencies = {}): Promise<Response | null> {
  const url = new URL(request.url);
  const isOtpSend = url.pathname === '/api/auth/email-otp/send-verification-otp' && request.method === 'POST';
  if (!url.pathname.startsWith('/api/auth/')) return null;
  if (!endpointPaths.has(url.pathname)) return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Niet gevonden.' } }, 404);
  const expectedMethod = url.pathname.endsWith('/get-session') ? 'GET' : 'POST';
  if (request.method !== expectedMethod) return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Methode niet toegestaan.' } }, 405, { Allow: expectedMethod });
  if (request.method === 'POST' && !sameOrigin(request, env)) return jsonResponse({ error: { code: 'ORIGIN_FORBIDDEN', message: 'Verzoek geweigerd.' } }, 403);
  if (url.pathname === '/api/auth/get-session' && !(await requirePrincipal(request, env))) {
    return jsonResponse(null);
  }

  if (url.pathname.endsWith('/send-verification-otp') && request.method === 'POST') {
    let payload: Record<string, unknown>;
    try { payload = await request.clone().json() as Record<string, unknown>; } catch { return jsonResponse(NEUTRAL); }
    const email = typeof payload.email === 'string' ? normalizedEmail(payload.email) : '';
    if (!email || payload.type !== 'sign-in') return jsonResponse(NEUTRAL);
    const account = await prefilterAndThrottle(request, env, email, Date.now());
    if (!account) return jsonResponse(NEUTRAL);
  }

  try {
    const auth = createAuth(env, deps);
    const response = await auth.handler(request);
    if (isOtpSend) return jsonResponse(NEUTRAL);
    if (!response.ok) {
      const unavailable = response.status >= 500;
      const limited = response.status === 429;
      return jsonResponse({ error: {
        code: unavailable ? 'AUTH_UNAVAILABLE' : limited ? 'AUTH_RATE_LIMITED' : 'AUTH_FAILED',
        message: unavailable ? 'Inloggen is tijdelijk niet beschikbaar.'
          : limited ? 'Je hebt te veel pogingen gedaan. Wacht even en probeer opnieuw.'
          : 'De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.',
      } }, response.status, response.headers);
    }
    if (!response.headers.get('content-type')?.includes('application/json')) return noStore(response);
    let body: unknown;
    try { body = await response.clone().json(); } catch { return noStore(response); }
    return jsonResponse(scrubTokens(body), response.status, response.headers);
  } catch {
    if (isOtpSend) return jsonResponse(NEUTRAL);
    return jsonResponse({ error: { code: 'AUTH_UNAVAILABLE', message: 'Inloggen is tijdelijk niet beschikbaar.' } }, 503);
  }
}

export async function requirePrincipal(request: Request, env: AuthEnv): Promise<Principal | null> {
  try {
    const auth = createAuth(env, {});
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id || !session.session.id) return null;
    const now = Date.now();
    const access = await touchSession(env.DB, session.user.id, session.session.id, now);
    if (!access.success) return null;
    const account = await accountForId(env, session.user.id);
    if (!account || account.status !== 'active') return null;
    const verified = await env.DB.prepare('SELECT last_verified_at AS lastVerifiedAt FROM session_metadata WHERE owner_id=? AND session_id=?')
      .bind(account.id, session.session.id).first<{ lastVerifiedAt: number | null }>();
    return { ownerId: account.id, sessionId: session.session.id, role: account.role, email: account.email, lastVerifiedAt: verified?.lastVerifiedAt ?? null };
  } catch {
    return null;
  }
}

export function assertRecentVerification(principal: Principal, now = Date.now()): boolean {
  return principal.lastVerifiedAt !== null && principal.lastVerifiedAt <= now && now - principal.lastVerifiedAt <= RECENT_VERIFICATION_MS;
}

export async function clearAuthCookie(request: Request, env: AuthEnv): Promise<Response> {
  const response = await createAuth(env, {}).handler(new Request(new URL('/api/auth/sign-out', request.url), {
    method: 'POST',
    headers: { Origin: new URL(env.APP_ORIGIN).origin, Cookie: request.headers.get('Cookie') ?? '' },
  }));
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, private');
  return new Response(null, { status: 204, headers });
}
