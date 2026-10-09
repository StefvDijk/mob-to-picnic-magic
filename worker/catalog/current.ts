import type { PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
import type { PicnicProvider } from '../adapters/picnic';
import { productFingerprints } from './index';

export type CurrentProduct = { product: PicnicProduct | null; source: 'product-detail' | 'search'; contentFingerprint: string | null; details?: PicnicProductDetails };
/** A missing search hit never establishes removal. Reads cannot classify or substitute products. */
export async function checkCurrentProduct(api: PicnicProvider, authKey: string, id: string, query: string): Promise<CurrentProduct> {
  let details: PicnicProductDetails | undefined;
  if (api.productDetails) {
    const detail = await api.productDetails(authKey, id);
    details = detail;
    if (detail.product.id !== id) throw new Error('PRODUCT_ID_MISMATCH');
    if (detail.currentCheckUsable || detail.product.isAvailable === false) return { product: detail.product, source: 'product-detail', contentFingerprint: productFingerprints(detail.product, detail).content, details: detail };
    // Explicit negative detail evidence is authoritative even when price or packaging is incomplete.
    // Other incomplete details may be supplemented by a positive search observation.
  }
  const product = (await api.search(authKey, query)).find(item => item.id === id);
  if (!product) throw new Error('PRODUCT_CHECK_INCOMPLETE');
  const merged = details ? {...details, product} : undefined;
  return { product, source: 'search', contentFingerprint: productFingerprints(product,merged).content, details:merged };
}
