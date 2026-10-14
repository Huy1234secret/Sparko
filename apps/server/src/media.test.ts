import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMedia, maxUpload } from './media.ts';
import { BadRequest } from './http.ts';

const media = createMedia({
  dir: mkdtempSync(join(tmpdir(), 'sparko-media-')),
  publicUrl: 'http://site.test/',
});
let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    const run = async () => {
      if (req.url === '/upload') {
        try {
          const { url } = await media.save(req, '9001');
          res.end(new URL(url).pathname);
        } catch (e) {
          res.writeHead(e instanceof BadRequest ? 400 : 500).end();
        }
        return;
      }
      if (!(await media.handle(req, res))) res.writeHead(418).end();
    };
    void run();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20, 1)]);

describe('uploaded pictures', () => {
  it('keeps a picture and serves it back with its real type', async () => {
    const path = await (
      await fetch(`${base}/upload`, { method: 'POST', body: gif })
    ).text();
    expect(path).toMatch(/^\/media\/9001-[0-9a-f]{24}\.gif$/);
    const res = await fetch(base + path);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/gif');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer()).equals(gif)).toBe(true);
  });

  it('turns away files that are too big or aren’t pictures', async () => {
    const big = await fetch(`${base}/upload`, {
      method: 'POST',
      body: Buffer.concat([gif, Buffer.alloc(maxUpload)]),
    });
    expect(big.status).toBe(400);
    const html = await fetch(`${base}/upload`, {
      method: 'POST',
      body: '<svg onload=alert(1)>',
    });
    expect(html.status).toBe(400);
  });

  it('only serves names it could have made', async () => {
    expect((await fetch(`${base}/media/../secret.png`)).status).toBe(418);
    expect(
      (await fetch(`${base}/media/9001-${'0'.repeat(24)}.png`)).status,
    ).toBe(404);
  });
});
