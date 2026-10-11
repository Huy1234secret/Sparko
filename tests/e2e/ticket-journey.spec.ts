import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

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

test('OAuth, pending settings, publication, restart-safe bot control, private ticket and closure', async ({
  page,
  request,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Open workspace' }).click();
  await page.getByRole('link', { name: 'Guided setup' }).first().click();
  await page.getByRole('button', { name: 'Review setup' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your configuration preview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Apply these settings' }).click();
  await page.getByRole('link', { name: 'Continue to tickets' }).click();
  await request.post('http://localhost:3001/__test/worker', {
    data: { paused: true },
  });
  await page.getByRole('switch', { name: /Enable tickets/ }).check();
  await page
    .getByLabel('Panel channel', { exact: true })
    .selectOption('623456789012345678');
  await page.getByLabel('Support', { exact: true }).check();
  await page.getByRole('button', { name: 'Add form question' }).click();
  await page
    .getByLabel('Question', { exact: true })
    .fill('What can we help you with?');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByText('Settings saved. Waiting for the bot to apply them.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel('Publish destination')
    .selectOption('623456789012345678');
  await page.getByRole('button', { name: 'Publish ticket panel' }).click();
  await expect(
    page.getByText('Publication saved. Waiting for Discord delivery.', {
      exact: true,
    }),
  ).toBeVisible();
  await request.post('http://localhost:3001/__test/worker', {
    data: { paused: false },
  });
  let publicationId = '';
  await expect
    .poll(async () => {
      const state = await (
        await request.get('http://localhost:3001/__test/state')
      ).json();
      const publication = state.publications.find((record: { state: string }) =>
        ['applied', 'published'].includes(record.state),
      );
      publicationId = publication?.id ?? '';
      return publicationId;
    })
    .not.toBe('');
  await request.post('http://localhost:3001/__test/restart-bot');
  const response = await request.post(
    'http://localhost:3001/__test/discord/ticket',
    {
      data: {
        publicationId,
        interactionId: 'browser-ticket-control',
        answers: { 'question-1': 'Please help with my application' },
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const created = await response.json();
  expect(created.ticket).toBeTruthy();
  expect(created.replies.join(' ')).toContain('Ticket requested');
  expect(created.modalShown).toBeTruthy();
  expect(created.ticket.answers['question-1']).toBe(
    'Please help with my application',
  );
  await expect
    .poll(async () => {
      const state = await (
        await request.get('http://localhost:3001/__test/state')
      ).json();
      return state.tickets[0]?.state;
    })
    .toBe('open');
  await page.goto(`/dashboard/${guild}/support/tickets`);
  await page.getByRole('link', { name: 'Open ticket 1' }).click();
  await page.getByRole('button', { name: 'Claim ticket' }).click();
  await expect(page.getByText('claimed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close ticket', exact: true }).click();
  await page
    .getByLabel('Closure reason')
    .fill('Resolved in the browser acceptance journey');
  await page.getByRole('button', { name: 'Close this ticket' }).focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => {
      const state = await (
        await request.get('http://localhost:3001/__test/state')
      ).json();
      return state.tickets[0]?.state;
    })
    .toBe('closed');
  await page.reload();
  await expect(page.getByText('closed', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download transcript' }),
  ).toBeVisible();
  const transcriptDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download transcript' }).click();
  const downloaded = await transcriptDownload;
  expect(downloaded.suggestedFilename()).toBe(
    'sparko-ticket-1-transcript.json',
  );
  expect(await downloaded.failure()).toBeNull();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath('ticket-desktop.png'),
    fullPage: false,
    animations: 'disabled',
  });
});

test('mobile navigation and Studio retain keyboard focus with reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.goto(`/dashboard/${guild}/messages/studio`);
  await expect(
    page.getByRole('heading', { name: 'Make it feel like your community.' }),
  ).toBeVisible();
  const mobileLayout = await page.evaluate(() => ({
    width: window.innerWidth,
    contentWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('*')]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > window.innerWidth + 1,
      )
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        right: element.getBoundingClientRect().right,
      }))
      .slice(0, 15),
  }));
  expect(
    mobileLayout.contentWidth,
    JSON.stringify(mobileLayout),
  ).toBeLessThanOrEqual(mobileLayout.width);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath('studio-mobile.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /Open navigation|Open menu/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeFocused();
});

test('Studio applies compatible edits and replaces changed control meaning deliberately', async ({
  page,
  request,
}) => {
  await login(page);
  await page.goto(`/dashboard/${guild}/messages/studio`);
  await page.getByRole('button', { name: 'Edit publication' }).first().click();
  await page.getByRole('button', { name: /^Text ## Sparko support/ }).click();
  await page
    .getByLabel('Text', { exact: true })
    .fill('## Updated support welcome');
  await page.getByRole('button', { name: 'Update published message' }).click();
  await expect(page.getByText(/Publication update saved/)).toBeVisible();
  await expect
    .poll(async () => {
      const state = await (
        await request.get('http://localhost:3001/__test/state')
      ).json();
      return state.publications[0]?.appliedRevision;
    })
    .toBe(2);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page
    .getByLabel('When a member uses this control')
    .selectOption('response.private');
  await page
    .getByLabel('Response text')
    .fill('Your support team is available in the dashboard.');
  await page.getByRole('button', { name: 'Apply control action' }).click();
  await page.getByRole('button', { name: 'Review replacement' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Replace this published message?' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Existing controls will be revoked; a replacement message receives new controls.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Replace published message' }).click();
  await expect
    .poll(async () => {
      const state = await (
        await request.get('http://localhost:3001/__test/state')
      ).json();
      return {
        total: state.publications.length,
        applied: state.publications.filter(
          (item: { state: string }) => item.state === 'applied',
        ).length,
        replaced: state.publications.filter(
          (item: { state: string }) => item.state === 'replaced',
        ).length,
      };
    })
    .toEqual({ total: 2, applied: 1, replaced: 1 });
  const state = await (
    await request.get('http://localhost:3001/__test/state')
  ).json();
  expect(state.publications).toHaveLength(2);
  expect(
    state.publications.some(
      (item: { state: string }) => item.state === 'replaced',
    ),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath('studio-desktop.png'),
    fullPage: false,
    animations: 'disabled',
  });
});

test('media library requires public sharing consent and inserts a validated attachment reference', async ({
  page,
  request,
}) => {
  await login(page);
  await page.goto(`/dashboard/${guild}/messages/studio`);
  await page
    .getByRole('button', { name: 'Media library', exact: true })
    .click();
  await page
    .getByLabel('Image file')
    .setInputFiles(resolve('packages/assets/media/discord/ticket.png'));
  await page.getByLabel('Image name').fill('Support spark');
  await page
    .getByLabel('Alternative text')
    .fill('Yellow Sparko support ticket illustration');
  await page.getByLabel('Who can view this image?').selectOption('public');
  await expect(
    page.getByRole('button', { name: 'Upload image' }),
  ).toBeDisabled();
  await page
    .getByRole('checkbox', {
      name: 'I allow members and visitors with this link to view this image.',
    })
    .check();
  await page.getByRole('button', { name: 'Upload image' }).click();
  await expect(page.getByText('Image added to your library.')).toBeVisible();
  await page.getByRole('button', { name: 'Use this image' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Payload', exact: true }).click();
  await expect(page.locator('.payload-inspector')).toContainText(
    'attachment://sparko-',
  );
  await expect(
    page.getByRole('img', {
      name: 'Yellow Sparko support ticket illustration',
    }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        await page
          .getByRole('img', {
            name: 'Yellow Sparko support ticket illustration',
          })
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement && image.naturalWidth > 0,
          ),
    )
    .toBeTruthy();
  await page
    .getByLabel('Discord destination')
    .selectOption('623456789012345678');
  await page.getByRole('button', { name: 'Send test', exact: true }).click();
  await expect
    .poll(async () => {
      const state = await (
        await request.get('http://localhost:3001/__test/state')
      ).json();
      return state.uploadedFiles.length;
    })
    .toBeGreaterThan(0);
});
