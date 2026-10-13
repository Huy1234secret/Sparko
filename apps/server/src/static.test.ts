import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from './static.ts';

let server: Server;
let base: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'sparko-web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(
    join(root, 'index.html'),
    '<!doctype html><title>Sparko</title>',
  );
  writeFileSync(join(root, 'assets', 'app-abc.js'), 'console.log(1)');
  writeFileSync(join(root, 'robots.txt'), 'User-agent: *');
  writeFileSync(join(tmpdir(), 'secret.txt'), 'nope');
  const handle = createHandler(root);
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

describe('website server', () => {
  it('serves built files, caching hashed assets for a year', async () => {
    const res = await fetch(`${base}/assets/app-abc.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(await res.text()).toBe('console.log(1)');
  });

  it('answers every page address with the app, and hides private pages from search', async () => {
    const home = await fetch(`${base}/pricing`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('<title>Sparko</title>');
    expect(home.headers.get('cache-control')).toBe('no-cache');
    expect(home.headers.get('x-robots-tag')).toBeNull();
    const dash = await fetch(`${base}/dashboard/123/tickets`);
    expect(dash.status).toBe(200);
    expect(dash.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(dash.headers.get('x-frame-options')).toBe('DENY');
  });

  it('404s missing files and refuses paths outside the build', async () => {
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${base}/..%2Fsecret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/robots.txt`)).status).toBe(200);
  });

  it('reports health and rejects writes', async () => {
    const health = await fetch(`${base}/healthz`);
    expect(await health.text()).toBe('ok');
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405);
  });
});
