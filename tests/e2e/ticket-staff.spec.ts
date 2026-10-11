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

// Runs after ticket-journey.spec.ts, which publishes the ticket panel.
test('staff set timers, availability, priority and assignment on a new ticket', async ({
  page,
  request,
}) => {
  await login(page);
  await page.goto(`/dashboard/${guild}/support/tickets/config`);
  await page.getByLabel(/Remind staff after/).fill('15');
  await page.getByLabel(/Escalate after/).fill('60');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /Settings saved/ }),
  ).toBeVisible();

  const before = await (
    await request.get('http://localhost:3001/__test/state')
  ).json();
  const known = new Set(
    before.publications.map((record: { id: string }) => record.id),
  );
  await page
    .getByLabel('Publish destination')
    .selectOption('623456789012345678');
  await page.getByRole('button', { name: 'Publish ticket panel' }).click();
  let panelId = '';
  await expect
    .poll(async () => {
      const latest = await (
        await request.get('http://localhost:3001/__test/state')
      ).json();
      panelId =
        latest.publications.find(
          (record: { id: string; state: string; document: unknown }) =>
            !known.has(record.id) &&
            record.state === 'applied' &&
            JSON.stringify(record.document).includes('ticket.create'),
        )?.id ?? '';
      return panelId;
    })
    .not.toBe('');
  const response = await request.post(
    'http://localhost:3001/__test/discord/ticket',
    {
      data: {
        publicationId: panelId,
        interactionId: 'browser-staff-workflow',
        answers: { 'question-1': 'My order never arrived' },
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const { ticket } = await response.json();
  expect(ticket.state).not.toBe('closed');
  await expect
    .poll(async () => {
      const latest = await (
        await request.get('http://localhost:3001/__test/state')
      ).json();
      return latest.outbox
        .filter(
          (job: { type: string; payload: { ticketId: string } }) =>
            job.type === 'ticket.sla' && job.payload.ticketId === ticket.id,
        )
        .map((job: { payload: { stage: string } }) => job.payload.stage)
        .sort();
    })
    .toEqual(['escalation', 'reminder']);

  await page.goto(`/dashboard/${guild}/support/tickets`);
  await page
    .getByRole('group', { name: 'Your availability' })
    .getByRole('button', { name: 'Available' })
    .click();
  await expect(
    page
      .getByRole('group', { name: 'Your availability' })
      .getByRole('button', { name: 'Available' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('link', { name: `Open ticket ${ticket.number}` })
    .click();
  await page.getByLabel('Priority').selectOption('urgent');
  await expect(page.getByText('Urgent priority')).toBeVisible();
  await page.getByLabel('Assign to').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Assign ticket' }).click();
  await expect(page.getByText('Claimed', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Mark as waiting for the member' })
    .click();
  await expect(
    page.getByText('Waiting for the member', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'The member replied' }).click();
  await expect(page.getByText('Claimed', { exact: true })).toBeVisible();
});
