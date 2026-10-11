import { createHash } from 'node:crypto';
import sharp from 'sharp';
export const IMAGE_UPLOAD_LIMIT = 4 * 1024 * 1024;
/** Re-encode a bounded static raster; metadata, markup, and external references cannot survive. */
export async function normalizeUploadedImage(input: Uint8Array) {
  if (input.byteLength < 12 || input.byteLength > IMAGE_UPLOAD_LIMIT)
    throw new Error(
      'Choose a static PNG, JPEG or WebP image smaller than 4 MiB.',
    );
  const bytes = Buffer.from(input);
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp =
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!png && !jpeg && !webp)
    throw new Error(
      'Active SVG, HTML, animation and other file formats are unsupported.',
    );
  const decoder = sharp(bytes, {
    limitInputPixels: 4_194_304,
    failOn: 'warning',
  });
  const metadata = await decoder.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > 2048 ||
    metadata.height > 2048 ||
    (metadata.pages ?? 1) !== 1
  )
    throw new Error(
      'Images must be static and no larger than 2048 × 2048 pixels.',
    );
  const result = await decoder
    .rotate()
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  if (result.data.byteLength > IMAGE_UPLOAD_LIMIT)
    throw new Error('The normalized image exceeds the 4 MiB media budget.');
  return {
    buffer: result.data,
    hash: createHash('sha256').update(result.data).digest('hex'),
    bytes: result.data.byteLength,
    width: result.info.width,
    height: result.info.height,
    mime: 'image/png' as const,
  };
}
