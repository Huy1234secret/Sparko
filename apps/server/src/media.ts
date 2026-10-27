import { randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { BadRequest } from './http.ts';

/**
 * Pictures uploaded in Message Studio. Discord fetches embed images from a
 * public link, so they're kept on disk and served at /media/<name>.
 */
export const maxUpload = 5 * 1024 * 1024;

const kinds: { ext: string; type: string; magic: (b: Buffer) => boolean }[] = [
  {
    ext: 'png',
    type: 'image/png',
    magic: (b) =>
      b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  {
    ext: 'jpg',
    type: 'image/jpeg',
    magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'gif',
    type: 'image/gif',
    magic: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  },
  {
    ext: 'webp',
    type: 'image/webp',
    magic: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

export type Media = ReturnType<typeof createMedia>;

export function createMedia({
  dir,
  publicUrl,
}: {
  dir: string;
  publicUrl: string;
}) {
  mkdirSync(dir, { recursive: true });
  const base = publicUrl.replace(/\/$/, '');

  /** Reads an upload from the request and returns its public link. */
  async function save(req: IncomingMessage, guildId: string) {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > maxUpload)
      throw new BadRequest('Pictures can be up to 5 MB.');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > maxUpload) throw new BadRequest('Pictures can be up to 5 MB.');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    // The bytes decide the type, whatever the request says it is.
    const kind = kinds.find((k) => k.magic(bytes));
    if (!kind) throw new BadRequest('Upload a PNG, JPEG, GIF or WebP picture.');
    const name = `${guildId}-${randomBytes(12).toString('hex')}.${kind.ext}`;
    await writeFile(join(dir, name), bytes, { flag: 'wx' });
    return { url: `${base}/media/${name}` };
  }

  /** Serves /media/<name>; anything else is left for the next handler. */
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const match = req.url?.match(
      /^\/media\/(\d{1,25}-[0-9a-f]{24}\.(png|jpg|gif|webp))(?:\?.*)?$/,
    );
    if (!match || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
    const path = join(dir, match[1]!);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      res.writeHead(404).end();
      return true;
    }
    res.writeHead(200, {
      'Content-Type': kinds.find((k) => k.ext === match[2])!.type,
      'Content-Length': info.size,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      // Image studio draws uploads onto a canvas and saves it, which the
      // browser only allows for pictures shared this way.
      'Access-Control-Allow-Origin': '*',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(path).pipe(res);
    return true;
  }

  return { save, handle };
}
