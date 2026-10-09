import type { Quantity } from './quantities';

export type PicnicConnectionStatus = 'connected' | 'verification_required' | 'disconnected' | 'invalid';
export type PicnicPriceCertainty = 'known' | 'conditional' | 'unknown';

export interface PicnicProduct {
  id: string;
  name: string;
  brand?: string;
  imageId?: string;
  unitQuantity: string;
  quantity: Quantity | null;
  displayPriceCents: number | null;
  priceCertainty: PicnicPriceCertainty;
  isAvailable?: boolean;
  maxCount?: number;
  priceRanges: Array<{ fromQuantity: number; priceCents: number }>;
  /** No provider verified group relationship is currently available. */
  identity: { groupId: string; variantId: string };
}

export interface PicnicCartLine {
  productId: string;
  name: string;
  unitQuantity: string;
  quantity: number | null;
  unitPriceCents: number | null;
  isAvailable: boolean | null;
}

export interface PicnicAllocation {
  id: string; proposalId: string; needId: string; productId: string; quantity: string; unit: string; quantityBasis: 'net' | 'drained' | null; status: string;
}
export interface PicnicCart { lines: PicnicCartLine[]; allocations: PicnicAllocation[] }
export interface PicnicConnectionDto { status: PicnicConnectionStatus }
export interface PicnicConnectResponse {
  connection: PicnicConnectionDto;
  verificationRequired?: boolean;
  /** SMS may have arrived even when the provider request timed out; no automatic resend occurs. */
  deliveryUncertain?: boolean;
}

export interface PicnicProductDetails {
  product: PicnicProduct;
  description: string | null;
  infoSections: Array<{ title: string; content: string }>;
  allergens: { contains: string[]; mayContain: string[]; original: string[] };
  parserVersion: string;
  diagnostic?: {
    sellingUnitKeys: string[];
    fieldPaths: Array<{ path: string; type: string }>;
    observedReadLinks: string[];
    availabilitySignals?: Array<{ path: string; type: string; value?: string | boolean }>;
  };
  /** True only when explicit ID, price, packaging and availability were observed. */
  currentCheckUsable: boolean;
}
