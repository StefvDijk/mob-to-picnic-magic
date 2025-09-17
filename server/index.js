import { createServer } from 'http';
import { URL } from 'url';
import { config, resolveAutoAddThreshold } from './config.js';
import { picnicClientManager } from './picnicClient.js';
import { normalizeIngredient } from './normalizer.js';
import { rankCandidates, decideBestCandidate } from './decisionEngine.js';
import { createSession, getSession, saveSession } from './sessionManager.js';
import { rememberMapping, findMapping } from './feedbackStore.js';

const routes = [];

function addRoute(method, path, handler) {
  const segments = path.split('/').filter(Boolean);
  routes.push({ method: method.toUpperCase(), segments, handler });
}

function matchRoute(method, pathname) {
  const segments = pathname.split('/').filter(Boolean);
  for (const route of routes) {
    if (route.method !== method.toUpperCase()) continue;
    if (route.segments.length !== segments.length) continue;
    const params = {};
    let matches = true;
    for (let i = 0; i < segments.length; i += 1) {
      const routeSegment = route.segments[i];
      const actualSegment = segments[i];
      if (routeSegment.startsWith(':')) {
        params[routeSegment.slice(1)] = decodeURIComponent(actualSegment);
        continue;
      }
      if (routeSegment !== actualSegment) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { handler: route.handler, params };
    }
  }
  return null;
}

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function parseBody(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET')) {
    return null;
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body te groot'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Ongeldige JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function buildSummary(items) {
  const totalItems = items.length;
  const addedToCart = items.filter((item) => item.added).length;
  const pendingReview = items.filter((item) => !item.added).length;
  const noMatch = items.filter((item) => item.decision?.decision === 'none').length;

  return {
    totalItems,
    addedToCart,
    autoAdded: addedToCart,
    needsReview: pendingReview,
    noMatch,
  };
}

addRoute('GET', '/api/status', async ({ res }) => {
  sendJson(res, 200, {
    picnic: picnicClientManager.getStatus(),
    autoAddThreshold: config.autoAddThreshold,
  });
});

addRoute('POST', '/api/login', async ({ res, body }) => {
  try {
    const { username, password } = body || {};
    const result = await picnicClientManager.login(username, password);
    const status = picnicClientManager.getStatus();
    const success = result.success || status.mode === 'mock';
    sendJson(res, success ? 200 : 401, {
      success,
      mode: status.mode,
      message: success
        ? status.mode === 'mock'
          ? 'In mockmodus wegens ontbrekende of ongeldige Picnic-credentials'
          : 'Succesvol ingelogd bij Picnic'
        : result.error || 'Inloggen mislukt',
    });
  } catch (error) {
    console.error('Login endpoint failed:', error);
    sendJson(res, 500, { success: false, message: 'Onverwachte fout tijdens inloggen' });
  }
});

addRoute('POST', '/api/logout', async ({ res }) => {
  picnicClientManager.logout();
  sendJson(res, 200, { success: true });
});

addRoute('POST', '/api/match-session', async ({ res, body }) => {
  try {
    const { items, autoAddThreshold } = body || {};
    if (!Array.isArray(items) || items.length === 0) {
      sendJson(res, 400, { message: 'items array is vereist' });
      return;
    }

    const threshold = resolveAutoAddThreshold(autoAddThreshold);
    const session = createSession();
    const results = [];

    for (const item of items) {
      const raw = typeof item === 'string' ? item : item?.raw || item?.name;
      if (!raw) {
        continue;
      }

      const normalized = await normalizeIngredient(raw);
      const previousMapping = findMapping(raw);
      const searchResults = await picnicClientManager.searchProducts(normalized.normalizedQuery, {
        organic: normalized.attributes.organic,
        limit: 12,
      });
      let rankedCandidates = rankCandidates(normalized, searchResults);

      if (previousMapping && !rankedCandidates.find((candidate) => candidate.id === previousMapping.productId)) {
        rankedCandidates = [
          {
            id: previousMapping.productId,
            name: previousMapping.productName || 'Eerder gekozen product',
            brand: null,
            isBio: normalized.attributes.organic ?? false,
            unitSize: normalized.quantity.sizeHint || null,
            priceEUR: null,
            matchScore: 5,
          },
          ...rankedCandidates,
        ];
      }

      const decision = previousMapping
        ? {
            decision: 'pick',
            chosenProductId: previousMapping.productId,
            confidence: 0.95,
            reason: 'Eerder opgeslagen keuze',
          }
        : decideBestCandidate(normalized, rankedCandidates, { fallbackConfidence: 0.4 });

      let added = false;
      if (decision.decision === 'pick' && decision.confidence >= threshold) {
        const quantity = normalized.quantity?.count ? Math.max(1, Math.round(normalized.quantity.count)) : 1;
        added = await picnicClientManager.addToCart(decision.chosenProductId, quantity);
        if (added) {
          const matchedCandidate = rankedCandidates.find((candidate) => candidate.id === decision.chosenProductId);
          rememberMapping(raw, matchedCandidate || {
            id: decision.chosenProductId,
            name: matchedCandidate?.name || normalized.normalizedQuery,
          });
        }
      }

      const itemRecord = {
        raw,
        normalizedQuery: normalized.normalizedQuery,
        attributes: normalized.attributes,
        quantity: normalized.quantity,
        candidates: rankedCandidates.slice(0, 5),
        decision,
        added,
      };

      if (!added && decision.decision === 'pick' && decision.confidence >= threshold) {
        itemRecord.decision.reason = `${itemRecord.decision.reason} (toevoegen aan winkelmand mislukt)`;
      }

      results.push(itemRecord);
    }

    session.items = results;
    saveSession(session);

    sendJson(res, 200, {
      sessionId: session.sessionId,
      summary: buildSummary(results),
      items: results,
      mode: picnicClientManager.getStatus().mode,
    });
  } catch (error) {
    console.error('match-session failed:', error);
    sendJson(res, 500, { message: 'Onverwachte fout tijdens matching' });
  }
});

addRoute('GET', '/api/session/:sessionId', async ({ res, params }) => {
  const session = getSession(params.sessionId);
  if (!session) {
    sendJson(res, 404, { message: 'Sessie niet gevonden' });
    return;
  }

  sendJson(res, 200, {
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    items: session.items,
    summary: buildSummary(session.items),
  });
});

addRoute('POST', '/api/session/:sessionId/confirm-add', async ({ res, params, body }) => {
  try {
    const { picks } = body || {};
    if (!Array.isArray(picks)) {
      sendJson(res, 400, { message: 'picks array is vereist' });
      return;
    }

    const session = getSession(params.sessionId);
    if (!session) {
      sendJson(res, 404, { message: 'Sessie niet gevonden' });
      return;
    }

    let addedCount = 0;
    const failed = [];

    for (const pick of picks) {
      const raw = pick?.raw;
      const productId = pick?.productId;
      const quantity = pick?.qty && Number(pick.qty) > 0 ? Number(pick.qty) : undefined;
      if (!raw || !productId) {
        continue;
      }

      const item = session.items.find((candidate) => candidate.raw === raw);
      if (!item) {
        failed.push(raw);
        continue;
      }

      const addSuccess = await picnicClientManager.addToCart(
        productId,
        quantity || Math.max(1, Math.round(item.quantity?.count || 1)),
      );
      if (addSuccess) {
        addedCount += 1;
        item.decision = {
          decision: 'pick',
          chosenProductId: productId,
          confidence: Math.max(0.75, item.decision?.confidence || 0.75),
          reason: 'Handmatig bevestigd door gebruiker',
        };
        item.added = true;
        const candidateMatch = item.candidates.find((candidate) => candidate.id === productId);
        rememberMapping(raw, candidateMatch || { id: productId, name: candidateMatch?.name || raw });
      } else {
        failed.push(raw);
        item.added = false;
      }
    }

    saveSession(session);

    sendJson(res, 200, {
      addedCount,
      failed,
      session: {
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        items: session.items,
        summary: buildSummary(session.items),
      },
    });
  } catch (error) {
    console.error('confirm-add failed:', error);
    sendJson(res, 500, { message: 'Onverwachte fout bij bevestigen' });
  }
});

function createRequestListener() {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!req.url) {
      sendJson(res, 404, { message: 'Niet gevonden' });
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const match = matchRoute(req.method ?? 'GET', url.pathname);
    if (!match) {
      sendJson(res, 404, { message: 'Niet gevonden' });
      return;
    }

    try {
      const body = await parseBody(req);
      await match.handler({ req, res, params: match.params, query: Object.fromEntries(url.searchParams), body });
    } catch (error) {
      console.error('API fout:', error);
      if (!res.headersSent) {
        sendJson(res, 400, { message: error.message || 'Ongeldige aanvraag' });
      } else {
        res.end();
      }
    }
  };
}

export function startServer(port = config.port) {
  const server = createServer(createRequestListener());
  server.listen(port, () => {
    console.log(`Mob → Picnic API server luistert op poort ${port}`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
