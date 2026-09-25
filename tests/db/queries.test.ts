import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.ts';
import { seed } from '../../scripts/seed.ts';

let env: Awaited<ReturnType<typeof freshDb>>;
before(async () => { env = await freshDb(); process.env.DATABASE_URL = env.url; });
after(async () => { const { getPool } = await import('../../lib/db.ts'); await getPool().end(); await env?.drop(); });

test('APP-6 dashboard counts every low-stock item, not just the 12 it lists; reversals name what they reverse', async () => {
  await seed(env.db, 'demo password 123', () => {});
  const { dashboard } = await import('../../lib/queries.ts');
  const { reverseDocument } = await import('../../lib/ledger-db.ts');
  const admin = (await env.db.query("SELECT id, company_id FROM users WHERE role = 'admin'")).rows[0];
  const ctx = { userId: admin.id, companyId: admin.company_id, role: 'admin' as const, storeIds: 'all' as const,
                name: 'a', email: 'a', companyName: 'c' };
  const d = await dashboard(ctx);
  const expected = (await env.db.query(`SELECT count(*)::int n FROM items i WHERE reorder_level > coalesce((
    SELECT sum(b.qty) FROM stock_balances b JOIN locations l ON l.id = b.location_id WHERE b.item_id = i.id AND NOT l.system), 0)`)).rows[0].n;
  assert.ok(expected > 12, `fixture has more than 12 low items (${expected})`);
  assert.equal(d.lowStockCount, expected);
  assert.equal(d.lowStock.length, 12);
  const grn = (await env.db.query("SELECT id, doc_no FROM documents WHERE type = 'GRN' ORDER BY id LIMIT 1")).rows[0];
  await reverseDocument(env.db, ctx, { key: 'r', documentId: grn.id });
  const again = await dashboard(ctx);
  assert.equal(again.recent[0].reverses, grn.doc_no);
});
