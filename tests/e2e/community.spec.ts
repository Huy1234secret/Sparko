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
    page.getByRole('heading', { name: 'Make yourself at home.' }),
  ).toBeVisible({ timeout: 15000 });
}
function localInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test('typed level settings save with revision and the member card is rendered by the server', async ({
  page,
}) => {
  await login(page);
  await page.goto(`/dashboard/${guild}/engagement/levels`);
  await page.getByRole('switch', { name: /Award XP for messages/ }).check();
  await page.getByLabel('Base XP').fill('120');
  await expect(
    page.getByRole('table', { name: 'Total XP needed per level' }),
  ).toContainText('1,100');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Base XP')).toHaveValue('120');
  await expect(
    page.getByRole('switch', { name: /Award XP for messages/ }),
  ).toBeChecked();

  await page.goto(`/servers/${guild}/me`);
  const card = page.getByRole('img', { name: /Test admin · Level 0/ });
  await expect(card).toBeVisible();
  expect(
    await card.evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBe(900);
  await page.getByRole('switch', { name: /Show XP and progress/ }).uncheck();
  await page.getByLabel('Layout').selectOption('compact');
  await page.getByRole('button', { name: 'Save card preferences' }).click();
  const compact = page.getByRole('img', { name: 'Test admin · Level 0' });
  await expect(compact).toBeVisible();
  // The re-rendered PNG replaces the previous image once it loads.
  await expect
    .poll(() =>
      compact.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(640);
});

test('a giveaway opens only after Discord shows it, and a member can enter once', async ({
  page,
}) => {
  await login(page);
  await page.goto(`/dashboard/${guild}/engagement/giveaways?tab=settings`);
  await page.getByRole('switch', { name: /Allow giveaways/ }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'New giveaway' }).click();
  await page
    .getByLabel('Prize', { exact: true })
    .fill('Community sticker pack');
  await page.getByLabel('Channel').selectOption({ label: '# support' });
  await page
    .getByLabel('Ends at')
    .fill(localInput(new Date(Date.now() + 2 * 86_400_000)));
  await page.getByRole('button', { name: 'Start giveaway' }).click();
  await expect(page.getByRole('tab', { name: 'Giveaways' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: /Community sticker pack/ }).click();
  // The worker posts the message through the controlled Discord boundary.
  await expect(page.getByText('Open', { exact: true }).first()).toBeVisible({
    timeout: 20000,
  });

  await page.goto(`/servers/${guild}/me`);
  const enter = page.getByRole('button', { name: 'Enter', exact: true });
  await enter.click();
  await expect(page.getByRole('button', { name: 'Entered' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entered' })).toBeDisabled();
});

test('role menus offer no role Sparko cannot grant and analytics never invent zeros', async ({
  page,
}) => {
  await login(page);
  await page.goto(`/dashboard/${guild}/community/roles?tab=new`);
  await expect(
    page.getByText('No roles can be granted yet.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add role' })).toBeDisabled();

  await page.goto(`/dashboard/${guild}/community/autoroles`);
  await expect(
    page.getByText('Support — above Sparko’s role, cannot be assigned').first(),
  ).toBeVisible();

  await page.goto(`/dashboard/${guild}/insights/analytics`);
  await expect(page.getByText('Not collected', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Messages were not observed in this range'),
  ).toBeVisible();
  await expect(page.getByText(/^0 of \d+ hours observed$/)).toBeVisible();
});
