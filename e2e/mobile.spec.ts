import { test, expect } from '@playwright/test';

const PASSWORD = process.env.SEED_PASSWORD ?? 'site-store-demo-2026';

test('phone width: no horizontal scrolling on the main screens; touch targets ≥ 44px', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('storekeeper@demo.site');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  for (const path of ['/', '/receive', '/issue', '/items/new', '/stores']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  }
  await page.goto('/receive');
  for (const name of [/Post receipt/, /Camera/]) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box!.height, String(name)).toBeGreaterThanOrEqual(44);
  }
});
