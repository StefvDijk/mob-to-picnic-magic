/** Re-encode locally so filename/EXIF metadata never need to leave the device. */
export async function prepareImportPhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Kies een JPG-, PNG- of WebP-foto.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Deze foto is groter dan 8 MB. Kies een kleiner bestand.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Deze foto kan niet worden gelezen. Kies een andere foto.'); }
  try {
    if (bitmap.width * bitmap.height > 12_000_000) throw new Error('Deze foto is groter dan 12 megapixels. Verklein of knip de foto eerst bij.');
    const canvas = document.createElement('canvas');
    // Keep recipe text legible while avoiding full camera-resolution AI input.
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Foto verwerken lukt niet in deze browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Foto verwerken is mislukt.')), 'image/png'));
    if (blob.size > 8 * 1024 * 1024) throw new Error('De verwerkte foto is te groot. Knip de foto bij tot het recept.');
    return blob;
  } finally { bitmap.close(); }
}
