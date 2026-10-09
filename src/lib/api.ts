import type { ShoppingPlan, ShoppingProposalInput, ShoppingProposalResult } from '../../shared/shopping';
import type { RecipeDto, RecipeIngredientDto, RecipeImportSourceInput } from '../../shared/recipes';
import type { PicnicCart, PicnicConnectResponse, PicnicConnectionDto, PicnicProduct } from '../../shared/picnic';
import type { ImportDto } from '../../shared/imports';
import type { ProposalChoiceInput, ProposalDto } from '../../shared/proposals';
import type { ActionDto } from '../../shared/actions';

export type { RecipeDto, RecipeIngredientDto };

export interface MeDto {
  account: { id: string; email: string; role: 'admin' | 'member'; status: string };
  session: { authenticatedAt: number; lastActivityAt: number; expiresAt: number; recentlyVerified: boolean };
  picnic: PicnicConnectionDto & { verificationRequired: boolean };
  budgets: {
    month: string;
    user: BudgetDto;
    app: BudgetDto;
  };
  environment: string;
}

export interface BudgetDto { capCents: number; spentCents: number; reservedCents: number }

export interface RecipeInputDto {
  title: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  baseServings: string | null;
  steps: string[];
  ingredients: Omit<RecipeIngredientDto, 'id' | 'ordinal'>[];
  uploads: string[];
  importSource?: RecipeImportSourceInput;
  autoSave?: boolean;
}

export interface AdminOverviewDto {
  accounts: Array<{ id: string; email: string; role: 'admin' | 'member'; status: string; createdAt: number; updatedAt: number }>;
  invitations: Array<{ id: string; email: string; status: string; createdAt: number; expiresAt: number }>;
  usage: { month: string; ai: BudgetDto; email: Array<{ period: string; capCount: number; sentCount: number; reservedCount: number }> };
  errors: unknown[];
  switches: { aiEnabled: boolean; addEnabled: boolean };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody { error?: { code?: string; message?: string; fields?: Record<string, string> } }

async function request<T>(path: string, method = 'GET', body?: unknown, timeoutMs?: number): Promise<T> {
  let response: Response;
  const signal = timeoutMs === undefined ? undefined : AbortSignal.timeout(Math.max(1,Math.ceil(timeoutMs)));
  try {
    response = await fetch(path, {
      method, signal,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': body instanceof Blob ? body.type : 'application/json' },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch {
    if (signal?.aborted) throw new ApiError(504,'WORKFLOW_TIMEOUT','Dit duurde langer dan 30 seconden. Je resultaat kan al bewaard zijn; controleer het bestaande resultaat.');
    throw new ApiError(0, 'NETWORK_ERROR', 'Verbinding mislukt. Controleer je internetverbinding en probeer het opnieuw.');
  }
  if (!response.ok) {
    let payload: ErrorBody = {};
    try { payload = await response.json() as ErrorBody; } catch { /* The server may return an empty error. */ }
    throw new ApiError(response.status, payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.message ?? 'Er ging iets mis. Probeer het opnieuw.', payload.error?.fields);
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; }
  catch { throw new ApiError(0, 'INVALID_RESPONSE', 'De server gaf een onleesbaar antwoord. Probeer het opnieuw.'); }
}

export const api = {
  shoppingPlan: (recipeId: string, servings: string, refresh = false, deadlineAt?: number, timeoutMs?: number) => request<{ plan: ShoppingPlan }>('/api/shopping/plan', 'POST', { recipeId, servings, refresh, ...(deadlineAt === undefined ? {} : {deadlineAt}) }, timeoutMs),
  prepareShopping: (input: ShoppingProposalInput) => request<ShoppingProposalResult>('/api/shopping/proposals', 'POST', input),
  approveProposal: (id: string, expectedVersion: number) => request<{ action: ActionDto }>(`/api/proposals/${encodeURIComponent(id)}/approve`, 'POST', { expectedVersion }),
  getAction: (id: string) => request<{ action: ActionDto }>(`/api/actions/${encodeURIComponent(id)}`),
  getProposalAction: (id: string) => request<{ action: ActionDto }>(`/api/proposals/${encodeURIComponent(id)}/action`),
  resolveAction: (id: string, lineId: string, resolution: 'confirmed_added' | 'confirmed_not_added') => request<{ action: ActionDto }>(`/api/actions/${encodeURIComponent(id)}/resolve`, 'POST', { lineId, resolution }),
  createProposal: (input: { recipeId: string; recipeVersion: number; servings: string; choices: ProposalChoiceInput[] }) => request<{ proposal: ProposalDto }>('/api/proposals', 'POST', input),
  getProposal: (id: string) => request<{ proposal: ProposalDto }>(`/api/proposals/${encodeURIComponent(id)}`),
  me: () => request<MeDto>('/api/me'),
  sendCode: (email: string) => request<{ success: true }>('/api/auth/email-otp/send-verification-otp', 'POST', { email, type: 'sign-in' }),
  signIn: (email: string, otp: string) => request<unknown>('/api/auth/sign-in/email-otp', 'POST', { email, otp }),
  logout: () => request<void>('/api/logout', 'POST', {}),
  logoutAll: () => request<void>('/api/logout-all', 'POST', {}),
  deleteAccount: () => request<{ deletion: { id: string; status: string } }>('/api/account', 'DELETE', { confirm: 'VERWIJDER ACCOUNT' }),
  listRecipes: (cursor?: string) => request<{ recipes: RecipeDto[]; nextCursor: string | null }>(`/api/recipes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  getRecipe: (id: string) => request<{ recipe: RecipeDto }>(`/api/recipes/${encodeURIComponent(id)}`),
  createRecipe: (input: RecipeInputDto, timeoutMs?: number) => request<{ recipe: RecipeDto }>('/api/recipes', 'POST', input, timeoutMs),
  updateRecipe: (id: string, expectedVersion: number, input: RecipeInputDto) => request<{ recipe: RecipeDto }>(`/api/recipes/${encodeURIComponent(id)}`, 'PUT', { ...input, expectedVersion }),
  deleteRecipe: (id: string) => request<void>(`/api/recipes/${encodeURIComponent(id)}`, 'DELETE'),
  deleteRecipeSource: (id: string) => request<void>(`/api/recipes/${encodeURIComponent(id)}/source`, 'DELETE'),
  adminOverview: () => request<AdminOverviewDto>('/api/admin/overview'),
  invite: (email: string) => request<{ invitation: { id: string; email: string; status: string; expiresAt: number } }>('/api/admin/invitations', 'POST', { email }),
  revokeInvitation: (id: string) => request<void>(`/api/admin/invitations/${encodeURIComponent(id)}`, 'DELETE'),
  setAccountStatus: (id: string, status: 'active' | 'blocked') => request<{ account: { id: string; status: string } }>(`/api/admin/accounts/${encodeURIComponent(id)}`, 'PATCH', { status }),
  setSwitches: (switches: { aiEnabled?: boolean; addEnabled?: boolean }) => request<{ aiEnabled: boolean; addEnabled: boolean }>('/api/admin/switches', 'PATCH', switches),
  connectPicnic: (username: string, password: string) => request<PicnicConnectResponse>('/api/picnic/connect', 'POST', { username, password }),
  verifyPicnic: (code: string) => request<{ connection: PicnicConnectionDto }>('/api/picnic/verify', 'POST', { code }),
  disconnectPicnic: () => request<void>('/api/picnic/connection', 'DELETE'),
  searchPicnicProducts: (query: string) => request<{ products: PicnicProduct[] }>(`/api/picnic/products?q=${encodeURIComponent(query)}`),
  picnicCart: () => request<{ cart: PicnicCart }>('/api/picnic/cart'),
  uploadPhoto: (photo: Blob, timeoutMs?: number) => request<{ upload: { id: string } }>('/api/uploads', 'POST', photo, timeoutMs),
  importPhotos: (uploadIds: string[], remainingMs?: number) => request<{ import: ImportDto }>('/api/imports', 'POST', { type: 'upload', uploadIds, remainingMs }, remainingMs),
  importUrl: (url: string, sourceLabel?: string, remainingMs?: number) => request<{ import: ImportDto }>('/api/imports', 'POST', { type: 'url', url, remainingMs, ...(sourceLabel ? { sourceLabel } : {}) }, remainingMs),
  getImport: (id: string, timeoutMs?: number) => request<{ import: ImportDto }>(`/api/imports/${encodeURIComponent(id)}`,'GET',undefined,timeoutMs),
};
