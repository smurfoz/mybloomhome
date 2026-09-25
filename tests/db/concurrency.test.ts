// DB-3 / DB-4 / DB-7 under real concurrency: separate pool connections racing
// against the same rows.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, makeCompany, balance, code } from './helpers.ts';
import { postDocument, reverseDocument } from '../../lib/ledger-db.ts';

let env: Awaited<ReturnType<typeof freshDb>>;
let co: Awaited<ReturnType<typeof makeCompany>>;
before(async () => { env = await freshDb(); co = await makeCompany(env.db); });
after(async () => { await env?.drop(); });

const issue = (key: string, qty: number, storeId = co.s1) =>
  postDocument(env.db, co.admin, { key, type: 'ISSUE', storeId, receiverName: 'crew', lines: [{ itemId: co.items.cement, qty }] });

test('DB-3 two simultaneous issues of 60 against 100 on hand: exactly one succeeds', async () => {
  await postDocument(env.db, co.admin, { key: 'g1', type: 'GRN', storeId: co.s1, lines: [{ itemId: co.items.cement, received: 100, unitCost: 400 }] });
  const results = await Promise.all([code(issue('a', 60)), code(issue('b', 60))]);
  assert.deepEqual(results.sort(), ['NEGATIVE_STOCK', 'OK']);
  assert.equal((await balance(env.db, co.s1, co.items.cement)).qty, 40);
});

test('DB-3 25 simultaneous issues of 10 against 100: exactly 10 succeed, stock ends at 0', async () => {
  await postDocument(env.db, co.admin, { key: 'g2', type: 'GRN', storeId: co.s1, lines: [{ itemId: co.items.cement, received: 60, unitCost: 400 }] });
  const results = await Promise.all(Array.from({ length: 25 }, (_, i) => code(issue(`many-${i}`, 10))));
  assert.equal(results.filter((r) => r === 'OK').length, 10);
  assert.equal(results.filter((r) => r === 'NEGATIVE_STOCK').length, 15);
  assert.deepEqual(await balance(env.db, co.s1, co.items.cement), { qty: 0, value: 0 });
});

test('DB-3 opposite line orders never deadlock, even on brand-new balance rows (sorted locking)', async () => {
  const deadlocks = async () => Number((await env.db.query(
    'SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()')).rows[0].deadlocks);
  // Fresh item pairs, so each race also inserts its balance rows — the case
  // where insert order decides whether two transactions wait on each other.
  const pairs: [number, number][] = [];
  for (let i = 0; i < 150; i++) {
    const ids = [];
    for (const side of ['A', 'B']) {
      const id = (await env.db.query(
        "INSERT INTO items (company_id, code, name, category, base_uom, kind) VALUES ($1, $2, $2, 'HRD', 'pcs', 'consumable') RETURNING id",
        [co.companyId, `DL-${i}-${side}`])).rows[0].id;
      await env.db.query("INSERT INTO item_uoms VALUES ($1, 'pcs', 1)", [id]);
      ids.push(id);
    }
    pairs.push(ids as [number, number]);
  }
  const both = (key: string, first: number, second: number) => postDocument(env.db, co.admin, {
    key, type: 'GRN', storeId: co.s2, lines: [
      { itemId: first, received: 1, unitCost: 1 }, { itemId: second, received: 1, unitCost: 1 }] });
  const before = await deadlocks();
  const results = await Promise.all(pairs.flatMap(([a, b], i) =>
    [code(both(`ab-${i}`, a, b)), code(both(`ba-${i}`, b, a))]));
  assert.deepEqual([...new Set(results)], ['OK']);
  // tx() retries deadlocks, which would hide a bad lock order — so check that
  // Postgres itself saw none (stats are flushed asynchronously).
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(await deadlocks(), before, 'no deadlocks detected by Postgres');
});

test('DB-4 the same request sent 10 times at once creates one document', async () => {
  await postDocument(env.db, co.admin, { key: 'g3', type: 'GRN', storeId: co.s1, lines: [{ itemId: co.items.cement, received: 50, unitCost: 400 }] });
  const results = await Promise.all(Array.from({ length: 10 }, () => issue('same', 5)));
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
  assert.equal((await balance(env.db, co.s1, co.items.cement)).qty, 45);
});

test('DB-7 ten simultaneous reversals of one document: exactly one wins', async () => {
  const doc = await issue('to-reverse', 5);
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    code(reverseDocument(env.db, co.admin, { key: `rv-${i}`, documentId: doc.id }))));
  assert.equal(results.filter((r) => r === 'OK').length, 1);
  assert.equal(results.filter((r) => r === 'ALREADY_REVERSED').length, 9);
  assert.equal((await balance(env.db, co.s1, co.items.cement)).qty, 45);
});
