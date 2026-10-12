import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

/**
 * The M9 accessibility matrix: every main page in both themes against WCAG
 * 2.2 AA rules axe can check automatically, reflow at 320 CSS px (400% zoom of
 * 1280) and 640 CSS px (200% zoom), and a keyboard-only task. Manual
 * screen-reader passes are recorded in docs/quality.md.
 */
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
const publicPages = ['/', '/features', '/docs', '/status', '/privacy'];
const appPages = [
  '/dashboard',
  `/dashboard/${guild}`,
  `/dashboard/${guild}/setup`,
  `/dashboard/${guild}/support/tickets`,
  `/dashboard/${guild}/messages/studio`,
  `/dashboard/${guild}/engagement/levels`,
  `/dashboard/${guild}/engagement/shop`,
  `/dashboard/${guild}/safety/moderation`,
  `/dashboard/${guild}/automations/workflows`,
  `/dashboard/${guild}/insights/analytics`,
  `/dashboard/${guild}/settings/backups`,
  `/dashboard/${guild}/settings/multi-server`,
  `/dashboard/${guild}/settings/widgets`,
  '/account/preferences',
  '/account/privacy',
  `/servers/${guild}/me`,
  `/servers/${guild}/economy`,
  '/owner/health',
];
async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    const key = 'sparko-ui';
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      state?: object;
    };
    localStorage.setItem(
      key,
      JSON.stringify({ ...saved, state: { ...saved.state, theme: value } }),
    );
  }, theme);
}
async function violations(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible();
  // Let queries settle so the scan sees loaded content, not spinners.
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return result.violations.flatMap((v) =>
    v.nodes.map((n) => `${path} ${v.id}: ${n.target.join(' ')}`),
  );
}

for (const theme of ['light', 'dark'] as const)
  test(`main pages meet automated WCAG 2.2 AA checks in the ${theme} theme`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await useTheme(page, theme);
    const found: string[] = [];
    for (const path of publicPages)
      found.push(...(await violations(page, path)));
    await login(page);
    for (const path of appPages) found.push(...(await violations(page, path)));
    expect(found).toEqual([]);
  });

test('new settings pages reflow at 320 and 640 CSS pixels without sideways scrolling', async ({
  page,
}) => {
  await login(page);
  for (const width of [320, 640]) {
    await page.setViewportSize({ width, height: 720 });
    for (const path of [
      `/dashboard/${guild}/settings/backups`,
      `/dashboard/${guild}/settings/backups?tab=restore`,
      `/dashboard/${guild}/settings/multi-server`,
      `/dashboard/${guild}/settings/widgets?tab=links`,
      `/servers/${guild}/economy`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const by = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(by, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});

test('a backup can be named and saved with the keyboard alone, in Vietnamese', async ({
  page,
}) => {
  await login(page);
  await page.goto(`/dashboard/${guild}/settings/backups`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Route changes move focus to the page; Tab forward like a keyboard user.
  const name = page.getByLabel('Name', { exact: true });
  for (
    let i = 0;
    i < 40 && !(await name.evaluate((e) => e === document.activeElement));
    i++
  )
    await page.keyboard.press('Tab');
  await expect(name).toBeFocused();
  const label = 'Sao lưu trước sự kiện cuối tuần – Tiếng Việt đầy đủ dấu';
  await page.keyboard.type(label);
  await page.keyboard.press('Enter');
  await expect(page.getByText(`Saved “${label}”.`)).toBeVisible();
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  const by = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(by).toBeLessThanOrEqual(0);
});
