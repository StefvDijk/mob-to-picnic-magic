import { afterEach, expect, it, vi } from 'vitest';
import { prepareImportPhoto } from '../src/lib/import-photo';

afterEach(() => vi.unstubAllGlobals());
it.each([[4000, 3000, 2048, 1536], [800, 600, 800, 600]])('resizes %sx%s photos without upscaling', async (width, height, targetWidth, targetHeight) => {
  const drawImage = vi.fn();
  const close = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }),
    toBlob: (done: (value: Blob) => void) => done(new Blob(['photo'], { type: 'image/png' })) };
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close }));
  vi.stubGlobal('document', { createElement: () => canvas });
  await prepareImportPhoto(new File(['photo'], 'recipe.png', { type: 'image/png' }));
  expect([canvas.width, canvas.height]).toEqual([targetWidth, targetHeight]);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, targetWidth, targetHeight);
  expect(close).toHaveBeenCalledOnce();
});
