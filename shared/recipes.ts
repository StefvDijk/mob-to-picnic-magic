import type { Quantity } from './quantities';

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
  createdAt: number;
  updatedAt: number;
}
