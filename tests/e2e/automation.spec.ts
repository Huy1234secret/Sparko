import { test, expect, type Page } from '@playwright/test';

const guild = '123456789012345678';
const channel = '623456789012345678';
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
async function turnOn(page: Page, path: string, label: RegExp) {
  await page.goto(`/dashboard/${guild}/${path}?tab=settings`);
  await page.getByRole('switch', { name: label }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();
}
const local = (offsetMs: number) => {
  const date = new Date(Date.now() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

test('a poll is voted on from the member profile and closed by staff', async ({
  page,
}) => {
  await login(page);
  await turnOn(page, 'community/polls', /Allow polls/);
  await page.getByRole('tab', { name: 'New poll' }).click();
  await page.getByLabel(/^Question/).fill('Next game night?');
  await page.getByLabel('Choice 1').fill('Friday');
  await page.getByLabel('Choice 2').fill('Saturday');
  await page.getByLabel(/Voting closes/).fill(local(86_400_000));
  await page.getByRole('button', { name: 'Start poll' }).click();
  await expect(
    page.getByRole('heading', { name: 'Next game night?' }),
  ).toBeVisible();

  await page.goto(`/servers/${guild}/me`);
  await page.getByRole('radio', { name: 'Saturday' }).check();
  await page.getByRole('button', { name: 'Vote', exact: true }).click();
  await expect(page.getByText('Vote recorded.')).toBeVisible();
  await expect(page.getByText('your vote')).toBeVisible();

  await page.goto(`/dashboard/${guild}/community/polls`);
  await expect(page.getByText(/1 voter\b/)).toBeVisible();
  await page.getByRole('button', { name: 'Close voting now' }).click();
  await expect(page.getByText('Closed', { exact: true })).toBeVisible();
  await page.goto(`/servers/${guild}/me`);
  await expect(page.getByText('No open polls')).toBeVisible();
});

test('a workflow is built from typed steps, runs once and posts through the worker', async ({
  page,
  request,
}) => {
  await login(page);
  await turnOn(page, 'automations/workflows', /Run workflows/);
  await page.getByRole('tab', { name: 'New workflow' }).click();
  await page.getByLabel(/^Name/).fill('Greeter');
  await page.getByLabel('Channel').selectOption(channel);
  await page.getByLabel(/^Message/).fill('Welcome aboard from a workflow');
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step 2', { exact: true }).selectOption('wait');
  await page.getByLabel('Wait for').fill('1');
  await page.getByLabel('Unit').selectOption('60');
  const dryRun = page.getByRole('list', { name: 'Dry run' });
  await expect(dryRun.getByText('Wait 1 minute')).toBeVisible();
  await expect(page.getByText('1 of 5 actions used.')).toBeVisible();
  await page.getByRole('button', { name: 'Create workflow' }).click();
  await expect(page.getByText('Greeter', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Only when staff run it · 2 steps/),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Run for me' }).click();
  await expect(page.getByRole('tab', { name: 'Runs' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The send step completes through the real worker; the run then waits.
  await expect(page.getByText(/Waiting until/)).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText(/1 action\b/)).toBeVisible();
  const state = (await (
    await request.get('http://localhost:3001/__test/state')
  ).json()) as { messages: { channel_id: string; content: string }[] };
  expect(
    state.messages.filter(
      (message) =>
        message.channel_id === channel &&
        message.content === 'Welcome aboard from a workflow',
    ),
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
});

test('a member sets a repeating reminder and cancels it', async ({ page }) => {
  await login(page);
  await turnOn(page, 'automations/reminders', /Allow reminders/);
  await page.goto(`/servers/${guild}/me`);
  await page.getByRole('button', { name: 'New reminder' }).click();
  await page.getByLabel(/Remind about/).fill('Stretch');
  await page.getByLabel(/^When/).fill(local(3_600_000));
  await page.getByLabel('Repeat').selectOption('daily');
  await page.getByRole('button', { name: 'Set reminder' }).click();
  await expect(page.getByText('Stretch')).toBeVisible();
  await expect(page.getByText(/Direct message · Every day at/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
});
