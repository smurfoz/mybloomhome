// Not a test: `npx playwright test e2e/screenshots.spec.ts` regenerates docs/screenshots.
import { test, expect, devices } from '@playwright/test';

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate docs/screenshots');
const PASSWORD = process.env.SEED_PASSWORD ?? 'site-store-demo-2026';

test('screenshots', async ({ browser }) => {
  for (const [label, opts] of [['phone', devices['Pixel 7']], ['desktop', { viewport: { width: 1280, height: 860 } }]] as const) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.getByLabel('Email').fill('storekeeper@demo.site');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/${label}-dashboard.png`, fullPage: label === 'desktop' });
    await page.goto('/items/new');
    await page.getByLabel('Item name').fill('OPC 53 Grade Cement 50kg');
    await expect(page.getByTestId('suggestion')).toContainText('Confident');
    await page.screenshot({ path: `docs/screenshots/${label}-smart-category.png`, fullPage: true });
    await page.goto('/receive');
    await page.getByLabel('Scan or type item code').fill('STL-001');
    await page.keyboard.press('Enter');
    await page.getByLabel('STL-001 quantity').fill('1.2');
    await page.getByLabel('STL-001 unit', { exact: true }).selectOption('t');
    await page.getByLabel('STL-001 unit cost').fill('61500');
    await page.screenshot({ path: `docs/screenshots/${label}-receive.png`, fullPage: true });
    if (label === 'desktop') {
      await page.goto('/labels?items=1,2,3,4,5,6&locations=1&format=a4');
      await page.screenshot({ path: 'docs/screenshots/desktop-labels.png' });
    }
    await ctx.close();
  }
});
