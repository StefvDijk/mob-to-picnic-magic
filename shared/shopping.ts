import type { PicnicProduct } from './picnic';
import type { RecipeIngredientDto } from './recipes';
import type { Quantity } from './quantities';

export interface ShoppingGroup {
  id: string;
  name: string;
  query: string;
  knowledgeKey: string;
  pantry: boolean;
  sources: RecipeIngredientDto[];
  /** Derived shopping need; never written back over the original recipe quantities. */
  demand: Quantity | null;
  estimates: string[];
}
export type MatchStatus = 'suitable' | 'substitution' | 'unsuitable' | 'unresolved';
export interface ProductAssessment {
  id?: string;
  contentFingerprint?: string;
  status: MatchStatus;
  reason: string;
  hardExclusion: boolean;
  version: string;
}
export interface ShoppingCandidate {
  product: PicnicProduct;
  match: MatchStatus;
  assessment?: ProductAssessment;
  packCount: number | null;
  totalPriceCents: number | null;
  estimates: string[];
}
export interface ShoppingRow extends ShoppingGroup {
  candidatesTruncated?: boolean;
  candidates: ShoppingCandidate[];
  selectedProductId: string | null;
  preferred: boolean;
  error: string | null;
}
export interface ShoppingPlan {
  recipeId: string;
  recipeVersion: number;
  servings: string;
  matcherVersion: string;
  rows: ShoppingRow[];
}
export interface ShoppingChoice {
  assessmentId?: string;
  groupId: string;
  productId: string;
  packCount: number;
  substitutionAccepted: boolean;
  remember: boolean;
  /** Price displayed at confirmation, checked again before the action is created. */
  expectedPriceCents: number;
}
export interface ShoppingProposalInput {
  requestId: string;
  recipeId: string;
  recipeVersion: number;
  servings: string;
  choices: ShoppingChoice[];
}
export interface ShoppingProposalResult {
  proposal: { id: string; version: number; totalPriceCents: number };
  unavailable: Array<{ groupId: string; name: string; reason?: 'unverified' | 'unavailable' }>;
}
