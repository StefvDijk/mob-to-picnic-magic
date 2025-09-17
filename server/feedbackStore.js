const feedbackMap = new Map();

export function rememberMapping(rawText, product) {
  if (!rawText || !product?.id) return;
  feedbackMap.set(rawText.toLowerCase(), {
    productId: String(product.id),
    productName: product.name || '',
    timestamp: Date.now(),
  });
}

export function findMapping(rawText) {
  if (!rawText) return null;
  return feedbackMap.get(rawText.toLowerCase()) || null;
}

export function getAllMappings() {
  return Array.from(feedbackMap.entries()).map(([raw, mapping]) => ({ raw, ...mapping }));
}
