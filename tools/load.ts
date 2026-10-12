import 'dotenv/config';

/**
 * Local load baseline. Signs in through the real OAuth state and callback
 * (against the browser-test server's controlled Discord), then runs a fixed
 * mix of public and signed-in reads at a set concurrency and reports latency
 * percentiles and status codes per route. It never targets production: the
 * origin must be loopback unless LOAD_ALLOW_REMOTE=true is set deliberately.
 *
 *   LOAD_ORIGIN=http://localhost:3001 LOAD_SECONDS=20 LOAD_CONCURRENCY=16 pnpm load
 */
const origin = new URL(process.env['LOAD_ORIGIN'] ?? 'http://localhost:3001');
if (
  !['localhost', '127.0.0.1', '::1'].includes(origin.hostname) &&
  process.env['LOAD_ALLOW_REMOTE'] !== 'true'
)
  throw new Error('Load runs target loopback only; see docs/quality.md.');
const seconds = Number(process.env['LOAD_SECONDS'] ?? 20),
  concurrency = Number(process.env['LOAD_CONCURRENCY'] ?? 16),
  guild = process.env['LOAD_GUILD'] ?? '123456789012345678',
  code = process.env['LOAD_OAUTH_CODE'] ?? 'controlled-test-code';

const cookies = new Map<string, string>();
const cookieHeader = () =>
  [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
function remember(response: Response) {
  for (const line of response.headers.getSetCookie()) {
    const [pair = ''] = line.split(';');
    const index = pair.indexOf('=');
    cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1));
  }
}
async function signIn() {
  const start = await fetch(new URL('/api/v1/auth/discord', origin), {
    redirect: 'manual',
  });
  remember(start);
  const state = new URL(start.headers.get('location') ?? '').searchParams.get(
    'state',
  );
  if (!state) throw new Error('Sign-in did not return an OAuth state.');
  const callback = new URL('/api/v1/auth/discord/callback', origin);
  callback.search = new URLSearchParams({ code, state }).toString();
  const done = await fetch(callback, {
    redirect: 'manual',
    headers: { cookie: cookieHeader() },
  });
  remember(done);
  if (!cookies.has('sparko')) throw new Error('Sign-in did not set a session.');
}

const routes = [
  { name: 'health', path: '/health/ready', auth: false },
  { name: 'public status', path: '/api/v1/public/status', auth: false },
  { name: 'servers', path: '/api/v1/guilds', auth: true },
  {
    name: 'server overview',
    path: `/api/v1/guilds/${guild}/overview`,
    auth: true,
  },
  {
    name: 'module settings',
    path: `/api/v1/guilds/${guild}/features/R09/config`,
    auth: true,
  },
  {
    name: 'member economy',
    path: `/api/v1/guilds/${guild}/economy/me`,
    auth: true,
  },
  { name: 'backups', path: `/api/v1/guilds/${guild}/backups`, auth: true },
];
type Sample = { ms: number; status: number };
const samples = new Map<string, Sample[]>(routes.map((r) => [r.name, []]));

async function worker(deadline: number, offset: number) {
  for (let i = offset; Date.now() < deadline; i++) {
    const route = routes[i % routes.length]!;
    const begin = performance.now();
    let status = 0;
    try {
      const response = await fetch(new URL(route.path, origin), {
        headers: route.auth ? { cookie: cookieHeader() } : {},
        signal: AbortSignal.timeout(10_000),
      });
      await response.arrayBuffer();
      status = response.status;
    } catch {
      status = 0;
    }
    samples.get(route.name)!.push({ ms: performance.now() - begin, status });
  }
}
const percentile = (sorted: number[], p: number) =>
  sorted.length
    ? sorted[
        Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
      ]!
    : 0;

await signIn();
const deadline = Date.now() + seconds * 1000;
await Promise.all(
  Array.from({ length: concurrency }, (_, i) => worker(deadline, i)),
);
let total = 0,
  failed = 0;
const rows = routes.map((route) => {
  const list = samples.get(route.name)!,
    sorted = list.map((s) => s.ms).sort((a, b) => a - b),
    codes: Record<string, number> = {};
  for (const s of list) codes[s.status] = (codes[s.status] ?? 0) + 1;
  total += list.length;
  failed += list.filter((s) => s.status === 0 || s.status >= 500).length;
  return {
    route: route.name,
    requests: list.length,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    statuses: Object.entries(codes)
      .map(([code, count]) => `${code}×${count}`)
      .join(' '),
  };
});
console.table(rows);
console.log(
  `${total} requests in ${seconds}s at concurrency ${concurrency} ` +
    `(${Math.round(total / seconds)} req/s); ${failed} errors or 5xx.`,
);
if (failed) process.exit(1);
