import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, LedgerError, TRANSIT, QUARANTINE, mulDiv } from './ledger.mjs';

function site() {
  const l = new Ledger();
  l.defineItem('CEM-OPC53', { baseUom: 'bag' });
  l.defineItem('STL-TMT12', { baseUom: 'kg', conversions: { t: 1000 } });
  l.defineItem('RMC-M25', { baseUom: 'm3' });
  return l;
}

const grnCement = (l, key = 'k-grn') =>
  l.post({ key, type: 'GRN', store: 'S1',
           lines: [{ item: 'CEM-OPC53', received: 100, unitCost: 400 }] });

test('LED-ACC acceptance flow: receive 100, issue 30, return 5 -> 75 on hand', () => {
  const l = site();
  grnCement(l);
  const issue = l.post({ key: 'k-iss', type: 'ISSUE', store: 'S1',
                         lines: [{ item: 'CEM-OPC53', qty: 30 }] });
  l.post({ key: 'k-ret', type: 'RETURN_TO_STORE', store: 'S1',
           lines: [{ item: 'CEM-OPC53', qty: 5, issueId: issue.id }] });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 75);
  assert.equal(l.value('S1', 'CEM-OPC53'), 75 * 400);
});

test('LED-7 GRN adds accepted quantity only (received - rejected)', () => {
  const l = site();
  l.post({ key: 'g', type: 'GRN', store: 'S1',
           lines: [{ item: 'CEM-OPC53', received: 100, rejected: 4, unitCost: 400 }] });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 96);
  assert.throws(() => l.post({ key: 'g2', type: 'GRN', store: 'S1',
    lines: [{ item: 'CEM-OPC53', received: 5, rejected: 6, unitCost: 1 }] }), { code: 'BAD_QTY' });
});

test('LED-2 LED-3 issuing more than on hand is rejected and moves nothing', () => {
  const l = site();
  grnCement(l);
  const before = l.seq;
  assert.throws(
    () => l.post({ key: 'x', type: 'ISSUE', store: 'S1',
                   lines: [{ item: 'CEM-OPC53', qty: 60 }, { item: 'CEM-OPC53', qty: 41 }] }),
    { code: 'NEGATIVE_STOCK' });
  assert.equal(l.seq, before, 'multi-line document is all-or-nothing');
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 100);
});

test('LED-4 offline retry with the same idempotency key does not double-post', () => {
  const l = site();
  grnCement(l);
  const a = l.post({ key: 'dev1-uuid-7', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 10 }] });
  const b = l.post({ key: 'dev1-uuid-7', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 10 }] });
  assert.equal(b.duplicate, true);
  assert.equal(a.id, b.id);
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 90);
});

test('LED-5 unit conversion: buy steel in tonnes, issue in kg', () => {
  const l = site();
  l.post({ key: 'g', type: 'GRN', store: 'S1',
           lines: [{ item: 'STL-TMT12', received: 2.5, uom: 't', unitCost: 60000 }] });
  assert.equal(l.onHand('S1', 'STL-TMT12'), 2500);
  l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'STL-TMT12', qty: 125.5, uom: 'kg' }] });
  assert.equal(l.onHand('S1', 'STL-TMT12'), 2374.5);
  assert.equal(l.value('S1', 'STL-TMT12'), 2374.5 * 60);
  assert.throws(() => l.post({ key: 'bad', type: 'ISSUE', store: 'S1',
    lines: [{ item: 'STL-TMT12', qty: 1, uom: 'bag' }] }), { code: 'BAD_UOM' });
});

test('LED-5 decimal quantities do not drift (0.1 m3 x 30)', () => {
  const l = site();
  l.post({ key: 'g', type: 'GRN', store: 'S1', lines: [{ item: 'RMC-M25', received: 3, unitCost: 5000 }] });
  for (let i = 0; i < 30; i++) {
    l.post({ key: `i${i}`, type: 'ISSUE', store: 'S1', lines: [{ item: 'RMC-M25', qty: 0.1 }] });
  }
  assert.equal(l.onHand('S1', 'RMC-M25'), 0);
  assert.equal(l.value('S1', 'RMC-M25'), 0);
});

test('LED-5 values that are inexact in binary floating point still balance exactly', () => {
  const l = site();
  l.post({ key: 'g', type: 'GRN', store: 'S1', lines: [{ item: 'RMC-M25', received: 1, unitCost: 5000 }] });
  for (let i = 0; i < 3; i++) {
    l.post({ key: `i${i}`, type: 'ISSUE', store: 'S1', lines: [{ item: 'RMC-M25', qty: 0.07 }] });
  }
  assert.equal(l.onHand('S1', 'RMC-M25'), 0.79);            // 0.07 * 10000 = 700.0000000000001
  for (const e of l.entries) assert.ok(Number.isInteger(e.qty), `scaled qty ${e.qty} is an integer`);
});

test('LED-5 exact integer arithmetic: half away from zero, no float, no silent rounding', () => {
  assert.equal(mulDiv(5, 1, 2), 3);
  assert.equal(mulDiv(-5, 1, 2), -3, 'Math.round(-2.5) would give -2; NUMERIC gives -3');
  assert.equal(mulDiv(5, -1, 2), -3);
  assert.equal(mulDiv(7, 1, 3), 2);
  assert.equal(mulDiv(-7, 1, 3), -2);
  // Products beyond 2^53 stay exact.
  assert.equal(mulDiv(9_007_199_254_740_991, 3, 9), 3_002_399_751_580_330);
  const l = site();
  assert.throws(() => l.post({ key: 'p', type: 'GRN', store: 'S1',
    lines: [{ item: 'CEM-OPC53', received: 1.00005, unitCost: 1 }] }), { code: 'BAD_QTY' });
  assert.throws(() => l.post({ key: 'c', type: 'GRN', store: 'S1',
    lines: [{ item: 'CEM-OPC53', received: 1, unitCost: 0.12345 }] }), { code: 'BAD_QTY' });
  // Cost is taken per the unit bought in: 0.3 t at 61,111.11/t.
  l.post({ key: 'g', type: 'GRN', store: 'S1', lines: [{ item: 'STL-TMT12', received: 0.3, uom: 't', unitCost: 61111.11 }] });
  assert.equal(l.value('S1', 'STL-TMT12'), 18333.333);
});

test('LED-6 weighted-average cost across two deliveries', () => {
  const l = site();
  grnCement(l);                                       // 100 @ 400
  l.post({ key: 'g2', type: 'GRN', store: 'S1',
           lines: [{ item: 'CEM-OPC53', received: 50, unitCost: 430 }] }); // 50 @ 430
  assert.equal(l.avgCost('S1', 'CEM-OPC53'), 410);    // (40000 + 21500) / 150
  l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 15 }] });
  assert.equal(l.value('S1', 'CEM-OPC53'), 135 * 410);
});

test('LED-9 damaged return goes to quarantine, not usable stock', () => {
  const l = site();
  grnCement(l);
  const iss = l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 20 }] });
  l.post({ key: 'r', type: 'RETURN_TO_STORE', store: 'S1',
           lines: [{ item: 'CEM-OPC53', qty: 3, issueId: iss.id, condition: 'damaged' }] });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 80);
  assert.equal(l.onHand('S1', 'CEM-OPC53', QUARANTINE), 3);
  assert.throws(() => l.post({ key: 'r2', type: 'RETURN_TO_STORE', store: 'S1',
    lines: [{ item: 'CEM-OPC53', qty: 21, issueId: iss.id }] }), { code: 'BAD_QTY' });
});

test('LED-8 inter-site transfer holds stock and value in transit', () => {
  const l = site();
  grnCement(l);
  l.post({ key: 't1', type: 'TRANSFER_OUT', store: 'S1', to: 'S2', lines: [{ item: 'CEM-OPC53', qty: 40 }] });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 60);
  assert.equal(l.onHand('S2', 'CEM-OPC53', TRANSIT), 40);
  l.post({ key: 't2', type: 'TRANSFER_IN', store: 'S2', lines: [{ item: 'CEM-OPC53', qty: 38 }] });
  assert.equal(l.onHand('S2', 'CEM-OPC53'), 38);
  assert.equal(l.onHand('S2', 'CEM-OPC53', TRANSIT), 2, 'shortfall stays visible in transit');
  const total = l.value('S1', 'CEM-OPC53') + l.value('S2', 'CEM-OPC53') + l.value('S2', 'CEM-OPC53', TRANSIT);
  assert.equal(total, 100 * 400, 'value is conserved');
});

test('LED-1 corrections are reversals; history is never edited', () => {
  const l = site();
  grnCement(l);
  const iss = l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 30 }] });
  assert.throws(() => { l.entries[1].qty = 0; }, TypeError, 'ledger rows are immutable');
  l.reverse('rev-1', iss.id);
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 100);
  assert.equal(l.entries.length, 3);
});

test('LED-10 stock count compares against quantity at count time, not approval time', () => {
  const l = site();
  grnCement(l);
  const count = l.startCount('S1', 'CEM-OPC53');
  const countedAtSeq = l.seq;               // storekeeper counts 97 on the shelf now
  l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 10 }] }); // issue before approval
  const r = l.postCount('adj-1', count, { counted: 97, countedAtSeq });
  assert.equal(r.variance, -3);
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 87);
});

test('LED-11 running balances always equal a full replay of the ledger', () => {
  const l = site();
  grnCement(l);
  const iss = l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 33 }] });
  l.post({ key: 'r', type: 'RETURN_TO_STORE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 7, issueId: iss.id }] });
  l.post({ key: 't', type: 'TRANSFER_OUT', store: 'S1', to: 'S2', lines: [{ item: 'CEM-OPC53', qty: 12 }] });
  l.post({ key: 'a', type: 'ADJUST', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: -2 }] });
  const replay = l.replay();
  for (const [k, b] of l.balances) assert.deepEqual(replay.get(k), b, k);
});

// --- regressions found in review (see docs/PROTOCOL.md "What the gates caught") ---

test('LED-6 reversing a receipt never pushes the average outside the costs paid', () => {
  const l = new Ledger();
  l.defineItem('X', { baseUom: 'pcs' });
  const g1 = l.post({ key: 'a', type: 'GRN', store: 'S', lines: [{ item: 'X', received: 10, unitCost: 1 }] });
  l.post({ key: 'b', type: 'GRN', store: 'S', lines: [{ item: 'X', received: 10, unitCost: 100 }] });
  l.post({ key: 'c', type: 'ISSUE', store: 'S', lines: [{ item: 'X', qty: 5 }] });
  const rv = l.reverse('d', g1.id);
  assert.equal(l.onHand('S', 'X'), 5);
  assert.equal(l.avgCost('S', 'X'), 50.5, 'was 149.5 before the fix');
  assert.equal(rv.entries[0].priceVariance / 10_000, 495, '10 x (50.5 - 1) goes to price difference');
});

test('LED-9 returns are cumulative: never more than was issued in total', () => {
  const l = site();
  grnCement(l);
  const iss = l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 20 }] });
  l.post({ key: 'r1', type: 'RETURN_TO_STORE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 15, issueId: iss.id }] });
  assert.throws(() => l.post({ key: 'r2', type: 'RETURN_TO_STORE', store: 'S1',
    lines: [{ item: 'CEM-OPC53', qty: 15, issueId: iss.id }] }), { code: 'BAD_QTY' });
  assert.throws(() => l.post({ key: 'r3', type: 'RETURN_TO_STORE', store: 'S1', lines: [
    { item: 'CEM-OPC53', qty: 3, issueId: iss.id }, { item: 'CEM-OPC53', qty: 3, issueId: iss.id }] }),
    { code: 'BAD_QTY' }, 'two lines in one document are counted together');
  l.post({ key: 'r4', type: 'RETURN_TO_STORE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 5, issueId: iss.id }] });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 100);
});

test('LED-9 a reversed issue accepts no returns; returns go back to the issuing store', () => {
  const l = site();
  grnCement(l);
  const iss = l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 20 }] });
  assert.throws(() => l.post({ key: 'r0', type: 'RETURN_TO_STORE', store: 'S2',
    lines: [{ item: 'CEM-OPC53', qty: 1, issueId: iss.id }] }), { code: 'WRONG_STORE' });
  l.reverse('rv', iss.id);
  assert.throws(() => l.post({ key: 'r', type: 'RETURN_TO_STORE', store: 'S1',
    lines: [{ item: 'CEM-OPC53', qty: 20, issueId: iss.id }] }), { code: 'ALREADY_REVERSED' });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 100);
});

test('LED-1 a document is reversed at most once, and not while returns depend on it', () => {
  const l = site();
  grnCement(l);
  const iss = l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 20 }] });
  const ret = l.post({ key: 'r', type: 'RETURN_TO_STORE', store: 'S1',
                       lines: [{ item: 'CEM-OPC53', qty: 5, issueId: iss.id }] });
  assert.throws(() => l.reverse('rv0', iss.id), { code: 'HAS_DEPENDENTS' });
  const rr = l.reverse('rv1', ret.id);
  assert.throws(() => l.reverse('rv2', ret.id), { code: 'ALREADY_REVERSED' });
  assert.throws(() => l.reverse('rv3', rr.id), { code: 'BAD_TYPE' });
  assert.equal(l.reverse('rv1', ret.id).duplicate, true, 'retrying a reversal is safe');
  l.reverse('rv4', iss.id);                             // allowed once the return is undone
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 100);
});

test('LED-4 re-using a key for a different document is rejected, not swallowed', () => {
  const l = site();
  grnCement(l);
  l.post({ key: 'k', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 5 }] });
  assert.throws(() => l.post({ key: 'k', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 50 }] }),
                { code: 'KEY_REUSED' });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 95);
});

test('LED-10 a count stays open if its adjustment fails, and a retry is safe', () => {
  const l = site();
  grnCement(l);
  const c = l.startCount('S1', 'CEM-OPC53');
  const at = l.seq;
  l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 95 }] });
  assert.throws(() => l.postCount('a1', c, { counted: 90, countedAtSeq: at }), { code: 'NEGATIVE_STOCK' });
  assert.equal(l.counts.get(c).open, true);
  assert.throws(() => l.postCount('a2', c, { counted: -1, countedAtSeq: at }), { code: 'BAD_QTY' });
  assert.throws(() => l.postCount('a3', c, { counted: 99, countedAtSeq: l.seq + 1 }), { code: 'BAD_SEQ' });
  const first = l.postCount('a4', c, { counted: 99, countedAtSeq: at });
  assert.deepEqual(l.postCount('a4', c, { counted: 99, countedAtSeq: at }), { ...first, duplicate: true });
  assert.throws(() => l.postCount('a5', c, { counted: 99, countedAtSeq: at }), { code: 'COUNT_CLOSED' });
});

test('LED-12 bad input is rejected before it can corrupt stock or value', () => {
  const l = site();
  const bad = (doc, code) => assert.throws(() => l.post({ key: JSON.stringify(doc), store: 'S1', ...doc }), { code });
  bad({ type: 'GRN', lines: [{ item: 'CEM-OPC53', received: 10 }] }, 'BAD_COST');
  bad({ type: 'GRN', lines: [{ item: 'CEM-OPC53', received: 10, rejected: -5, unitCost: 1 }] }, 'BAD_QTY');
  bad({ type: 'GRN', lines: [{ item: 'CEM-OPC53', received: 'ten', unitCost: 1 }] }, 'BAD_QTY');
  bad({ type: 'GRN', lines: [{ item: 'CEM-OPC53', received: 5, unitCost: 1, location: TRANSIT }] }, 'SYSTEM_LOCATION');
  bad({ type: 'GRN', lines: [{ item: 'CEM-OPC53', received: 5, unitCost: 1, location: QUARANTINE }] }, 'SYSTEM_LOCATION');
  bad({ type: 'GRN', lines: [] }, 'NO_LINES');
  bad({ type: 'GRN', store: undefined, lines: [{ item: 'CEM-OPC53', received: 5, unitCost: 1 }] }, 'NO_STORE');
  bad({ type: 'ISSUE', lines: [{ item: 'CEM-OPC53', qty: 0 }] }, 'BAD_QTY');
  bad({ type: 'TRANSFER_OUT', lines: [{ item: 'CEM-OPC53', qty: 1 }] }, 'BAD_DEST');
  bad({ type: 'TRANSFER_OUT', to: 'S1', lines: [{ item: 'CEM-OPC53', qty: 1 }] }, 'BAD_DEST');
  bad({ type: 'MYSTERY', lines: [{ item: 'CEM-OPC53', qty: 1 }] }, 'BAD_TYPE');
  assert.throws(() => l.defineItem('X', { baseUom: 'bag', conversions: { kg: 0 } }), { code: 'BAD_UOM' });
  assert.equal(l.entries.length, 0);
  // A fully rejected delivery is still a valid document: it records the rejection, moves nothing.
  l.post({ key: 'all-rejected', type: 'GRN', store: 'S1', lines: [{ item: 'CEM-OPC53', received: 5, rejected: 5, unitCost: 1 }] });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 0);
  // Quarantined stock can only leave by a write-off adjustment.
  grnCement(l, 'g2');
  const iss = l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 4 }] });
  l.post({ key: 'r', type: 'RETURN_TO_STORE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 4, issueId: iss.id, condition: 'damaged' }] });
  bad({ type: 'ISSUE', lines: [{ item: 'CEM-OPC53', qty: 4, location: QUARANTINE }] }, 'SYSTEM_LOCATION');
  l.post({ key: 'wo', type: 'ADJUST', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: -4, location: QUARANTINE }] });
  assert.equal(l.onHand('S1', 'CEM-OPC53', QUARANTINE), 0);
});

test('LED-11 randomised: 3000 mixed operations never break the invariants', () => {
  let seed = 20260925;                                   // deterministic PRNG (mulberry32)
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const l = new Ledger();
  l.defineItem('A', { baseUom: 'kg', conversions: { t: 1000 } });
  l.defineItem('B', { baseUom: 'm3' });
  const cost = { A: [Infinity, 0], B: [Infinity, 0] };   // min/max cost per base unit received
  const docs = [];
  const reversals = new Map();                           // doc id -> times reversed (kept by the test, not the ledger)
  let n = 0;
  for (let step = 0; step < 3000; step++) {
    const store = pick(['S1', 'S2']);
    const item = pick(['A', 'B']);
    const qty = Math.round(rnd() * 5000) / 100 + 0.01;
    const key = rnd() < 0.05 && docs.length ? pick(docs).key : `k${n++}`;  // 5% retries
    const kind = pick(['GRN', 'GRN', 'ISSUE', 'ISSUE', 'RETURN', 'OUT', 'IN', 'ADJ', 'REV']);
    let doc;
    if (kind === 'GRN') {
      const unitCost = Math.round(rnd() * 90000) / 100 + 1;
      const uom = item === 'A' && rnd() < 0.3 ? 't' : undefined;
      const per = uom === 't' ? unitCost / 1000 : unitCost;
      cost[item] = [Math.min(cost[item][0], per), Math.max(cost[item][1], per)];
      doc = { key, type: 'GRN', store, lines: [{ item, received: uom ? qty / 100 : qty, uom, unitCost,
              rejected: rnd() < 0.2 ? Math.round(rnd() * qty * 50) / 100 / (uom ? 100 : 1) : 0 }] };
    } else if (kind === 'ISSUE') doc = { key, type: 'ISSUE', store, lines: [{ item, qty }] };
    else if (kind === 'RETURN') {
      const iss = docs.filter((d) => d.type === 'ISSUE');
      if (!iss.length) continue;
      const d = pick(iss);
      doc = { key, type: 'RETURN_TO_STORE', store: d.store, lines: [{ item: d.item, qty: qty / 2, issueId: d.id,
              condition: rnd() < 0.2 ? 'damaged' : 'ok' }] };
    } else if (kind === 'OUT') doc = { key, type: 'TRANSFER_OUT', store, to: store === 'S1' ? 'S2' : 'S1', lines: [{ item, qty }] };
    else if (kind === 'IN') doc = { key, type: 'TRANSFER_IN', store, lines: [{ item, qty: qty / 4 }] };
    else if (kind === 'ADJ') doc = { key, type: 'ADJUST', store, lines: [{ item, qty: rnd() < 0.5 ? -qty / 10 : qty / 10 }] };
    try {
      if (kind === 'REV') {
        if (!docs.length) continue;
        const target = pick(docs);
        const r = l.reverse(key, target.id);
        if (!r.duplicate) reversals.set(target.id, (reversals.get(target.id) ?? 0) + 1);
      } else {
        const r = l.post(doc);
        if (!r.duplicate) docs.push({ key, id: r.id, type: doc.type, store: doc.store, item: doc.lines[0].item,
                                      qty: r.entries.reduce((s, e) => s + e.qty, 0), issueId: doc.lines[0].issueId });
      }
    } catch (e) {
      assert.ok(e instanceof LedgerError, `step ${step}: unexpected ${e.stack}`);
    }
  }
  // Invariants
  const replay = l.replay();
  assert.equal(replay.size, l.balances.size);
  for (const [k, b] of l.balances) {
    assert.deepEqual(replay.get(k), b, `replay ${k}`);
    const [, location, item] = k.split('|');
    if (location !== TRANSIT) assert.ok(b.qty >= 0, `negative stock ${k}`);
    if (b.qty === 0) assert.equal(b.value, 0, `value left on empty ${k}`);
    const touches = l.entries.filter((e) => `${e.store}|${e.location}|${e.item}` === k).length;
    const [lo, hi] = cost[item];
    assert.ok(b.value >= b.qty * lo - touches && b.value <= b.qty * hi + touches,
              `average cost of ${k} outside the range of costs received`);
  }
  // Bookkeeping kept by the test itself, independent of the ledger's internals:
  for (const [id, times] of reversals) assert.ok(times <= 1, `${id} reversed ${times} times`);
  for (const d of docs.filter((x) => x.type === 'ISSUE')) {
    const stillIssued = reversals.has(d.id) ? 0 : -d.qty;
    const returned = docs.filter((r) => r.type === 'RETURN_TO_STORE' && r.issueId === d.id && !reversals.has(r.id))
                         .reduce((s, r) => s + r.qty, 0);
    assert.ok(returned <= stillIssued, `${d.id}: ${returned} returned but only ${stillIssued} issued`);
  }
  assert.ok(reversals.size > 50 && docs.some((d) => d.type === 'RETURN_TO_STORE'), 'run covered reversals and returns');
  assert.ok(l.entries.length > 1500, `the run exercised the ledger (${l.entries.length} entries)`);
});
