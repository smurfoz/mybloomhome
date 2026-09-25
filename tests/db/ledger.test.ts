import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, makeCompany, balance, code } from './helpers.ts';
import { postDocument, reverseDocument } from '../../lib/ledger-db.ts';

let env: Awaited<ReturnType<typeof freshDb>>;
let co: Awaited<ReturnType<typeof makeCompany>>;
before(async () => { env = await freshDb(); co = await makeCompany(env.db); });
after(async () => { await env?.drop(); });

let n = 0;
const key = () => `k-${++n}`;
const grn = (itemId: number, received: number | string, unitCost: number | string, extra: object = {}) =>
  postDocument(env.db, co.admin, { key: key(), type: 'GRN', storeId: co.s1, lines: [{ itemId, received, unitCost, ...extra }] });
const issue = (itemId: number, qty: number | string, extra: object = {}) =>
  postDocument(env.db, co.admin, { key: key(), type: 'ISSUE', storeId: co.s1, receiverName: 'Ravi', lines: [{ itemId, qty, ...extra }] });

test('DB-1 ledger rows cannot be updated, deleted or truncated', async () => {
  await grn(co.items.rmc, 1, 5000);
  for (const sql of ['UPDATE stock_entries SET qty = 0', 'DELETE FROM stock_entries', 'TRUNCATE stock_entries CASCADE']) {
    await assert.rejects(env.db.query(sql), /append-only/, sql);
  }
});

test('DB-2 a document with one bad line posts nothing', async () => {
  const before = (await env.db.query('SELECT count(*)::int AS n FROM stock_entries')).rows[0].n;
  const docs = (await env.db.query('SELECT count(*)::int AS n FROM documents')).rows[0].n;
  assert.equal(await code(postDocument(env.db, co.admin, { key: key(), type: 'GRN', storeId: co.s1, lines: [
    { itemId: co.items.steel, received: 1, unitCost: 1 },
    { itemId: co.items.steel, received: 1, unitCost: 1, uom: 'bag' }] })), 'BAD_UOM');
  assert.equal((await env.db.query('SELECT count(*)::int AS n FROM stock_entries')).rows[0].n, before);
  assert.equal((await env.db.query('SELECT count(*)::int AS n FROM documents')).rows[0].n, docs, 'key released too');
});

test('DB-3 cannot issue more than on hand; CHECK constraint is the backstop', async () => {
  await grn(co.items.cement, 100, 400);
  assert.equal(await code(issue(co.items.cement, 100.0001)), 'NEGATIVE_STOCK');
  await assert.rejects(env.db.query('UPDATE stock_balances SET qty = -1'), /check constraint/);
});

test('DB-4 idempotency: retry returns the original; different content is KEY_REUSED; field order is irrelevant', async () => {
  const doc = { key: 'same-key', type: 'ISSUE' as const, storeId: co.s1, receiverName: 'Ravi', lines: [{ itemId: co.items.cement, qty: 1 }] };
  const a = await postDocument(env.db, co.admin, doc);
  const reordered = { lines: [{ qty: 1, itemId: co.items.cement }], receiverName: 'Ravi', storeId: co.s1, type: 'ISSUE' as const, key: 'same-key' };
  const b = await postDocument(env.db, co.admin, reordered);
  assert.deepEqual(b, { ...a, duplicate: true });
  assert.equal(await code(postDocument(env.db, co.admin, { ...doc, lines: [{ itemId: co.items.cement, qty: 2 }] })), 'KEY_REUSED');
});

test('DB-5 exact decimals: tonnes to kg, 0.07 m3 steps, >4 dp rejected', async () => {
  await grn(co.items.steel, '2.5', '60000', { uom: 't' });
  await issue(co.items.steel, '125.5');
  assert.deepEqual(await balance(env.db, co.s1, co.items.steel), { qty: 2374.5, value: 142470 });
  await grn(co.items.rmc, 0.21, 5000);
  const rmcBefore = await balance(env.db, co.s1, co.items.rmc);
  for (let i = 0; i < 3; i++) await issue(co.items.rmc, 0.07);
  const rmcAfter = await balance(env.db, co.s1, co.items.rmc);
  assert.equal(Math.round((rmcBefore.qty - rmcAfter.qty) * 1e4), 2100);
  assert.equal(await code(issue(co.items.rmc, '0.00001')), 'BAD_QTY');
  assert.equal(await code(grn(co.items.rmc, 1, '1.23456')), 'BAD_QTY');
  const raw = (await env.db.query("SELECT qty::text FROM stock_balances WHERE item_id = $1", [co.items.steel])).rows[0].qty;
  assert.equal(raw, '2374.5000', 'stored exactly');
});

test('DB-7 reversal: once only, never of a reversal, receipt leaves at average with price variance', async () => {
  const x = (await env.db.query("INSERT INTO items (company_id, code, name, category, base_uom, kind) VALUES ($1, 'X', 'x', 'HRD', 'pcs', 'consumable') RETURNING id", [co.companyId])).rows[0].id;
  await env.db.query("INSERT INTO item_uoms VALUES ($1, 'pcs', 1)", [x]);
  const g1 = await grn(x, 10, 1);
  await grn(x, 10, 100);
  await issue(x, 5);
  const rv = await reverseDocument(env.db, co.admin, { key: 'rv-1', documentId: g1.id });
  assert.deepEqual(await balance(env.db, co.s1, x), { qty: 5, value: 252.5 });
  const pv = (await env.db.query('SELECT price_variance FROM stock_entries WHERE document_id = $1', [rv.id])).rows[0].price_variance;
  assert.equal(pv, '495.0000');
  assert.equal(await code(reverseDocument(env.db, co.admin, { key: 'rv-2', documentId: g1.id })), 'ALREADY_REVERSED');
  assert.equal(await code(reverseDocument(env.db, co.admin, { key: 'rv-3', documentId: rv.id })), 'BAD_TYPE');
  assert.equal((await reverseDocument(env.db, co.admin, { key: 'rv-1', documentId: g1.id })).duplicate, true);
});

test('DB-8 balances equal the sum of ledger entries', async () => {
  const mismatch = await env.db.query(`
    SELECT b.store_id, b.location_id, b.item_id FROM stock_balances b
    FULL JOIN (SELECT store_id, location_id, item_id, sum(qty) q, sum(value) v FROM stock_entries GROUP BY 1, 2, 3) e
      USING (store_id, location_id, item_id)
    WHERE coalesce(b.qty, 0) <> coalesce(e.q, 0) OR coalesce(b.value, 0) <> coalesce(e.v, 0)`);
  assert.equal(mismatch.rowCount, 0);
  const total = (await env.db.query('SELECT count(*)::int n FROM stock_entries')).rows[0].n;
  assert.ok(total >= 10, 'earlier tests produced entries to check');
});
