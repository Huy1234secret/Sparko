import { test, expect, type Page } from '@playwright/test';

const guild = '123456789012345678';
const admin = '323456789012345678';
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

test('staff stock the shop and a member earns, buys and plays trivia across a reload', async ({
  page,
}) => {
  await login(page);
  await turnOn(page, 'engagement/economy', /Turn on the economy/);
  await turnOn(page, 'engagement/rewards', /Pay daily and work rewards/);
  await turnOn(page, 'engagement/shop', /Open the shop/);
  await turnOn(page, 'engagement/games', /Turn on trivia/);

  // Staff: a limited item, a grant and a trivia question, all without JSON.
  await page.goto(`/dashboard/${guild}/engagement/shop?tab=new`);
  await page.getByLabel('Name', { exact: true }).fill('Golden badge');
  await page.getByLabel(/^Item ID/).fill('golden-badge');
  await page.getByLabel('Price').fill('50');
  await page.getByRole('switch', { name: 'Limited stock' }).check();
  await page.getByLabel('In stock').fill('2');
  await page.getByRole('button', { name: 'Add to shop' }).click();
  await expect(page.getByText(/Golden badge/).first()).toBeVisible();
  await expect(page.getByText(/2 in stock/)).toBeVisible();

  await page.goto(`/dashboard/${guild}/engagement/economy`);
  await expect(page.getByText(/accounts match the ledger/)).toBeVisible();
  await page.getByLabel(/^Member \(Discord user ID\)/).fill(admin);
  await page.getByLabel('Amount').fill('25');
  await page.getByLabel(/^Reason/).fill('Event prize');
  await page.getByRole('button', { name: 'Grant' }).click();
  await expect(page.getByText('Granted and recorded.')).toBeVisible();

  await page.goto(`/dashboard/${guild}/engagement/games`);
  await page
    .getByLabel('Question', { exact: true })
    .fill('Sparko’s brand colour?');
  await page.getByLabel(/^Question ID/).fill('brand-colour');
  await page.getByLabel('Choice 1', { exact: true }).fill('Yellow');
  await page.getByLabel('Choice 2', { exact: true }).fill('Purple');
  await page.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByText('Answer: Yellow')).toBeVisible();

  // Member: claim, buy, then see the order and item.
  await page.goto(`/servers/${guild}/economy`);
  await expect(page.getByText('25 Sparks').first()).toBeVisible();
  await page.getByRole('button', { name: 'Claim' }).click();
  await expect(page.getByText('+100 Sparks added')).toBeVisible();
  await expect(page.getByText('125 Sparks').first()).toBeVisible();
  await expect(page.getByText(/Daily reward.*ready in/)).toBeVisible();

  await page.getByRole('tab', { name: 'Shop' }).click();
  await page.getByRole('button', { name: 'Buy for 50 Sparks' }).click();
  await expect(page.getByText('Bought. It’s in your inventory.')).toBeVisible();
  await expect(page.getByText('1 left')).toBeVisible();
  await page.getByRole('tab', { name: 'Inventory' }).click();
  await expect(page.getByText(/Golden badge\s*× 1/).first()).toBeVisible();
  await expect(page.getByText('Delivered')).toBeVisible();

  // Trivia survives a reload: the open question comes back, answer hidden.
  await page.getByRole('tab', { name: 'Trivia' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByText('Sparko’s brand colour?')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Sparko’s brand colour?')).toBeVisible();
  await page.getByRole('radio', { name: 'Yellow' }).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Answer: Yellow')).toBeVisible();
  await expect(page.getByText('Correct')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();

  // The ledger still balances after every movement.
  await page.goto(`/dashboard/${guild}/engagement/economy`);
  await expect(page.getByText(/accounts match the ledger/)).toBeVisible();
});

test('staff add a GitHub release source with honest provider status, then turn it off', async ({
  page,
}) => {
  await login(page);
  await turnOn(page, 'automations/social', /Turn on social alerts/);
  await page.goto(`/dashboard/${guild}/automations/social`);
  await expect(page.getByText('No alert sources yet')).toBeVisible();
  const status = page.getByRole('listitem').filter({ hasText: 'YouTube' });
  await expect(status.getByText('Needs operator setup')).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'GitHub releases' })
      .getByText('Ready'),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'New source' }).click();
  await page.getByLabel('Owner').fill('sparko');
  await page.getByLabel('Repository').fill('community');
  await page.getByLabel('Post alerts in').selectOption({ label: '# support' });
  await page.getByRole('button', { name: 'Add source' }).click();
  await expect(page.getByText('sparko/community releases')).toBeVisible();
  await expect(page.getByText(/not checked yet/)).toBeVisible();
  await page.getByRole('button', { name: 'Check now' }).click();
  await expect(page.getByText(/check requested/)).toBeVisible();
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByText('Turned off')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check now' })).toHaveCount(0);
});
