import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../src/db.js';
import { createInventory } from '../src/inventory.js';
import { createApp } from '../src/server.js';

function setup() {
  const db = openDatabase(':memory:');
  const inv = createInventory(db);
  inv.createItemTx({ sku: 'PLY-18', name: 'Plywood 18mm', unit: 'sheet', reorder_level: 5 });
  inv.addInstaller({ name: 'Sam Carter', company: 'Carter Carpentry' });
  inv.addProject({ code: 'BH-001', name: 'Oak Street Townhouses' });
  return { db, inv };
}

test('delivery automatically books stock in with a reference and timestamp', () => {
  const { inv } = setup();
  const doc = inv.receiveDelivery({
    supplier: 'Timber Co', external_ref: 'DN-1', recorded_by: 'Store',
    lines: [{ sku: 'PLY-18', qty: 20 }, { sku: 'ply-18', qty: 5 }],
  });
  assert.match(doc.ref, /^DEL-\d{6}$/);
  assert.ok(Date.parse(doc.created_at));
  assert.equal(doc.supplier, 'Timber Co');
  assert.equal(doc.lines.length, 1, 'duplicate lines for the same item are merged');
  assert.equal(inv.lookupItem('PLY-18').on_hand, 25);
});

test('delivery creates unknown items when a name is supplied, and rejects bare unknown SKUs', () => {
  const { inv } = setup();
  inv.receiveDelivery({ supplier: 'Tiles R Us', lines: [{ sku: 'TILE-W', name: 'White wall tile', unit: 'box', qty: 12 }] });
  assert.equal(inv.lookupItem('TILE-W').on_hand, 12);
  assert.throws(() => inv.receiveDelivery({ supplier: 'X', lines: [{ sku: 'NOPE', qty: 1 }] }), /unknown item/);
});

test('the same supplier delivery note is only recorded once', () => {
  const { inv } = setup();
  const first = inv.receiveDelivery({ supplier: 'Timber Co', external_ref: 'DN-9', lines: [{ sku: 'PLY-18', qty: 10 }] });
  const again = inv.receiveDelivery({ supplier: 'timber co', external_ref: 'DN-9', lines: [{ sku: 'PLY-18', qty: 10 }] });
  assert.equal(again.duplicate, true);
  assert.equal(again.ref, first.ref);
  assert.equal(inv.lookupItem('PLY-18').on_hand, 10);
});

test('issuing to an installer deducts stock and tracks custody', () => {
  const { inv } = setup();
  inv.receiveDelivery({ supplier: 'Timber Co', lines: [{ sku: 'PLY-18', qty: 10 }] });
  const doc = inv.issueToInstaller({ installer: 'Sam Carter', project: 'BH-001', lines: [{ sku: 'PLY-18', qty: 4 }] });
  assert.match(doc.ref, /^ISS-\d{6}$/);
  assert.equal(doc.installer, 'Sam Carter');
  assert.equal(doc.project_code, 'BH-001');
  const item = inv.lookupItem('PLY-18');
  assert.equal(item.on_hand, 6);
  assert.equal(item.with_installers, 4);
  const { items } = inv.installerCustody(doc.installer_id);
  assert.deepEqual([items[0].issued, items[0].returned, items[0].held], [4, 0, 4]);
});

test('cannot issue more than on hand, and a failed issue records nothing', () => {
  const { inv } = setup();
  inv.receiveDelivery({ supplier: 'Timber Co', lines: [{ sku: 'PLY-18', qty: 3 }] });
  assert.throws(
    () => inv.issueToInstaller({ installer: 'Sam Carter', lines: [{ sku: 'PLY-18', qty: 2 }, { sku: 'PLY-18', qty: 2 }] }),
    /only 3 on hand/
  );
  assert.equal(inv.lookupItem('PLY-18').on_hand, 3);
  assert.equal(inv.listDocuments({ type: 'ISSUE' }).length, 0);
});

test('returns are limited to what the installer holds', () => {
  const { inv } = setup();
  inv.receiveDelivery({ supplier: 'Timber Co', lines: [{ sku: 'PLY-18', qty: 10 }] });
  inv.issueToInstaller({ installer: 'Sam Carter', lines: [{ sku: 'PLY-18', qty: 4 }] });
  assert.throws(() => inv.returnFromInstaller({ installer: 'Sam Carter', lines: [{ sku: 'PLY-18', qty: 5 }] }), /only holds 4/);
  inv.returnFromInstaller({ installer: 'Sam Carter', lines: [{ sku: 'PLY-18', qty: 1 }] });
  assert.equal(inv.lookupItem('PLY-18').on_hand, 7);
  assert.equal(inv.installerCustody(1).items[0].held, 3);
});

test('adjustments need a reason and cannot push stock negative', () => {
  const { inv } = setup();
  inv.receiveDelivery({ supplier: 'Timber Co', lines: [{ sku: 'PLY-18', qty: 2 }] });
  assert.throws(() => inv.adjustStock({ lines: [{ sku: 'PLY-18', qty: -1 }] }), /reason/);
  assert.throws(() => inv.adjustStock({ notes: 'damaged', lines: [{ sku: 'PLY-18', qty: -3 }] }), /below zero/);
  inv.adjustStock({ notes: 'damaged', lines: [{ sku: 'PLY-18', qty: -1 }] });
  assert.equal(inv.lookupItem('PLY-18').on_hand, 1);
});

test('inactive installers cannot receive stock', () => {
  const { inv } = setup();
  inv.receiveDelivery({ supplier: 'Timber Co', lines: [{ sku: 'PLY-18', qty: 2 }] });
  inv.setInstallerActive(1, false);
  assert.throws(() => inv.issueToInstaller({ installer_id: 1, lines: [{ sku: 'PLY-18', qty: 1 }] }), /inactive/);
});

test('the stock ledger is append-only', () => {
  const { db, inv } = setup();
  inv.receiveDelivery({ supplier: 'Timber Co', lines: [{ sku: 'PLY-18', qty: 2 }] });
  assert.throws(() => db.exec('UPDATE movements SET qty_change = 100'), /append-only/);
  assert.throws(() => db.exec('DELETE FROM movements'), /append-only/);
});

test('HTTP API records deliveries and issues end to end', async (t) => {
  const { inv } = setup();
  const server = createServer(createApp(inv, { apiKey: null }));
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const post = (path, body) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  let res = await post('/api/deliveries', { supplier: 'Timber Co', external_ref: 'DN-77', lines: [{ sku: 'PLY-18', qty: 8 }] });
  assert.equal(res.status, 201);
  res = await post('/api/deliveries', { supplier: 'Timber Co', external_ref: 'DN-77', lines: [{ sku: 'PLY-18', qty: 8 }] });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).duplicate, true);

  res = await post('/api/issues', { installer_id: 1, project_id: 1, lines: [{ item_id: 1, qty: 3 }] });
  assert.equal(res.status, 201);
  res = await post('/api/issues', { installer_id: 1, lines: [{ item_id: 1, qty: 99 }] });
  assert.equal(res.status, 409);

  const log = await (await fetch(`${base}/api/movements?type=ISSUE`)).json();
  assert.equal(log.length, 1);
  assert.equal(log[0].qty_change, -3);
  assert.equal(log[0].installer, 'Sam Carter');

  const csv = await (await fetch(`${base}/api/movements.csv`)).text();
  assert.match(csv, /^id,created_at,type,ref/);
  assert.equal(csv.trim().split('\n').length, 3);
});

test('API key protects writes when configured', async (t) => {
  const { inv } = setup();
  const server = createServer(createApp(inv, { apiKey: 'secret' }));
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const body = JSON.stringify({ supplier: 'Timber Co', lines: [{ sku: 'PLY-18', qty: 1 }] });
  const headers = { 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/api/deliveries`, { method: 'POST', headers, body })).status, 401);
  assert.equal((await fetch(`${base}/api/deliveries`, { method: 'POST', headers: { ...headers, 'x-api-key': 'secret' }, body })).status, 201);
});
