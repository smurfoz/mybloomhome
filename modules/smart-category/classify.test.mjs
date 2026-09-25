import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, normalize, extractAttributes } from './classify.mjs';
import { TAXONOMY } from './taxonomy.mjs';

const golden = JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url)));

test('SC-1 normalization is canonical and idempotent', () => {
  assert.equal(normalize('  12MM  TMT,  Fe-500D. '), '12 mm tmt fe 500d');
  assert.equal(normalize('2.5 Sq.mm FR wire'), '2.5 sq mm fr wire');
  assert.equal(normalize('4" Grinder'), '4 inch grinder');
  assert.equal(normalize('16sqmm'), '16 sq mm');
  for (const { name } of golden) {
    assert.equal(normalize(normalize(name)), normalize(name), name);
  }
  assert.equal(normalize(null), '');
});

test('SC-2 longest match wins across categories', () => {
  const r = classify('Binding wire 18 gauge');
  assert.equal(r.category, 'STL');
  assert.deepEqual(r.alternatives, [], 'electrical gets nothing for a claimed "wire"');
  assert.equal(classify('PVC conduit pipe 25mm').category, 'ELE');
  assert.equal(classify('Solvent cement 250ml').category, 'PLB');
  assert.equal(classify('Grinder disc 4 inch').category, 'HRD');
  assert.equal(classify('Angle grinder 4 inch').category, 'TLS');
});

test('SC-3 confidence gate: auto, confirm, unknown', () => {
  const auto = classify('12mm TMT Fe500D');
  assert.equal(auto.status, 'auto');
  assert.equal(auto.confidence, 1);

  const weak = classify('pipe');                       // one generic word
  assert.equal(weak.status, 'confirm');
  assert.equal(weak.category, 'PLB');

  const tie = classify('cement concrete');             // two categories, equal evidence
  assert.equal(tie.status, 'confirm');
  assert.equal(tie.confidence, 0);
  assert.equal(tie.alternatives.length, 1);

  const close = classify('OPC for RMC M25');            // strong signal, strong runner-up
  assert.equal(close.category, 'CON');
  assert.equal(close.status, 'confirm', 'top score must be 2x the runner-up for auto');

  for (const x of ['', '   ', 'xyz widget 42', '!!!']) {
    const u = classify(x);
    assert.equal(u.status, 'unknown', x);
    assert.equal(u.category, null);
    assert.equal(u.defaults, null);
  }
});

test('SC-4 saved corrections override scoring', () => {
  const name = 'Kadapa stone 2ft';
  assert.equal(classify(name).status, 'unknown');
  const overrides = { [normalize(name)]: 'FIN' };
  const r = classify('KADAPA  stone, 2FT', { overrides });  // different spelling, same key
  assert.equal(r.category, 'FIN');
  assert.equal(r.status, 'auto');
  assert.deepEqual(r.reasons, ['override']);
  // An override can also correct a confident wrong answer...
  assert.equal(classify('Pipe', { overrides: { pipe: 'STL' } }).category, 'STL');
  // ...but an override naming a category that no longer exists is ignored.
  assert.equal(classify('Pipe', { overrides: { pipe: 'XXX' } }).category, 'PLB');
});

test('SC-5 attributes are extracted, and sq mm is not a size', () => {
  assert.deepEqual(extractAttributes(normalize('12mm TMT Fe500D')), { sizeMm: 12, steelGrade: 'Fe500D' });
  assert.deepEqual(extractAttributes(normalize('OPC 53 Grade Cement 50kg')),
                   { cementType: 'OPC', cementGrade: 53, packKg: 50 });
  assert.deepEqual(extractAttributes(normalize('RMC M25')), { concreteGrade: 'M25' });
  assert.deepEqual(extractAttributes(normalize('PCC M7.5')), { concreteGrade: 'M7.5' });
  const cable = extractAttributes(normalize('2.5 sq.mm FR copper wire'));
  assert.equal(cable.crossSectionSqMm, 2.5);
  assert.equal(cable.sizeMm, undefined);
  assert.equal(extractAttributes(normalize('CPVC pipe 3/4"')).sizeInch, '3/4');
  assert.equal(extractAttributes(normalize('20mm aggregate')).concreteGrade, undefined,
               '20 mm is a size, not grade M20');
});

test('SC-6 defaults come from the chosen category', () => {
  const tool = classify('Needle vibrator 40mm').defaults;
  assert.equal(tool.kind, 'asset');
  assert.equal(tool.returnable, true);
  const fuel = classify('Diesel (HSD)').defaults;
  assert.equal(fuel.restricted, true);
  assert.equal(fuel.hazardous, true);
  assert.equal(fuel.baseUom, 'l');
  assert.equal(classify('Exterior emulsion paint 20L').defaults.hazardous, true);
  assert.equal(classify('Safety helmet').defaults.issueToPerson, true);
  assert.equal(classify('Acrow props 3m').defaults.returnable, true);
  const steel = classify('12mm TMT Fe500D').defaults;
  assert.equal(steel.baseUom, 'kg');
  assert.deepEqual(steel.altUoms, ['t']);
  steel.altUoms.push('bag');
  assert.deepEqual(classify('12mm TMT Fe500D').defaults.altUoms, ['t'], 'defaults are copies');
});

test('SC-7 required attributes that are missing are reported', () => {
  assert.deepEqual(classify('12mm TMT Fe500D').missing, []);
  assert.deepEqual(classify('TMT bar').missing, ['sizeMm', 'steelGrade']);
  assert.deepEqual(classify('RMC').missing, ['concreteGrade']);
  assert.deepEqual(classify('Cement').missing, ['cementType']);
  assert.deepEqual(classify('xyz').missing, []);
});

test(`SC-8 golden set: ${golden.length} invoice-style names classify correctly`, () => {
  const wrong = golden
    .map((g) => ({ ...g, got: classify(g.name) }))
    .filter((g) => g.got.category !== g.category)
    .map((g) => `${g.name}: expected ${g.category}, got ${g.got.category} (${g.got.reasons})`);
  assert.deepEqual(wrong, []);
  const traps = golden.filter((g) => g.trap).length;
  assert.ok(traps >= 15, `golden set keeps its traps (${traps})`);
  const covered = new Set(golden.map((g) => g.category));
  for (const c of TAXONOMY) assert.ok(covered.has(c.code), `golden covers ${c.code}`);
});

test('SC-9 taxonomy integrity', () => {
  const codes = new Set();
  const owner = new Map();
  for (const c of TAXONOMY) {
    assert.ok(!codes.has(c.code), `duplicate code ${c.code}`);
    codes.add(c.code);
    assert.ok(c.baseUom, `${c.code} base unit`);
    assert.ok(['consumable', 'asset'].includes(c.kind), `${c.code} kind`);
    assert.ok(c.keywords.length + (c.strong?.length ?? 0) > 0, `${c.code} keywords`);
    for (const k of [...c.keywords, ...(c.strong ?? [])]) {
      const n = normalize(k);
      assert.ok(!owner.has(n) || owner.get(n) === c.code,
                `"${n}" is in both ${owner.get(n)} and ${c.code}`);
      assert.ok(!(owner.get(n) === c.code), `"${n}" listed twice in ${c.code}`);
      owner.set(n, c.code);
    }
  }
});
