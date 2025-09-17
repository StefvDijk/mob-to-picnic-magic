import { randomUUID } from 'crypto';

const sessions = new Map();

export function createSession() {
  const sessionId = randomUUID();
  const session = {
    sessionId,
    createdAt: new Date().toISOString(),
    items: [],
  };
  sessions.set(sessionId, session);
  return session;
}

export function saveSession(session) {
  sessions.set(session.sessionId, session);
  return session;
}

export function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

export function updateSession(sessionId, updater) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const updated = updater(session) || session;
  sessions.set(sessionId, updated);
  return updated;
}

export function listSessions() {
  return Array.from(sessions.values());
}
