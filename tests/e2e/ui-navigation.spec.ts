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

test('a declined Discord sign-in returns to an explained sign-in page', async ({
  page,
}) => {
  await page.goto('/api/v1/auth/discord/callback?error=access_denied&state=x');
  await expect(page).toHaveURL(/\/dashboard\?signin=cancelled$/);
  await expect(page.getByRole('alert')).toContainText('Sign-in was cancelled');
  await expect(
    page.getByRole('link', { name: /Continue with Discord/ }),
  ).toBeVisible();
});

test('keyboard users can find a page, follow breadcrumbs and keep their place', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Open workspace' }).click();
  await expect(page).toHaveTitle('Test community · Sparko');
  await expect(
    page.getByRole('heading', { name: 'Getting started' }),
  ).toBeVisible();

  // The finder opens from the keyboard and focus lands on the new page title.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('counting');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/dashboard/${guild}/engagement/counting`);
  const heading = page.getByRole('heading', { name: 'Counting', level: 1 });
  await expect(heading).toBeFocused();
  await expect(page).toHaveTitle('Counting · Test community · Sparko');
  await expect(page.getByText('Works from live Discord events')).toBeVisible();

  const trail = page.getByRole('navigation', { name: 'Breadcrumb' });
  await trail.getByRole('link', { name: 'Engagement' }).click();
  await expect(
    page.getByRole('heading', { name: 'Engagement', level: 1 }),
  ).toBeFocused();

  // Unsaved changes are announced and protected on navigation.
  await page.goto(`/dashboard/${guild}/engagement/counting`);
  await page.getByRole('link', { name: 'Open counting settings' }).click();
  await page.getByRole('switch', { name: /Run the counting channel/ }).check();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Overview' })
    .click();
  const guard = page.getByRole('dialog', { name: 'Keep your changes?' });
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Stay here' }).click();
  await expect(page).toHaveURL(
    `/dashboard/${guild}/engagement/counting?tab=settings`,
  );
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByText('Nothing saved yet')).toBeVisible();

  // The server switcher is a disclosure that returns focus on Escape.
  const switcher = page
    .getByRole('complementary')
    .getByRole('button', { name: /Switch server/ });
  await switcher.click();
  await expect(switcher).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(switcher).toBeFocused();
  await expect(switcher).toHaveAttribute('aria-expanded', 'false');
});

test('narrow and zoomed layouts keep content inside the viewport', async ({
  page,
}) => {
  await login(page);
  for (const width of [375, 720]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of [
      `/dashboard/${guild}`,
      `/dashboard/${guild}/setup`,
      `/dashboard/${guild}/support/tickets`,
      `/dashboard/${guild}/engagement/levels`,
      `/dashboard/${guild}/insights/analytics`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => ({
        by: document.documentElement.scrollWidth - window.innerWidth,
        // Name the widest offenders so a failure points at the element.
        wide: [...document.querySelectorAll('main *')]
          .filter(
            (e) => e.getBoundingClientRect().right > window.innerWidth + 1,
          )
          .slice(-3)
          .map(
            (e) =>
              `${e.tagName}.${e.className}: ${e.textContent?.slice(0, 40)}`,
          ),
      }));
      expect(
        overflow.by,
        `${path} at ${width}px ${overflow.wide.join(' | ')}`,
      ).toBeLessThanOrEqual(0);
    }
  }
});

test('a Studio deep link keeps focus on its section after navigation', async ({
  page,
}) => {
  await login(page);
  await page.goto(`/dashboard/${guild}`);
  await expect(
    page.getByRole('heading', { name: 'Getting started' }),
  ).toBeVisible();
  await page.keyboard.press('Control+k');
  await page
    .getByRole('textbox', { name: 'Search pages and tools' })
    .fill('template library');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/dashboard/${guild}/messages/templates`);
  await expect(page.locator('#template-library')).toBeFocused();
});
