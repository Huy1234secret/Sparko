import { test, expect, type Page } from '@playwright/test';

const guild = '123456789012345678';
async function login(page: Page) {
  // Keep the actual OAuth state, callback and cookie handling; replace only Discord.
  await page.route(/\/api\/v1\/auth\/discord\?/, async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const url = new URL(response.headers()['location'] ?? '');
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        location: `http://localhost:5173/api/v1/auth/discord/callback?code=controlled-test-code&state=${encodeURIComponent(url.searchParams.get('state') ?? '')}`,
      },
      body: '',
    });
  });
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Continue with Discord' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your servers', level: 1 }),
  ).toBeVisible({ timeout: 15000 });
}
const limit = (page: Page) =>
  page.getByLabel('Commendations per member per day');
async function saveReputation(page: Page, value: string) {
  await page.goto(`/dashboard/${guild}/engagement/reputation?tab=settings`);
  await page.getByRole('switch', { name: /Allow commendations/ }).check();
  await limit(page).fill(value);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();
}

test('staff back up settings, download the file, and restore after a change', async ({
  page,
}) => {
  await login(page);
  await saveReputation(page, '4');

  await page.goto(`/dashboard/${guild}/settings/backups`);
  await expect(page.getByText('Only module settings are copied')).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Before the event');
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByText('Saved “Before the event”.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Before the event' }).click();
  const file = JSON.parse(
    await (await download).createReadStream().then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString('utf8');
    }),
  ) as { format: string; features: { featureId: string }[] };
  expect(file.format).toBe('sparko.config-backup');
  expect(file.features.map((f) => f.featureId)).toContain('R68');

  await saveReputation(page, '9');
  await page.goto(`/dashboard/${guild}/settings/backups`);
  await page.getByRole('button', { name: 'Restore…' }).first().click();
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Reputation' }),
  ).toBeChecked();
  await page.getByRole('button', { name: /^Restore \d+ module/ }).click();
  await expect(page.getByText('Settings restored')).toBeVisible();

  await page.goto(`/dashboard/${guild}/engagement/reputation?tab=settings`);
  await expect(limit(page)).toHaveValue('4');
});

test('a public widget is unavailable until staff publish it', async ({
  page,
  request,
}) => {
  await login(page);
  const status = `/api/v1/public/widgets/${guild}/status`;
  expect((await request.get(status)).status()).toBe(404);
  await page.goto(`/dashboard/${guild}/settings/widgets?tab=settings`);
  await expect(
    page.getByText('Anyone with the link can read these'),
  ).toBeVisible();
  await page.getByRole('switch', { name: /Turn on public widgets/ }).check();
  await page.getByRole('switch', { name: 'Publish server status' }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();
  const published = await request.get(status);
  expect(published.status()).toBe(200);
  expect(Object.keys((await published.json()).data).sort()).toEqual([
    'guildId',
    'installed',
    'observedAt',
  ]);
  expect(
    (await request.get(`/api/v1/public/widgets/${guild}/leaderboard`)).status(),
  ).toBe(404);
  await page.getByRole('tab', { name: 'Links' }).click();
  await expect(page.getByText('Public', { exact: true })).toBeVisible();
  await expect(page.getByText('Not public')).toBeVisible();
});
