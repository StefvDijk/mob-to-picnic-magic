import type { PicnicProduct } from './picnic';
/** A complete tier schedule has a verified price from the first pack. Existing cart
 * contents are deliberately excluded; Picnic may apply an additional discount there. */
export function unitPriceForPacks(product: PicnicProduct, count: number): number | null {
  if (product.priceCertainty !== 'known' || !Number.isSafeInteger(count) || count < 1 || product.displayPriceCents === null) return null;
  const tiers = product.priceRanges.filter(tier => tier.fromQuantity <= count).sort((a, b) => b.fromQuantity - a.fromQuantity);
  return tiers[0]?.priceCents ?? product.displayPriceCents;
}
