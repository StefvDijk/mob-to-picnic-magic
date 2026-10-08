import type { Quantity, QuantityUnit } from './quantities';

export interface ProposalProductDto {
  id: string;
  name: string;
  unitQuantity: string;
  quantity: Quantity;
  priceCents: number;
  packCount: number;
  suppliedUnit: 'g' | 'ml' | 'piece';
  supplied: string;
  overshoot: string;
}

export interface ProposalNeedDto {
  id: string;
  ingredientId: string;
  ordinal: number;
  name: string;
  quantity: Quantity;
  needed: string;
  product: ProposalProductDto;
}

export interface ProposalDto {
  id: string;
  recipeId: string;
  recipeVersion: number;
  version: number;
  servings: string;
  status: 'ready';
  expiresAt: number;
  totalPriceCents: number;
  needs: ProposalNeedDto[];
}

export interface ProposalChoiceInput {
  ingredientId: string;
  query: string;
  productId: string;
  basis: 'net' | 'drained' | null;
}

export type ProposalUnit = QuantityUnit;
