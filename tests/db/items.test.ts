import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, makeCompany, code } from './helpers.ts';
import { createItem, findItemByScan, getOverrides } from '../../lib/items.ts';
import { classify, normalize } from '../../modules/smart-category/classify.mjs';
import { QR_CODE_LENGTH, extractQrCode } from '../../lib/qr.ts';

let env: Awaited<ReturnType<typeof freshDb>>;
let co: Awaited<ReturnType<typeof makeCompany>>;
before(async () => { env = await freshDb(); co = await makeCompany(env.db); });
after(async () => { await env?.drop(); });

test('APP-1 accepting the suggestion learns nothing; choosing another category is learned for next time', async () => {
  const agree = await createItem(env.db, co.admin, { code: 'MCB-32', name: 'MCB 32A DP', category: 'ELE', baseUom: 'pcs' });
  assert.equal(agree.learned, false);
  assert.equal(classify('Kadapa stone 2ft').category, null);
  const corrected = await createItem(env.db, co.admin, { code: 'KADAPA', name: 'Kadapa stone 2ft', category: 'FIN', baseUom: 'sqm' });
  assert.equal(corrected.learned, true);
  const overrides = await getOverrides(env.db, co.companyId);
  assert.deepEqual(overrides, { [normalize('Kadapa stone 2ft')]: 'FIN' });
  const next = classify('KADAPA  STONE, 2FT', { overrides });
  assert.equal(next.category, 'FIN');
  assert.equal(next.status, 'auto');
  // Defaults come from the chosen category, not the rejected suggestion.
  // Overriding a wrong suggestion (pipe → Plumbing) is learned too.
  assert.equal(classify('pipe').category, 'PLB');
  const fixed = await createItem(env.db, co.admin, { code: 'PIPE-X', name: 'pipe', category: 'STL', baseUom: 'kg' });
  assert.equal(fixed.learned, true);
  assert.equal(fixed.suggested, 'PLB');
  assert.equal(classify('Pipe', { overrides: await getOverrides(env.db, co.companyId) }).category, 'STL');
  const row = (await env.db.query("SELECT category, base_uom FROM items WHERE code = 'PIPE-X'")).rows[0];
  assert.deepEqual(row, { category: 'STL', base_uom: 'kg' });
});

test('APP-1 item input is validated', async () => {
  const bad = (x: object) => code(createItem(env.db, co.admin, { code: 'OK-1', name: 'Something', category: 'HRD', baseUom: 'pcs', ...x }));
  assert.equal(await bad({ code: 'bad code!' }), 'BAD_INPUT');
  assert.equal(await bad({ category: 'NOPE' }), 'BAD_INPUT');
  assert.equal(await bad({ baseUom: '' }), 'BAD_UOM');
  assert.equal(await bad({ conversions: [{ uom: 'box', factor: 0 }] }), 'BAD_UOM');
  assert.equal(await bad({ conversions: [{ uom: 'pcs', factor: 2 }] }), 'BAD_UOM', 'base unit cannot be a conversion');
  assert.equal(await bad({ conversions: [{ uom: 'box', factor: '0.0000001' }] }), 'BAD_QTY');
  assert.equal(await code(createItem(env.db, co.admin, { code: 'CEM-OPC53', name: 'dup', category: 'CEM', baseUom: 'bag' })), 'DUPLICATE');
});

test('APP-2 every item and user location gets an opaque 12-character QR code', async () => {
  const rows = (await env.db.query('SELECT code, entity_type FROM qr_codes WHERE company_id = $1', [co.companyId])).rows;
  const items = (await env.db.query('SELECT count(*)::int n FROM items WHERE company_id = $1', [co.companyId])).rows[0].n;
  const locs = (await env.db.query('SELECT count(*)::int n FROM locations WHERE company_id = $1 AND NOT system', [co.companyId])).rows[0].n;
  assert.equal(rows.filter((r) => r.entity_type === 'item').length, items);
  assert.equal(rows.filter((r) => r.entity_type === 'location').length, locs);
  for (const r of rows) {
    assert.match(r.code, new RegExp(`^[a-hj-km-np-z2-9]{${QR_CODE_LENGTH}}$`), 'no 0/o/1/l/i');
  }
  assert.equal(new Set(rows.map((r) => r.code)).size, rows.length);
});

test('APP-4 a QR URL, a bare QR code and an item code all resolve to the same item', async () => {
  const qr = (await env.db.query("SELECT code FROM qr_codes WHERE entity_type = 'item' AND entity_id = $1", [co.items.steel])).rows[0].code;
  for (const input of [`https://store.example.com/q/${qr}`, `/q/${qr}`, qr, qr.toUpperCase(), 'stl-tmt12', '  STL-TMT12 ']) {
    assert.equal((await findItemByScan(env.db, co.admin, input))?.id, co.items.steel, input);
  }
  assert.equal(await findItemByScan(env.db, co.admin, 'https://evil.example/q/zzzzzzzzzzzz'), null);
  assert.equal(await findItemByScan(env.db, co.admin, ''), null);
  assert.equal(extractQrCode("x'; DROP TABLE items; --"), null);
});
