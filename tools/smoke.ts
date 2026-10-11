import 'dotenv/config';

const value = process.env['SMOKE_ORIGIN'] ?? process.env['PUBLIC_APP_URL'];
if (!value) throw new Error('Set SMOKE_ORIGIN or PUBLIC_APP_URL.');
let origin: URL;
try {
  origin = new URL(value);
} catch {
  throw new Error(
    'SMOKE_ORIGIN or PUBLIC_APP_URL must be a valid HTTP(S) origin.',
  );
}
if (
  !['http:', 'https:'].includes(origin.protocol) ||
  origin.username ||
  origin.password
)
  throw new Error(
    'Smoke origin must be an HTTP(S) origin without credentials.',
  );
async function check(path: string, status: number, type: string) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(10000),
    redirect: 'manual',
  });
  if (response.status !== status)
    throw new Error(`${path} returned ${response.status}; expected ${status}.`);
  if (!response.headers.get('content-type')?.includes(type))
    throw new Error(
      `${path} returned the wrong content type; check proxy routing.`,
    );
  console.log(`${path} ${response.status}`);
  return response;
}
await check('/health/live', 200, 'application/json');
await check('/health/ready', 200, 'application/json');
const status = await check('/api/v1/public/status', 200, 'application/json');
const statusBody = (await status.json()) as { data?: { status?: string } };
if (
  !['operational', 'degraded', 'unavailable', 'unknown'].includes(
    statusBody.data?.status ?? '',
  )
)
  throw new Error('Public status response has no truthful status field.');
console.log('Observed service state: ' + statusBody.data?.status);
await check('/api/v1/smoke-route-that-does-not-exist', 404, 'application/json');
const home = await check('/', 200, 'text/html');
if (!(await home.text()).includes('id="root"'))
  throw new Error('Web app root is missing.');
if (process.env['SMOKE_CHECK_PROXY'] === 'true') {
  const dashboard = await check('/dashboard', 200, 'text/html');
  if (
    dashboard.headers.get('cache-control') !== 'no-store' ||
    dashboard.headers.get('x-robots-tag') !== 'noindex,nofollow'
  )
    throw new Error('Private web route lacks no-store/noindex headers.');
  if (
    !dashboard.headers.get('content-security-policy') ||
    dashboard.headers.get('x-content-type-options') !== 'nosniff'
  )
    throw new Error('Proxy security headers are missing.');
  await check('/assets/smoke-missing-asset.js', 404, 'text/html');
}
console.log(
  'Smoke passed. OAuth, Gateway connectivity, and provider delivery require their separate authorized live checks.',
);
