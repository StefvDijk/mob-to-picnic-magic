import type { Quantity } from './quantities';
import type { ImportCandidate, ImportSourceKind } from './imports';

/** Immutable original source copied from an owned import when the recipe is saved. */
export interface RecipeSourceSnapshotDto {
  kind: ImportSourceKind;
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceText: string | null;
  selectedCandidate: ImportCandidate | null;
  importedAt: number;
}

export interface RecipeImportSourceInput {
  importId: string;
  candidateIndex: number | null;
}

export interface RecipeIngredientDto {
  id: string;
  ordinal: number;
  section: string | null;
  originalText: string;
  normalizedName: string | null;
  quantity: Quantity;
  sourceOrigin: 'user' | 'parser' | 'ai' | 'estimate' | null;
  attributes: Record<string, unknown>;
  uncertainty: string[];
}

export interface RecipeUploadDto {
  id: string;
}

export interface RecipeDto {
  id: string;
  title: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  baseServings: string | null;
  version: number;
  steps: string[];
  ingredients: RecipeIngredientDto[];
  uploads: RecipeUploadDto[];
  /** Present on detail/create/update responses; omitted from list responses. */
  sourceSnapshot?: RecipeSourceSnapshotDto | null;
  createdAt: number;
  updatedAt: number;
}
