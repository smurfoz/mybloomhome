import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.ts';
import { seed } from '../../scripts/seed.ts';
import { classify } from '../../modules/smart-category/classify.mjs';

let env: Awaited<ReturnType<typeof freshDb>>;
before(async () => { env = await freshDb(); });
after(async () => { await env?.drop(); });

test('APP-5 seed: 1 company, 2 stores, 5 suppliers, 65 classified items, one user per role, opening stock', async () => {
  const r = await seed(env.db, 'demo password 123', () => {});
  assert.ok(r);
  const count = async (sql: string) => (await env.db.query(sql)).rows[0].n;
  assert.equal(await count('SELECT count(*)::int n FROM companies'), 1);
  assert.equal(await count('SELECT count(*)::int n FROM stores'), 2);
  assert.equal(await count('SELECT count(*)::int n FROM suppliers'), 5);
  assert.equal(await count('SELECT count(*)::int n FROM items'), 65);
  assert.deepEqual((await env.db.query('SELECT role FROM users ORDER BY role')).rows.map((x) => x.role), ['admin', 'engineer', 'pm', 'storekeeper']);
  for (const item of (await env.db.query('SELECT name, category, base_uom FROM items')).rows) {
    const c = classify(item.name);
    assert.equal(item.category, c.category, item.name);
    assert.equal(item.base_uom, c.defaults?.baseUom, item.name);
  }
  const cement = (await env.db.query("SELECT u.uom, u.factor FROM item_uoms u JOIN items i ON i.id = u.item_id WHERE i.name = 'OPC 53 Grade Cement 50kg' ORDER BY u.uom")).rows;
  assert.deepEqual(cement, [{ uom: 'bag', factor: '1.000000' }, { uom: 'kg', factor: '0.020000' }, { uom: 't', factor: '20.000000' }]);
  assert.equal(await count("SELECT count(*)::int n FROM documents WHERE type = 'GRN'"), 30);
  assert.equal(await seed(env.db, 'demo password 123', () => {}), null, 'second run is a no-op');
});
