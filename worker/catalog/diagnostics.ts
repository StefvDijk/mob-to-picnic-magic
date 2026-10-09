import type { PicnicProductDetails } from '../../shared/picnic';
import type { PicnicProvider } from '../adapters/picnic';
/** Read-only probe through the app's injected provider. Never exposes credentials or raw pages. */
export async function diagnoseProducts(provider: PicnicProvider, authKey: string, ids: string[], options: {
  maxRequests?: number; delayMs?: number;
  observedFollowup?: string;
  canRead?: () => Promise<boolean>;
  onDetail?: (detail: PicnicProductDetails) => Promise<void>;
} = {}) {
  const max = Math.min(50, Math.max(1, options.maxRequests ?? 20));
  const delay = Math.min(5000, Math.max(0, options.delayMs ?? 250));
  if (!Number.isInteger(max) || !Number.isInteger(delay) || ids.length > max || ids.some(id => !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) throw new TypeError('Invalid diagnostic bounds');
  if (!provider.productDetails) throw new Error('Product detail route unsupported');
  const observations = [];
  let requestCount = 0;
  let followupUsed = false;
  for (const id of [...new Set(ids)]) {
    if (observations.length && delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (requestCount >= max || (options.canRead && !await options.canRead())) break;
    const started = Date.now();
    try {
      requestCount++;
      let result = await provider.productDetails(authKey, id);
      if (!followupUsed && options.observedFollowup && requestCount < max && provider.observedProductDetails
        && result.diagnostic?.observedReadLinks.includes(options.observedFollowup)) {
        if (options.canRead && !await options.canRead()) break;
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        followupUsed = true;
        requestCount++;
        result = await provider.observedProductDetails(authKey, result, options.observedFollowup);
      }
      if (options.onDetail) await options.onDetail(result);
      observations.push({ id, diagnostic: result.diagnostic, latencyMs: Date.now() - started, usable: result.currentCheckUsable,
        coverage: { price: result.product.displayPriceCents !== null, packaging: result.product.quantity !== null,
          availability: result.product.isAvailable !== undefined, limit: result.product.maxCount !== undefined,
          sections: result.infoSections.length, contains: result.allergens.contains.length, mayContain: result.allergens.mayContain.length } });
    } catch { observations.push({ id, latencyMs: Date.now() - started, error: 'detail_read_failed' as const }); break; }
  }
  return { route: 'product-details-page-root', requestCount, followupUsed, categoryCoverageProven: false, observations };
}
