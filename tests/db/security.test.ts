import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, makeCompany, code } from './helpers.ts';
import { postDocument, reverseDocument } from '../../lib/ledger-db.ts';
import { login, logout, sessionFromToken, requireRole, CAN, hashPassword } from '../../lib/auth.ts';
import { findItemByScan } from '../../lib/items.ts';

let env: Awaited<ReturnType<typeof freshDb>>;
let a: Awaited<ReturnType<typeof makeCompany>>;
let b: Awaited<ReturnType<typeof makeCompany>>;
before(async () => { env = await freshDb(); a = await makeCompany(env.db, 'Acme Build'); b = await makeCompany(env.db, 'Rival Infra'); });
after(async () => { await env?.drop(); });

test('SEC-1 passwords are scrypt-hashed, sessions stored as hashes, and expire', async () => {
  const row = (await env.db.query("SELECT password_hash FROM users WHERE email = 'admin@acmebuild.test'")).rows[0];
  assert.match(row.password_hash, /^scrypt\$16384\$/);
  assert.equal(await code(login(env.db, 'admin@acmebuild.test', 'wrong password!!')), 'BAD_LOGIN');
  assert.equal(await code(login(env.db, 'nobody@acmebuild.test', 'correct horse battery')), 'BAD_LOGIN');
  const token = await login(env.db, 'ADMIN@acmebuild.test', 'correct horse battery');
  const stored = (await env.db.query('SELECT token_hash FROM sessions')).rows.map((r) => r.token_hash);
  assert.ok(!stored.includes(token), 'raw token is never stored');
  assert.equal((await sessionFromToken(env.db, token))?.role, 'admin');
  await env.db.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
  assert.equal(await sessionFromToken(env.db, token), null, 'expired session rejected');
  const t2 = await login(env.db, 'admin@acmebuild.test', 'correct horse battery');
  await logout(env.db, t2);
  assert.equal(await sessionFromToken(env.db, t2), null);
  assert.equal(await sessionFromToken(env.db, 'forged-token'), null);
  await assert.rejects(hashPassword('short'), { code: 'WEAK_PASSWORD' });
  await env.db.query("UPDATE users SET active = false WHERE email = 'pm@acmebuild.test'");
  assert.equal(await code(login(env.db, 'pm@acmebuild.test', 'correct horse battery')), 'BAD_LOGIN', 'deactivated user');
});

test("SEC-2 another company's stores, items and documents are NOT_FOUND", async () => {
  const doc = await postDocument(env.db, a.admin, { key: 'a-grn', type: 'GRN', storeId: a.s1,
    lines: [{ itemId: a.items.cement, received: 10, unitCost: 400 }] });
  const rival = b.admin;
  assert.equal(await code(postDocument(env.db, rival, { key: 'x1', type: 'ISSUE', storeId: a.s1, receiverName: 'x',
    lines: [{ itemId: b.items.cement, qty: 1 }] })), 'NOT_FOUND', 'foreign store');
  assert.equal(await code(postDocument(env.db, rival, { key: 'x2', type: 'GRN', storeId: b.s1,
    lines: [{ itemId: a.items.cement, received: 1, unitCost: 1 }] })), 'UNKNOWN_ITEM', 'foreign item');
  assert.equal(await code(reverseDocument(env.db, rival, { key: 'x3', documentId: doc.id })), 'NOT_FOUND', 'foreign document');
  const qr = (await env.db.query("SELECT code FROM qr_codes WHERE entity_type = 'item' AND entity_id = $1", [a.items.cement])).rows[0].code;
  assert.equal(await findItemByScan(env.db, rival, qr), null, 'foreign QR code');
  assert.equal(await findItemByScan(env.db, rival, 'CEM-OPC53').then((r) => r.id), b.items.cement, 'item codes resolve within company');
  // Same idempotency key in two companies is two different documents.
  const mine = await postDocument(env.db, b.admin, { key: 'a-grn', type: 'GRN', storeId: b.s1,
    lines: [{ itemId: b.items.cement, received: 10, unitCost: 400 }] });
  assert.notEqual(mine.id, doc.id);
  assert.equal(mine.duplicate, false);
});

test('SEC-3 roles: engineer and pm cannot post, storekeeper cannot reverse', () => {
  const role = (r: 'admin' | 'storekeeper' | 'pm' | 'engineer', can: ('admin' | 'storekeeper' | 'pm' | 'engineer')[]) => {
    try { requireRole(a.ctx(r), can); return true; } catch (e) { assert.equal((e as { code: string }).code, 'FORBIDDEN'); return false; }
  };
  assert.deepEqual(['admin', 'storekeeper', 'pm', 'engineer'].map((r) => role(r as never, CAN.post)), [true, true, false, false]);
  assert.deepEqual(['admin', 'storekeeper', 'pm', 'engineer'].map((r) => role(r as never, CAN.reverse)), [true, false, true, false]);
  assert.deepEqual(['admin', 'storekeeper', 'pm', 'engineer'].map((r) => role(r as never, CAN.manage)), [true, true, false, false]);
});

test('SEC-4 a storekeeper can post only to assigned stores, including on retries', async () => {
  const sk = a.ctx('storekeeper');                 // assigned to S1 only
  await postDocument(env.db, sk, { key: 'sk-1', type: 'GRN', storeId: a.s1, lines: [{ itemId: a.items.steel, received: 5, unitCost: 1 }] });
  assert.equal(await code(postDocument(env.db, sk, { key: 'sk-2', type: 'GRN', storeId: a.s2,
    lines: [{ itemId: a.items.steel, received: 5, unitCost: 1 }] })), 'FORBIDDEN_STORE');
  const adminDoc = { key: 'adm-s2', type: 'GRN' as const, storeId: a.s2, lines: [{ itemId: a.items.steel, received: 5, unitCost: 1 }] };
  await postDocument(env.db, a.admin, adminDoc);
  assert.equal(await code(postDocument(env.db, sk, adminDoc)), 'FORBIDDEN_STORE', 'a replayed key does not bypass store access');
  const s = (await env.db.query('SELECT store_id FROM user_stores WHERE user_id = $1', [a.users.storekeeper])).rows;
  assert.deepEqual(s.map((r) => r.store_id), [a.s1]);
});
