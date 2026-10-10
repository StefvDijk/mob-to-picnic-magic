export const formatProductPrice = (cents: number | null) => cents === null ? 'Prijs onbekend' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);

/** Same public image route used by the installed Picnic catalog adapter. Never send an auth key to the browser. */
export function picnicImageUrl(imageId?: string, size: 'small' | 'medium' | 'large' = 'medium'): string | null {
  if (!imageId?.trim()) return null;
  return `https://storefront-prod.nl.picnicinternational.com/static/images/${encodeURIComponent(imageId)}/${size}.png`;
}
