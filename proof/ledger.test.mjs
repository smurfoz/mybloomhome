import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, TRANSIT, QUARANTINE } from './ledger.mjs';

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

test('acceptance flow: receive 100, issue 30, return 5 -> 75 on hand', () => {
  const l = site();
  grnCement(l);
  const issue = l.post({ key: 'k-iss', type: 'ISSUE', store: 'S1',
                         lines: [{ item: 'CEM-OPC53', qty: 30 }] });
  l.post({ key: 'k-ret', type: 'RETURN_TO_STORE', store: 'S1',
           lines: [{ item: 'CEM-OPC53', qty: 5, issueId: issue.id }] });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 75);
  assert.equal(l.value('S1', 'CEM-OPC53'), 75 * 400);
});

test('GRN adds accepted quantity only (received - rejected)', () => {
  const l = site();
  l.post({ key: 'g', type: 'GRN', store: 'S1',
           lines: [{ item: 'CEM-OPC53', received: 100, rejected: 4, unitCost: 400 }] });
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 96);
  assert.throws(() => l.post({ key: 'g2', type: 'GRN', store: 'S1',
    lines: [{ item: 'CEM-OPC53', received: 5, rejected: 6, unitCost: 1 }] }), { code: 'BAD_QTY' });
});

test('issuing more than on hand is rejected and moves nothing', () => {
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

test('offline retry with the same idempotency key does not double-post', () => {
  const l = site();
  grnCement(l);
  const a = l.post({ key: 'dev1-uuid-7', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 10 }] });
  const b = l.post({ key: 'dev1-uuid-7', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 10 }] });
  assert.equal(b.duplicate, true);
  assert.equal(a.id, b.id);
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 90);
});

test('unit conversion: buy steel in tonnes, issue in kg', () => {
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

test('decimal quantities do not drift (0.1 m3 x 30)', () => {
  const l = site();
  l.post({ key: 'g', type: 'GRN', store: 'S1', lines: [{ item: 'RMC-M25', received: 3, unitCost: 5000 }] });
  for (let i = 0; i < 30; i++) {
    l.post({ key: `i${i}`, type: 'ISSUE', store: 'S1', lines: [{ item: 'RMC-M25', qty: 0.1 }] });
  }
  assert.equal(l.onHand('S1', 'RMC-M25'), 0);
  assert.equal(l.value('S1', 'RMC-M25'), 0);
});

test('weighted-average cost across two deliveries', () => {
  const l = site();
  grnCement(l);                                       // 100 @ 400
  l.post({ key: 'g2', type: 'GRN', store: 'S1',
           lines: [{ item: 'CEM-OPC53', received: 50, unitCost: 430 }] }); // 50 @ 430
  assert.equal(l.avgCost('S1', 'CEM-OPC53'), 410);    // (40000 + 21500) / 150
  l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 15 }] });
  assert.equal(l.value('S1', 'CEM-OPC53'), 135 * 410);
});

test('damaged return goes to quarantine, not usable stock', () => {
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

test('inter-site transfer holds stock and value in transit', () => {
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

test('corrections are reversals; history is never edited', () => {
  const l = site();
  grnCement(l);
  const iss = l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 30 }] });
  assert.throws(() => { l.entries[1].qty = 0; }, TypeError, 'ledger rows are immutable');
  l.reverse('rev-1', iss.id);
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 100);
  assert.equal(l.entries.length, 3);
});

test('stock count compares against quantity at count time, not approval time', () => {
  const l = site();
  grnCement(l);
  const count = l.startCount('S1', 'CEM-OPC53');
  const countedAtSeq = l.seq;               // storekeeper counts 97 on the shelf now
  l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 10 }] }); // issue before approval
  const r = l.postCount('adj-1', count, { counted: 97, countedAtSeq });
  assert.equal(r.variance, -3);
  assert.equal(l.onHand('S1', 'CEM-OPC53'), 87);
});

test('running balances always equal a full replay of the ledger', () => {
  const l = site();
  grnCement(l);
  const iss = l.post({ key: 'i', type: 'ISSUE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 33 }] });
  l.post({ key: 'r', type: 'RETURN_TO_STORE', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: 7, issueId: iss.id }] });
  l.post({ key: 't', type: 'TRANSFER_OUT', store: 'S1', to: 'S2', lines: [{ item: 'CEM-OPC53', qty: 12 }] });
  l.post({ key: 'a', type: 'ADJUST', store: 'S1', lines: [{ item: 'CEM-OPC53', qty: -2 }] });
  const replay = l.replay();
  for (const [k, b] of l.balances) assert.deepEqual(replay.get(k), b, k);
});
