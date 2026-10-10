/** Only publisher-owned image URLs from supported recipe sources become covers. */
export function recipeImageUrl(value: unknown, sourceUrl: string | null): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !sourceUrl) return null;
  try {
    const source = new URL(sourceUrl);
    const culy = source.hostname === 'culy.nl' || source.hostname.endsWith('.culy.nl');
    const mob = source.hostname === 'mob.co.uk' || source.hostname.endsWith('.mob.co.uk');
    if (!culy && !mob) return null;
    const image = new URL(value, source);
    if (image.protocol !== 'https:' || image.username || image.password || image.port) return null;
    const host = image.hostname;
    const allowed = culy ? host === 'culy.nl' || host.endsWith('.culy.nl')
      : host === 'mob.co.uk' || host.endsWith('.mob.co.uk') || ['images.ctfassets.net', 'cdn.sanity.io'].includes(host);
    return allowed ? image.toString() : null;
  } catch { return null; }
}
