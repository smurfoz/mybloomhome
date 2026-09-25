// Contract between modules: Smart Category's output must be usable as Ledger
// input. Modules never import each other; only this app-level glue does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../modules/smart-category/classify.mjs';
import { Ledger } from '../modules/ledger/ledger.mjs';

// App glue: turn a classification into an item definition. Pack size read from
// the name (e.g. "50kg" bag) becomes a unit conversion.
const STANDARD = { kg: { t: 1000 }, l: {}, m3: {}, pcs: {}, sqm: {}, bag: {} };
function itemFromName(name) {
  const r = classify(name);
  assert.notEqual(r.status, 'unknown', `${name} must be classified before stocking`);
  const conversions = { ...STANDARD[r.defaults.baseUom] };
  if (r.defaults.baseUom === 'bag' && r.attributes.packKg) {
    conversions.kg = 1 / r.attributes.packKg;
    conversions.t = 1000 / r.attributes.packKg;
  }
  return { r, def: { baseUom: r.defaults.baseUom, conversions, kind: r.defaults.kind } };
}

test('classified steel is stocked in kg and can be received in tonnes', () => {
  const { r, def } = itemFromName('12mm TMT Fe500D');
  assert.equal(r.category, 'STL');
  const l = new Ledger();
  l.defineItem('STL-12', def);
  l.post({ key: 'g', type: 'GRN', store: 'S1', lines: [{ item: 'STL-12', received: 1.2, uom: 't', unitCost: 62000 }] });
  assert.equal(l.onHand('S1', 'STL-12'), 1200);
});

test('cement pack size from the name drives the bag <-> tonne conversion', () => {
  const { r, def } = itemFromName('OPC 53 Grade Cement 50kg');
  assert.equal(r.defaults.baseUom, 'bag');
  const l = new Ledger();
  l.defineItem('CEM-53', def);
  l.post({ key: 'g', type: 'GRN', store: 'S1', lines: [{ item: 'CEM-53', received: 2, uom: 't', unitCost: 8000 }] });
  assert.equal(l.onHand('S1', 'CEM-53'), 40);                 // 2 t / 50 kg
  assert.equal(l.avgCost('S1', 'CEM-53'), 400);               // 8000/t = 400/bag
});

test('every category default unit is accepted by the ledger', () => {
  const l = new Ledger();
  for (const name of ['RMC M25', 'M-Sand', 'AAC block', 'Plywood 18mm', 'MCB 32A', 'CPVC pipe 1 inch',
                      'Vitrified tiles', 'Emulsion paint', 'Anchor fastener', 'Safety helmet',
                      'Needle vibrator', 'Diesel']) {
    const { r, def } = itemFromName(name);
    l.defineItem(r.category, def);
    l.post({ key: name, type: 'GRN', store: 'S1', lines: [{ item: r.category, received: 1, unitCost: 1 }] });
    assert.equal(l.onHand('S1', r.category), 1, name);
  }
});
