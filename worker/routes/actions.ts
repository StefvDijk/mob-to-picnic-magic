import { requirePrincipal, type AuthEnv, type Principal } from '../auth';
import { createApprovedAction, finishAction, resolveUnknownExecutionLine } from '../db';
import { formatRational } from '../../shared/quantities';
import type { ActionDto, ActionLineDto, ActionState, ExecutionLineState } from '../../shared/actions';
import type { ProposalProductDto } from '../../shared/proposals';

const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };
type ActionEnv = AuthEnv;
type ProposalRow = {
  id: string; version: number; recipeId: string; recipeVersion: number; connectionId: string; connectionGeneration: number;
  status: string; expiresAt: number; servingsNum: number | null; servingsDen: number;
};
type PurchaseRow = { id: string; needId: string; ordinal: number; snapshot: string; packCount: number; priceCents: number | null };
type ActionRow = { id: string; approvalId: string; proposalId: string; state: string; createdAt: number; startedAt: number | null; finishedAt: number | null; totalPriceCents: number | null };
type ExistingAction = { id: string };

function json(value: unknown, status = 200): Response { return Response.json(value, { status, headers: NO_STORE }); }
function fail(status: number, code: string, message: string): Response { return json({ error: { code, message } }, status); }
function actionPath(path: string): { kind: 'approve' | 'proposal-action'; proposalId: string } | { kind: 'action' | 'resolve'; actionId: string } | null {
  let match = path.match(/^\/api\/proposals\/([^/]+)\/approve$/);
  if (match) { try { return { kind: 'approve', proposalId: decodeURIComponent(match[1]) }; } catch { return null; } }
  match = path.match(/^\/api\/proposals\/([^/]+)\/action$/);
  if (match) { try { return { kind: 'proposal-action', proposalId: decodeURIComponent(match[1]) }; } catch { return null; } }
  match = path.match(/^\/api\/actions\/([^/]+)(\/resolve)?$/);
  if (match) {
    try { return { kind: match[2] ? 'resolve' : 'action', actionId: decodeURIComponent(match[1]) }; }
    catch { return null; }
  }
  return null;
}
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try { const value: unknown = await request.json(); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}
function productFromSnapshot(raw: string): ProposalProductDto | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const product = value as Record<string, unknown>;
    if (typeof product.id !== 'string' || typeof product.name !== 'string' ||
        !Number.isSafeInteger(product.packCount) || (product.packCount as number) < 1 ||
        !Number.isSafeInteger(product.priceCents) || (product.priceCents as number) < 0) return null;
    return product as unknown as ProposalProductDto;
  } catch { return null; }
}
async function findExistingAction(env: ActionEnv, ownerId: string, proposalId: string, proposalVersion: number): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT a.id FROM actions a JOIN approvals ap
    ON ap.owner_id=a.owner_id AND ap.id=a.approval_id
    WHERE a.owner_id=? AND a.proposal_id=? AND ap.proposal_version=? LIMIT 1`)
    .bind(ownerId, proposalId, proposalVersion).first<ExistingAction>();
  return row?.id ?? null;
}
async function loadAction(env: ActionEnv, ownerId: string, actionId: string): Promise<ActionDto | null> {
  const row = await env.DB.prepare(`SELECT a.id,a.approval_id AS approvalId,a.proposal_id AS proposalId,a.state,
      a.created_at AS createdAt,a.started_at AS startedAt,a.finished_at AS finishedAt,ap.total_price_cents AS totalPriceCents
    FROM actions a JOIN approvals ap ON ap.owner_id=a.owner_id AND ap.id=a.approval_id
    WHERE a.owner_id=? AND a.id=?`)
    .bind(ownerId, actionId).first<ActionRow>();
  if (!row) return null;
  const lineRows = await env.DB.prepare(`SELECT e.id,e.purchase_line_id AS purchaseLineId,e.status,
      p.product_snapshot_json AS snapshot,p.pack_count AS packCount,p.price_cents AS priceCents
    FROM execution_lines e JOIN purchase_lines p ON p.owner_id=e.owner_id AND p.proposal_id=e.proposal_id AND p.id=e.purchase_line_id
    WHERE e.owner_id=? AND e.action_id=? ORDER BY e.ordinal`)
    .bind(ownerId, actionId).all<{ id: string; purchaseLineId: string; status: string; snapshot: string; packCount: number; priceCents: number | null }>();
  const lines: ActionLineDto[] = [];
  let total = 0;
  for (const line of lineRows.results) {
    const product = productFromSnapshot(line.snapshot);
    if (!product || !Number.isSafeInteger(line.packCount) || line.packCount < 1 ||
        !Number.isSafeInteger(line.priceCents) || line.priceCents === null || line.priceCents < 0 ||
        !['unsent', 'sending', 'added', 'not_added', 'unknown', 'skipped'].includes(line.status)) return null;
    const lineTotalCents = line.packCount * line.priceCents;
    if (!Number.isSafeInteger(lineTotalCents) || !Number.isSafeInteger(total + lineTotalCents)) return null;
    total += lineTotalCents;
    lines.push({ id: line.id, purchaseLineId: line.purchaseLineId, productId: product.id, name: product.name,
      count: line.packCount, unitPriceCents: line.priceCents, lineTotalCents, status: line.status as ExecutionLineState });
  }
  if (!lines.length || !['queued', 'running', 'partial', 'succeeded', 'stopped', 'unknown', 'resolved'].includes(row.state)) return null;
  return { id: row.id, approvalId: row.approvalId, proposalId: row.proposalId, state: row.state as ActionState,
    createdAt: row.createdAt, startedAt: row.startedAt, finishedAt: row.finishedAt,
    totalPriceCents: row.totalPriceCents ?? total, lines };
}
async function existingActionResponse(env: ActionEnv, ownerId: string, proposalId: string, proposalVersion: number): Promise<Response | null> {
  const id = await findExistingAction(env, ownerId, proposalId, proposalVersion);
  if (!id) return null;
  const action = await loadAction(env, ownerId, id);
  return action ? json({ action }) : fail(503, 'ACTION_UNAVAILABLE', 'De actie kan tijdelijk niet worden geladen.');
}
async function proposalActionResponse(env: ActionEnv, ownerId: string, proposalId: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT a.id FROM actions a JOIN proposals p
    ON p.owner_id=a.owner_id AND p.id=a.proposal_id WHERE a.owner_id=? AND a.proposal_id=?
    ORDER BY a.created_at DESC LIMIT 1`).bind(ownerId, proposalId).first<ExistingAction>();
  if (!row) return fail(404, 'ACTION_NOT_FOUND', 'Voorstel heeft nog geen actie.');
  const action = await loadAction(env, ownerId, row.id);
  return action ? json({ action }) : fail(503, 'ACTION_UNAVAILABLE', 'De actie kan tijdelijk niet worden geladen.');
}

async function approve(request: Request, env: ActionEnv, principal: Principal, proposalId: string): Promise<Response> {
  const body = await readBody(request);
  if (!body || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) {
    return fail(400, 'INVALID_APPROVAL', 'Ververs het voorstel en probeer opnieuw.');
  }
  const expectedVersion = body.expectedVersion as number;
  const proposal = await env.DB.prepare(`SELECT id,version,recipe_id AS recipeId,recipe_version AS recipeVersion,
      connection_id AS connectionId,connection_generation AS connectionGeneration,status,expires_at AS expiresAt,
      servings_num AS servingsNum,servings_den AS servingsDen
    FROM proposals WHERE owner_id=? AND id=?`).bind(principal.ownerId, proposalId).first<ProposalRow>();
  if (!proposal) return fail(404, 'PROPOSAL_NOT_FOUND', 'Voorstel niet gevonden.');

  const duplicate = await existingActionResponse(env, principal.ownerId, proposalId, expectedVersion);
  if (duplicate) return duplicate;
  const now = Date.now();
  if (proposal.version !== expectedVersion || proposal.status !== 'ready' || proposal.expiresAt <= now || proposal.servingsNum === null) {
    return fail(409, 'PROPOSAL_STALE', 'Dit voorstel is gewijzigd of verlopen. Maak een nieuw voorstel.');
  }
  const current = await env.DB.prepare(`SELECT r.version AS recipeVersion,r.deleted_at AS deletedAt,
      c.status AS connectionStatus,c.generation AS connectionGeneration,s.add_enabled AS addEnabled
    FROM recipes r JOIN connections c ON c.owner_id=r.owner_id AND c.id=?
    JOIN app_switches s ON s.singleton=1 WHERE r.owner_id=? AND r.id=?`)
    .bind(proposal.connectionId, principal.ownerId, proposal.recipeId)
    .first<{ recipeVersion: number; deletedAt: number | null; connectionStatus: string; connectionGeneration: number; addEnabled: number }>();
  if (!current || current.deletedAt !== null || current.recipeVersion !== proposal.recipeVersion ||
      current.connectionStatus !== 'connected' || current.connectionGeneration !== proposal.connectionGeneration) {
    return fail(409, 'PROPOSAL_STALE', 'Het recept of de Picnic-koppeling is gewijzigd. Maak een nieuw voorstel.');
  }
  if (current.addEnabled !== 1) return fail(403, 'ADDITIONS_DISABLED', 'Toevoegen aan Picnic staat tijdelijk uit.');

  const purchases = await env.DB.prepare(`SELECT id,need_id AS needId,ordinal,product_snapshot_json AS snapshot,
      pack_count AS packCount,price_cents AS priceCents FROM purchase_lines
    WHERE owner_id=? AND proposal_id=? ORDER BY ordinal`)
    .bind(principal.ownerId, proposalId).all<PurchaseRow>();
  const needCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM proposal_needs WHERE owner_id=? AND proposal_id=?`)
    .bind(principal.ownerId, proposalId).first<{ count: number }>();
  if (!purchases.results.length || purchases.results.length !== needCount?.count) {
    return fail(409, 'PROPOSAL_INCOMPLETE', 'Het voorstel is niet compleet. Maak het voorstel opnieuw.');
  }
  let totalPriceCents = 0;
  const snapshotLines: Array<{ purchaseLineId: string; needId: string; product: ProposalProductDto; packCount: number; unitPriceCents: number; lineTotalCents: number }> = [];
  for (const line of purchases.results) {
    const product = productFromSnapshot(line.snapshot);
    if (!product || !Number.isSafeInteger(line.packCount) || line.packCount < 1 ||
        !Number.isSafeInteger(line.priceCents) || line.priceCents === null || line.priceCents < 0) {
      return fail(409, 'PROPOSAL_INCOMPLETE', 'Een productregel in het voorstel kan niet worden gecontroleerd.');
    }
    const lineTotalCents = line.priceCents * line.packCount;
    if (!Number.isSafeInteger(lineTotalCents) || !Number.isSafeInteger(totalPriceCents + lineTotalCents)) {
      return fail(409, 'PROPOSAL_INCOMPLETE', 'De totaalprijs kan niet veilig worden berekend.');
    }
    totalPriceCents += lineTotalCents;
    snapshotLines.push({ purchaseLineId: line.id, needId: line.needId, product, packCount: line.packCount,
      unitPriceCents: line.priceCents, lineTotalCents });
  }
  const approvalId = crypto.randomUUID(), actionId = crypto.randomUUID();
  try {
    await createApprovedAction(env.DB, principal.ownerId, {
      id: approvalId, proposalId, proposalVersion: expectedVersion, startingSessionId: principal.sessionId,
      snapshot: { proposalId, proposalVersion: expectedVersion, recipeId: proposal.recipeId, recipeVersion: proposal.recipeVersion,
        servings: formatRational({ numerator: proposal.servingsNum, denominator: proposal.servingsDen }), totalPriceCents, lines: snapshotLines },
      totalPriceCents, approvedAt: now, expiresAt: proposal.expiresAt,
    }, {
      id: actionId, approvalId, proposalId, connectionId: proposal.connectionId,
      connectionGeneration: proposal.connectionGeneration, createdAt: now, purchaseLineIds: purchases.results.map(line => line.id),
    });
  } catch {
    const winner = await existingActionResponse(env, principal.ownerId, proposalId, expectedVersion);
    if (winner) return winner;
    return fail(409, 'APPROVAL_CONFLICT', 'Het voorstel kan niet meer worden goedgekeurd. Ververs het en probeer opnieuw.');
  }
  const action = await loadAction(env, principal.ownerId, actionId);
  return action ? json({ action }, 202) : fail(503, 'ACTION_UNAVAILABLE', 'De actie is aangemaakt maar kan tijdelijk niet worden geladen.');
}

async function resolve(request: Request, env: ActionEnv, principal: Principal, actionId: string): Promise<Response> {
  const body = await readBody(request);
  if (!body || typeof body.lineId !== 'string' || !body.lineId || body.lineId.length > 120 ||
      !(body.resolution === 'confirmed_added' || body.resolution === 'confirmed_not_added')) {
    return fail(400, 'INVALID_RESOLUTION', 'Controleer de mand en kies een geldige uitkomst.');
  }
  const action = await env.DB.prepare(`SELECT state FROM actions WHERE owner_id=? AND id=?`)
    .bind(principal.ownerId, actionId).first<{ state: string }>();
  if (!action) return fail(404, 'ACTION_NOT_FOUND', 'Actie niet gevonden.');
  const expectedStatus = body.resolution === 'confirmed_added' ? 'added' : 'not_added';
  const loadLine = () => env.DB.prepare(`SELECT status,user_resolution AS userResolution FROM execution_lines
    WHERE owner_id=? AND action_id=? AND id=?`).bind(principal.ownerId, actionId, body.lineId)
    .first<{ status: string; userResolution: string | null }>();
  let line = await loadLine();
  if (!line) return fail(409, 'ACTION_LINE_NOT_UNKNOWN', 'Deze regel heeft geen onzekere uitkomst om op te lossen.');
  const alreadyResolved = line.status === expectedStatus && line.userResolution === body.resolution;
  if (action.state === 'resolved') {
    if (!alreadyResolved) return fail(409, 'ACTION_NOT_UNKNOWN', 'Deze actie heeft geen onzekere uitkomst om op te lossen.');
    const existing = await loadAction(env, principal.ownerId, actionId);
    return existing ? json({ action: existing }) : fail(503, 'ACTION_UNAVAILABLE', 'De actie kan tijdelijk niet worden geladen.');
  }
  if (action.state !== 'unknown') return fail(409, 'ACTION_NOT_UNKNOWN', 'Deze actie heeft geen onzekere uitkomst om op te lossen.');
  if (!alreadyResolved) {
    if (line.status !== 'unknown') return fail(409, 'ACTION_LINE_NOT_UNKNOWN', 'Deze regel heeft geen onzekere uitkomst om op te lossen.');
    const changed = await resolveUnknownExecutionLine(env.DB, principal.ownerId, actionId, body.lineId,
      body.resolution, Date.now());
    if (!changed) {
      // Another identical request may have committed the line resolution before this one.
      line = await loadLine();
      if (!line || line.status !== expectedStatus || line.userResolution !== body.resolution) {
        return fail(409, 'ACTION_LINE_NOT_UNKNOWN', 'Deze regel heeft geen onzekere uitkomst om op te lossen.');
      }
    }
  }
  await env.DB.prepare(`UPDATE execution_lines SET status='skipped',completed_at=?
    WHERE owner_id=? AND action_id=? AND status='unsent'`).bind(Date.now(), principal.ownerId, actionId).run();
  const unresolved = await env.DB.prepare(`SELECT 1 FROM execution_lines WHERE owner_id=? AND action_id=?
    AND status IN ('unsent','sending','unknown') LIMIT 1`).bind(principal.ownerId, actionId).first();
  if (!unresolved) await finishAction(env.DB, principal.ownerId, actionId, 'resolved', Date.now());
  const updated = await loadAction(env, principal.ownerId, actionId);
  return updated ? json({ action: updated }) : fail(503, 'ACTION_UNAVAILABLE', 'De actie kan tijdelijk niet worden geladen.');
}

/** Returns null when the route does not own the request path. */
export async function handleActions(request: Request, env: ActionEnv): Promise<Response | null> {
  const path = actionPath(new URL(request.url).pathname);
  if (!path) return null;
  const write = request.method !== 'GET';
  if (write) {
    if (request.headers.get('Origin') !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED', 'Dit verzoek is niet toegestaan.');
    if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return fail(400, 'INVALID_CONTENT_TYPE', 'Verstuur geldige JSON.');
    }
  }
  const principal = await requirePrincipal(request, env);
  if (!principal) return fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
  if (path.kind === 'approve' && request.method === 'POST') return approve(request, env, principal, path.proposalId);
  if (path.kind === 'proposal-action' && request.method === 'GET') return proposalActionResponse(env, principal.ownerId, path.proposalId);
  if (path.kind === 'resolve' && request.method === 'POST') return resolve(request, env, principal, path.actionId);
  if (path.kind === 'action' && request.method === 'GET') {
    const action = await loadAction(env, principal.ownerId, path.actionId);
    return action ? json({ action }) : fail(404, 'ACTION_NOT_FOUND', 'Actie niet gevonden.');
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
}
