// APP-6: the Phase 1 flow in a real browser against the seeded database
// (npm run db:migrate && SEED_PASSWORD=... npm run db:seed).
import { test, expect, type Page } from '@playwright/test';
import jsQR from 'jsqr';

const PASSWORD = process.env.SEED_PASSWORD ?? 'site-store-demo-2026';
const run = Date.now().toString(36).toUpperCase();

async function login(page: Page, who: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(`${who}@demo.site`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

const onHand = async (page: Page) => (await page.getByTestId('on-hand').innerText()).replace(/\s+/g, ' ').trim();

test('APP-6 create item with Smart Category → receive in tonnes → issue in kg → stock is right everywhere', async ({ page }) => {
  await login(page, 'storekeeper');

  // Smart Category suggests while typing, including units from the category.
  await page.goto('/items/new');
  await page.getByLabel('Item name').fill('16mm TMT Fe550D bar');
  const suggestion = page.getByTestId('suggestion');
  await expect(suggestion).toContainText('Steel & Reinforcement');
  await expect(suggestion).toContainText('Confident');
  await expect(suggestion).toContainText('Fe550D');
  await expect(page.getByLabel('Category')).toHaveValue('STL');
  await expect(page.getByLabel('Base unit (stock is counted in this)')).toHaveValue('kg');
  await expect(page.getByLabel('unit', { exact: true }).first()).toHaveValue('t');
  await expect(page.getByLabel('factor', { exact: true }).first()).toHaveValue('1000');
  const code = `STL-E2E-${run}`;
  await page.getByLabel('Item code').fill(code);
  await page.getByRole('button', { name: 'Create item' }).click();
  await expect(page.getByRole('heading', { name: code })).toBeVisible();
  await expect(page.getByTestId('on-hand')).toContainText('0');
  const itemUrl = page.url();

  // Receive 1.6 t, 0.1 t rejected, by typing the code like a handheld scanner.
  await page.goto('/receive');
  await page.getByLabel('Scan or type item code').fill(code.toLowerCase());
  await page.keyboard.press('Enter');
  await page.getByLabel(`${code} quantity`).fill('1.6');
  await page.getByLabel(`${code} unit`, { exact: true }).selectOption('t');
  await page.getByLabel(`${code} unit cost`).fill('62000');
  await page.getByLabel(`${code} rejected`).fill('0.1');
  await page.getByLabel('Reason for rejection').fill('bent bars');
  // Scanning the same item again warns instead of adding a second line.
  await page.getByLabel('Scan or type item code').fill(code);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('already on this receipt');
  await page.getByRole('button', { name: /Post receipt/ }).click();
  await expect(page.getByRole('status')).toContainText(/Posted GRN-\d+/);

  await page.goto(itemUrl);
  expect(await onHand(page)).toBe('1,500 kg');

  // Issue 250 kg; over-issue is refused by the server.
  await page.goto('/issue');
  await page.getByLabel('Issued to (name)').fill('Ravi (bar bending)');
  await page.getByLabel('Work area / activity').fill('Block B / L3 / slab');
  await page.getByLabel('Scan or type item code').fill(code);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Available here: 1,500 kg')).toBeVisible();
  await page.getByLabel(`${code} quantity`).fill('250');
  await page.getByRole('button', { name: /Post issue/ }).click();
  await expect(page.getByRole('status')).toContainText(/Posted ISSUE-\d+/);

  await page.getByLabel('Scan or type item code').fill(code);
  await page.keyboard.press('Enter');
  await page.getByLabel(`${code} quantity`).fill('2000');
  await expect(page.getByText('More than is available in this store.')).toBeVisible();
  await page.getByRole('button', { name: /Post issue/ }).click();
  await expect(page.getByRole('status')).toContainText('not enough stock');

  await page.goto(itemUrl);
  expect(await onHand(page)).toBe('1,250 kg');
  await expect(page.getByRole('cell', { name: '-250' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '+1,500' })).toBeVisible();

  await page.goto('/');
  const receipts = page.locator('a[href="/documents"]').filter({ hasText: 'Receipts today' });
  await expect(receipts).not.toContainText(/Receipts today\s*0$/);
});

test('APP-3 the printed label decodes to a URL that opens the item', async ({ page }) => {
  await login(page, 'storekeeper');
  await page.goto('/items?q=CEM-001');
  await page.getByRole('link', { name: 'CEM-001' }).click();
  await page.waitForURL(/\/items\/\d+$/);
  const itemUrl = page.url();
  const id = itemUrl.split('/').pop();
  await page.goto(`/labels?items=${id}&format=a4`);
  const svg = page.locator('svg').first();
  await expect(svg).toBeVisible();
  // Rasterise the label's SVG in the browser and decode it with jsQR here.
  const img = await svg.evaluate(async (el) => {
    const size = 400;
    const data = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(el))}`;
    const image = new Image();
    await new Promise((ok, no) => { image.onload = ok; image.onerror = no; image.src = data; });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    return { size, pixels: Array.from(ctx.getImageData(0, 0, size, size).data) };
  });
  const decoded = jsQR(Uint8ClampedArray.from(img.pixels), img.size, img.size)?.data;
  expect(decoded).toMatch(/^http:\/\/localhost:3000\/q\/[a-hj-km-np-z2-9]{12}$/);
  await page.goto(decoded!);
  await expect(page).toHaveURL(itemUrl);
});

test('APP-1 a corrected category is remembered for the next item with that name', async ({ page }) => {
  await login(page, 'storekeeper');
  const name = `Kadapa stone ${run}`;
  await page.goto('/items/new');
  await page.getByLabel('Item name').fill(name);
  await expect(page.getByTestId('suggestion')).toContainText('No match');
  await page.getByLabel('Category').selectOption('FIN');
  await page.getByLabel('Item code').fill(`FIN-E2E-${run}`);
  await page.getByRole('button', { name: 'Create item' }).click();
  await expect(page.getByText('Category correction saved')).toBeVisible();
  await page.goto('/items/new');
  await page.getByLabel('Item name').fill(name.toUpperCase());
  await expect(page.getByTestId('suggestion')).toContainText('Finishes & Tiles');
  await expect(page.getByTestId('suggestion')).toContainText('Confident');
});

test('SEC-3 an engineer can view but not post', async ({ page }) => {
  await login(page, 'engineer');
  await page.goto('/receive');
  await expect(page.getByText('can view stock but not post')).toBeVisible();
  const res = await page.request.post('/api/documents', {
    headers: { origin: 'http://localhost:3000' },
    data: { key: `eng-${run}`, type: 'ISSUE', storeId: 1, receiverName: 'x', lines: [{ itemId: 1, qty: 1 }] } });
  expect(res.status()).toBe(403);
  expect((await res.json()).error).toBe('FORBIDDEN');
});

test('DB-7 a PM can reverse a document once; the button then disappears', async ({ page }) => {
  await login(page, 'pm');
  await page.goto('/documents');
  // The most recent opening-stock GRN that has not been reversed.
  const row = page.locator('tr', { hasText: 'OPENING-' }).filter({ hasNotText: 'reversed by' }).first();
  await row.getByRole('link').first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reverse' }).click();
  await expect(page.getByText(/This reverses GRN-\d+/)).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(page.getByText(/Reversed by REVERSAL-\d+/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reverse' })).toHaveCount(0);
});

test('SEC-5 writes must be same-origin JSON: cross-site and form posts are refused', async ({ page }) => {
  await login(page, 'storekeeper');
  const doc = { key: `csrf-${run}`, type: 'ISSUE', storeId: 1, receiverName: 'x', lines: [{ itemId: 1, qty: 1 }] };
  const evil = await page.request.post('/api/documents', { headers: { origin: 'https://evil.example' }, data: doc });
  expect(evil.status()).toBe(403);
  expect((await evil.json()).error).toBe('CROSS_ORIGIN');
  const noOrigin = await page.request.fetch('/api/documents', { method: 'POST', headers: { origin: '' }, data: doc });
  expect(noOrigin.status()).toBe(403);
  const form = await page.request.post('/api/documents', { headers: { origin: 'http://localhost:3000' }, form: { key: 'x' } });
  expect(form.status()).toBe(415);
  const anon = await page.context().browser()!.newContext();
  const out = await anon.request.post('http://localhost:3000/api/documents', { headers: { origin: 'http://localhost:3000' }, data: doc });
  expect(out.status()).toBe(401);
  await anon.close();
});
