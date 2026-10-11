import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { normalizeUploadedImage } from './uploads.js';

describe('bounded, metadata-free image uploads', () => {
  it('normalizes actual raster bytes into stable PNG content with a verified digest', async () => {
    const original = await readFile(
      new URL('../../assets/media/discord/ticket.png', import.meta.url),
    );
    const result = await normalizeUploadedImage(original);
    expect(result.mime).toBe('image/png');
    expect(result.width).toBeGreaterThan(0);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect((await normalizeUploadedImage(result.buffer)).hash).toBe(
      result.hash,
    );
  });
  it('rejects markup, disguised raster formats, corrupted bytes and oversized uploads before publication', async () => {
    await expect(
      normalizeUploadedImage(
        Buffer.from('<svg><script>alert(1)</script></svg>'),
      ),
    ).rejects.toThrow('unsupported');
    await expect(
      normalizeUploadedImage(Buffer.from('a harmless text document.png')),
    ).rejects.toThrow('unsupported');
    await expect(
      normalizeUploadedImage(Buffer.alloc(4 * 1024 * 1024 + 1)),
    ).rejects.toThrow('4 MiB');
    await expect(
      normalizeUploadedImage(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
      ),
    ).rejects.toThrow();
  });
});
