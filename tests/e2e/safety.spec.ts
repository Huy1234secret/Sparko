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

test('safety staff test a rule without punishing, review private reports and publish a form', async ({
  page,
}) => {
  await login(page);

  // Auto moderation: a rule is tested by the server engine and nothing is enforced.
  await page.goto(`/dashboard/${guild}/safety/automod`);
  await page.getByRole('switch', { name: /Check new messages/ }).check();
  await page.getByRole('button', { name: 'Add rule' }).click();
  await page.getByLabel('Rule name').fill('No invite links');
  await page.getByLabel('Sample message').fill('join discord.gg/sparko now');
  await page.getByRole('button', { name: 'Run test' }).click();
  await expect(
    page.getByText(/Matches — the bot would: Only record an incident/),
  ).toBeVisible();
  await expect(page.getByText(/nothing was enforced/)).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'No invite links' }),
  ).toBeVisible();

  // Reports: enable intake, send one privately, find it in the staff queue.
  await page.goto(`/dashboard/${guild}/safety/reports?tab=settings`);
  await page
    .getByRole('switch', { name: /Accept reports and appeals/ })
    .check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();
  await page.goto(`/servers/${guild}/me`);
  await page.getByLabel(/Subject/).fill('Spam in general');
  await page
    .getByLabel(/What happened/)
    .fill('Someone keeps posting invite links in general.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText(/Report sent privately/)).toBeVisible();
  await expect(page.getByText('You have no moderation cases')).toBeVisible();
  await page.goto(`/dashboard/${guild}/safety/reports`);
  await page.getByRole('button', { name: /Spam in general/ }).click();
  await page.getByLabel(/Reason/).fill('Checking the channel history');
  await page.getByRole('button', { name: 'Record decision' }).click();
  // Reviewers cannot decide their own report; the server says so.
  await expect(
    page.getByText('You cannot decide your own intake.'),
  ).toBeVisible();

  // Forms: a saved draft can be published, and stays published after reload.
  await page.goto(`/dashboard/${guild}/support/forms?tab=forms`);
  await page.getByRole('link', { name: 'Turn on forms in Settings' }).click();
  await page.getByRole('switch', { name: /Accept form submissions/ }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Forms' }).click();
  await page.getByRole('button', { name: 'New form' }).click();
  await page.getByLabel('Form name').fill('Moderator application');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Published v1').first()).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: /Moderator application/ }),
  ).toContainText('Published');
});
