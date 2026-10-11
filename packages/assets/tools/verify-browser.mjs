import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  ...(process.env.SPARKO_BROWSER_PATH
    ? { executablePath: process.env.SPARKO_BROWSER_PATH }
    : {}),
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 1200 },
  reducedMotion: 'no-preference',
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(
  process.env.SPARKO_ASSET_PREVIEW_URL ?? 'http://127.0.0.1:5188',
);
await page.locator('[data-icon]').first().waitFor();
await page.waitForTimeout(250);
if ((await page.locator('[data-icon] svg').count()) !== 0)
  throw new Error('Idle icons unexpectedly loaded player');
await page.getByRole('button', { name: 'Play animations once' }).click();
await page.waitForFunction(
  () => document.querySelectorAll('[data-icon] svg').length === 15,
);
await page.waitForTimeout(450);
if (process.env.SPARKO_ASSET_SCREENSHOT_DIR)
  await page.screenshot({
    path: `${process.env.SPARKO_ASSET_SCREENSHOT_DIR}/sparko-assets-gallery.png`,
    fullPage: true,
  });
if (errors.length) throw new Error(errors.join('\n'));
await page.getByLabel('Theme', { exact: true }).selectOption('dark');
await page.waitForFunction(
  () => document.querySelectorAll('[data-icon] svg').length === 15,
);
await page.waitForTimeout(150);
if (process.env.SPARKO_ASSET_SCREENSHOT_DIR)
  await page.screenshot({
    path: `${process.env.SPARKO_ASSET_SCREENSHOT_DIR}/sparko-assets-gallery-dark.png`,
    fullPage: true,
  });
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.waitForFunction(
  () =>
    document.querySelectorAll('[data-icon][data-motion="off"]').length === 15,
);
if ((await page.locator('[data-icon] svg').count()) !== 0)
  throw new Error('Reduced motion failed to remove animations');
await page.getByLabel('Motion', { exact: true }).selectOption('on');
if ((await page.locator('[data-icon] svg').count()) !== 0)
  throw new Error('Explicit preference bypassed reduced motion');
if (errors.length) throw new Error(errors.join('\n'));
console.log(
  'PASS: 15 real Lottie renders, both themes, idle lazy loading and reduced motion. No browser errors.',
);
await browser.close();
