// DB-6: the PostgreSQL ledger and the reference model (modules/ledger) receive
// the same random operations and must agree on every outcome and every number.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, makeCompany } from './helpers.ts';
import { postDocument, reverseDocument } from '../../lib/ledger-db.ts';
import { format } from '../../lib/decimal.ts';
import { Ledger } from '../../modules/ledger/ledger.mjs';

let env: Awaited<ReturnType<typeof freshDb>>;
let co: Awaited<ReturnType<typeof makeCompany>>;
before(async () => { env = await freshDb(); co = await makeCompany(env.db); });
after(async () => { await env?.drop(); });

const outcome = async (fn: () => Promise<{ duplicate?: boolean }> | { duplicate?: boolean }) => {
  try { return (await fn()).duplicate ? 'DUPLICATE' : 'OK'; }
  catch (e) { return (e as { code?: string }).code ?? `THREW ${e}`; }
};

test('DB-6 randomised differential: 1500 operations, same outcomes and identical balances', async () => {
  let seed = Number(process.env.DIFF_SEED ?? 424242);
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const dec = (max: number, dp: number) => Math.round(rnd() * max * 10 ** dp) / 10 ** dp;

  const model = new Ledger();
  model.defineItem('CEM', { baseUom: 'bag', conversions: { t: 20 } });
  model.defineItem('STL', { baseUom: 'kg', conversions: { t: 1000 } });
  model.defineItem('RMC', { baseUom: 'm3' });
  const ids: Record<string, number> = { CEM: co.items.cement, STL: co.items.steel, RMC: co.items.rmc };
  const units: Record<string, (string | undefined)[]> = { CEM: [undefined, 't'], STL: [undefined, 't', 'kg'], RMC: [undefined, 'bag'] };
  const stores = [co.s1, co.s2];

  const history: { key: string; model: object; db: object; modelId?: string; dbId?: number }[] = [];
  const counts: Record<string, number> = {};
  const mismatches: string[] = [];

  for (let step = 0; step < 1500; step++) {
    const r = rnd();
    let m: string, d: string, entry: typeof history[number] | undefined;
    const posted = history.filter((h) => 'key' in h.model);
    if (r < 0.06 && posted.length) {                         // retry an earlier request unchanged
      const h = pick(posted);
      m = await outcome(() => model.post(h.model as never));
      d = await outcome(() => postDocument(env.db, co.admin, h.db as never));
    } else if (r < 0.09 && posted.length) {                  // same key, different content
      const h = pick(posted);
      const mm = { ...(h.model as { lines: object[] }), note: 'changed' };
      const dd = { ...(h.db as object), note: 'changed' };
      m = await outcome(() => model.post(mm as never));
      d = await outcome(() => postDocument(env.db, co.admin, dd as never));
    } else if (r < 0.17 && history.some((h) => h.modelId)) { // reverse something
      const h = pick(history.filter((x) => x.modelId));
      const key = `rv-${step}`;
      let mid = '', did = 0;
      m = await outcome(() => { const res = model.reverse(key, h.modelId!); mid = res.id; return res; });
      d = await outcome(async () => { const res = await reverseDocument(env.db, co.admin, { key, documentId: h.dbId! }); did = res.id; return res; });
      if (m === 'OK' && d === 'OK') history.push({ key, model: {}, db: {}, modelId: mid, dbId: did });
    } else {                                                 // post a new GRN or ISSUE
      const key = `k-${step}`;
      const store = pick(stores);
      const nLines = 1 + Math.floor(rnd() * 3);
      const isGrn = rnd() < 0.45;
      const mLines: object[] = [], dLines: object[] = [];
      for (let i = 0; i < nLines; i++) {
        const item = pick(['CEM', 'STL', 'RMC']);
        const uom = pick(units[item]);
        if (isGrn) {
          const received = dec(uom === 't' ? 3 : 120, uom === 't' ? 3 : 2) + (uom === 't' ? 0.001 : 0.01);
          const rejected = rnd() < 0.2 ? Math.min(received, dec(received, 2)) : undefined;
          const unitCost = dec(uom === 't' ? 90000 : 900, 2) + 1;
          mLines.push({ item, received, rejected, unitCost, uom });
          dLines.push({ itemId: ids[item], received, rejected, unitCost, uom });
        } else {
          const qty = rnd() < 0.05 ? 0 : dec(uom === 't' ? 0.5 : 60, uom === 't' ? 4 : 2) + 0.01;
          mLines.push({ item, qty, uom });
          dLines.push({ itemId: ids[item], qty, uom });
        }
      }
      const mDoc = { key, type: isGrn ? 'GRN' : 'ISSUE', store, lines: mLines };
      const dDoc = isGrn ? { key, type: 'GRN', storeId: store, lines: dLines }
                         : { key, type: 'ISSUE', storeId: store, receiverName: 'crew', lines: dLines };
      let mid: string | undefined, did: number | undefined;
      m = await outcome(() => { const res = model.post(mDoc as never); mid = res.id; return res; });
      d = await outcome(async () => { const res = await postDocument(env.db, co.admin, dDoc as never); did = res.id; return res; });
      entry = { key, model: mDoc, db: dDoc, modelId: m === 'OK' ? mid : undefined, dbId: d === 'OK' ? did : undefined };
      history.push(entry);
    }
    counts[m] = (counts[m] ?? 0) + 1;
    if (m !== d) mismatches.push(`step ${step}: model ${m}, db ${d}`);
    if (mismatches.length > 5) break;
  }
  assert.deepEqual(mismatches, [], 'outcomes differ');

  // Every balance, to the last 0.0001.
  const dbRows = (await env.db.query(
    `SELECT b.store_id, i.id AS item_id, b.qty::text, b.value::text FROM stock_balances b
       JOIN items i ON i.id = b.item_id ORDER BY 1, 2`)).rows;
  const byId = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
  const dbMap = new Map(dbRows.map((r) => [`${r.store_id}|MAIN|${byId[r.item_id]}`, `${r.qty} / ${r.value}`]));
  const modelMap = new Map([...model.balances].map(([k, b]) => [k, `${format(BigInt(b.qty))} / ${format(BigInt(b.value))}`]));
  for (const k of new Set([...dbMap.keys(), ...modelMap.keys()])) {
    assert.equal(dbMap.get(k) ?? '0.0000 / 0.0000', modelMap.get(k) ?? '0.0000 / 0.0000', k);
  }
  const pvDb = (await env.db.query('SELECT coalesce(sum(price_variance), 0)::text AS s FROM stock_entries')).rows[0].s;
  const pvModel = model.entries.reduce((s: bigint, e: { priceVariance?: number }) => s + BigInt(e.priceVariance ?? 0), 0n);
  assert.equal(pvDb, format(pvModel), 'price variance');

  // The run must actually exercise the interesting paths.
  for (const c of ['OK', 'DUPLICATE', 'KEY_REUSED', 'NEGATIVE_STOCK', 'ALREADY_REVERSED', 'BAD_UOM', 'BAD_QTY']) {
    assert.ok((counts[c] ?? 0) > 0, `run exercised ${c} (${JSON.stringify(counts)})`);
  }
  console.log('# outcomes', JSON.stringify(counts));
});
