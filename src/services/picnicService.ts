export interface PicnicCredentials {
  username: string;
  password: string;
}

export interface Ingredient {
  raw: string;
  name: string;
  quantity?: string;
  unit?: string;
}

export interface Candidate {
  id: string;
  name: string;
  brand?: string | null;
  isBio: boolean;
  unitSize?: string | null;
  priceEUR?: string | null;
  matchScore?: number;
}

export interface IngredientDecision {
  decision: 'pick' | 'none';
  chosenProductId?: string;
  confidence: number;
  reason?: string;
}

export interface IngredientItem {
  raw: string;
  normalizedQuery: string;
  attributes: {
    category: string;
    variant?: string | null;
    brand?: string | null;
    organic?: boolean;
    notes?: string | null;
  };
  quantity: {
    count: number;
    unit?: string | null;
    sizeHint?: string | null;
  };
  candidates: Candidate[];
  decision: IngredientDecision;
  added?: boolean;
}

export interface SessionSummary {
  totalItems: number;
  addedToCart: number;
  autoAdded: number;
  needsReview: number;
  noMatch: number;
}

export interface MatchSessionResponse {
  sessionId: string;
  items: IngredientItem[];
  summary: SessionSummary;
  mode: 'mock' | 'live';
}

export interface ConfirmAddResponse {
  addedCount: number;
  failed: string[];
  session: {
    sessionId: string;
    createdAt: string;
    items: IngredientItem[];
    summary: SessionSummary;
  };
}

interface RequestOptions extends RequestInit {
  parse?: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function buildUrl(path: string) {
  if (API_BASE) {
    return `${API_BASE.replace(/\/$/, '')}${path}`;
  }
  return path;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const shouldParse = options.parse !== false;
  if (!shouldParse) {
    return undefined as unknown as T;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || 'Serverfout';
    throw new Error(message);
  }
  return payload as T;
}

class PicnicService {
  private authenticated = false;
  private mode: 'mock' | 'live' | null = null;

  isLoggedIn() {
    return this.authenticated;
  }

  getMode() {
    return this.mode;
  }

  async login(credentials: PicnicCredentials) {
    const data = await request<{ success: boolean; mode: 'mock' | 'live'; message: string }>(
      '/api/login',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      },
    );

    this.authenticated = data.success;
    this.mode = data.mode;
    return data;
  }

  async logout() {
    await request('/api/logout', { method: 'POST', parse: false });
    this.authenticated = false;
    this.mode = null;
  }

  async startMatchSession(rawItems: { raw: string }[], autoAddThreshold?: number) {
    const payload = await request<MatchSessionResponse>('/api/match-session', {
      method: 'POST',
      body: JSON.stringify({ items: rawItems, autoAddThreshold }),
    });

    return payload;
  }

  async fetchSession(sessionId: string) {
    return request<{
      sessionId: string;
      createdAt: string;
      items: IngredientItem[];
      summary: SessionSummary;
    }>(`/api/session/${sessionId}`);
  }

  async confirmAdditions(sessionId: string, picks: { raw: string; productId: string; qty?: number }[]) {
    return request<ConfirmAddResponse>(`/api/session/${sessionId}/confirm-add`, {
      method: 'POST',
      body: JSON.stringify({ picks }),
    });
  }
}

export const picnicService = new PicnicService();
