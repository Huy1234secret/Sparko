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
async function openServer(page: Page) {
  await page.goto('/owner/fleet');
  await page.getByRole('button', { name: /Test community/ }).click();
  await expect(page.getByRole('heading', { name: 'Modules' })).toBeVisible();
}

test('staff pause a module with a reason the server sees, and grant Plus', async ({
  page,
}) => {
  await login(page);
  // The server turns auto replies on itself.
  await page.goto(`/dashboard/${guild}/automations/replies?tab=settings`);
  await page.getByRole('switch', { name: /Send auto replies/ }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();

  await openServer(page);
  const row = page.locator('.policy-row').filter({ hasText: 'Auto replies' });
  await row.getByRole('button', { name: 'Pause…' }).click();
  await row.getByLabel(/Reason \(recorded/).fill('Spam review in progress');
  await row.getByRole('button', { name: 'Pause module' }).click();
  await expect(row.getByText('Paused by staff')).toBeVisible();

  // The server keeps its own switch but sees the pause and cannot add work.
  await page.goto(`/dashboard/${guild}/automations/replies?tab=settings`);
  await expect(page.getByText('Paused by Sparko staff')).toBeVisible();
  await expect(page.getByText(/Spam review in progress/)).toBeVisible();
  await expect(
    page.getByRole('switch', { name: /Send auto replies/ }),
  ).toBeChecked();
  await page.getByRole('tab', { name: 'New reply' }).click();
  await page.getByLabel(/^Name/).fill('Rules');
  await page.getByLabel(/^Words/).fill('rules');
  await page.getByLabel(/Sparko replies with/).fill('See the rules channel.');
  await page.getByRole('button', { name: 'Create reply' }).click();
  await expect(
    page.getByText(/Sparko staff paused this module for this server/),
  ).toBeVisible();

  await openServer(page);
  await row.getByRole('button', { name: 'Resume…' }).click();
  await row.getByLabel(/Reason \(recorded/).fill('Review finished');
  await row.getByRole('button', { name: 'Resume module' }).click();
  await expect(row.getByText('On', { exact: true })).toBeVisible();

  // A staff grant turns on Plus; the server's billing page shows it.
  await page.getByLabel('Reason', { exact: true }).fill('Community partner');
  await page.getByRole('button', { name: 'Grant Plus' }).click();
  await expect(page.getByText('Staff grant')).toBeVisible();
  await page.goto(`/dashboard/${guild}/settings/billing`);
  await expect(page.getByText('Granted by Sparko staff')).toBeVisible();
  await expect(
    page.locator('.section-heading').getByText('Plus', { exact: true }),
  ).toBeVisible();
});

test('a member sends a screenshot to support, staff reply, and the member closes it', async ({
  page,
}) => {
  await login(page);
  await page.goto('/account/support');
  await page.getByLabel(/Subject/).fill('Ticket panel error');
  await page.getByLabel('Topic').selectOption('bug');
  await page
    .getByLabel(/What can we help with/)
    .fill('The ticket panel shows an error when I press Open.');
  await page
    .locator('#support-files')
    .setInputFiles('packages/assets/media/discord/ticket.png');
  await expect(page.getByText('ticket.png')).toBeVisible();
  await page.getByRole('button', { name: 'Send to support' }).click();
  const shot = page.getByRole('img', { name: 'Screenshot: ticket.png' });
  await expect(shot).toBeVisible();
  // The stored image is a re-encoded PNG served only to its owner.
  const download = await page.request.get((await shot.getAttribute('src'))!);
  expect(download.status()).toBe(200);
  expect(download.headers()['content-type']).toBe('image/png');

  await page.goto('/owner/support');
  await page.getByRole('button', { name: /Ticket panel error/ }).click();
  await page.getByLabel('Reply').fill('Thanks, we found the cause.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('Thanks, we found the cause.')).toBeVisible();
  await page.getByRole('button', { name: /Waiting on member/ }).click();
  await expect(
    page.getByRole('button', { name: /Ticket panel error/ }),
  ).toBeVisible();

  await page.goto('/account/support');
  await page.getByRole('button', { name: /Ticket panel error/ }).click();
  await expect(page.getByText('Waiting for you').first()).toBeVisible();
  await expect(page.getByText('Sparko support', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close request' }).click();
  await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Reply')).toHaveCount(0);

  // A support-only export lists this conversation and no server records.
  await page.goto('/account/privacy');
  await page.getByLabel('What to include').selectOption('support');
  await page.getByRole('button', { name: 'Request an export' }).click();
  await expect(
    page.locator('strong', { hasText: 'Product support conversations' }),
  ).toBeVisible();
});
