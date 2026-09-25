// APP-5: demo data. Every seeded item is classified by Smart Category.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPool, type Db } from '../lib/db.ts';
import { hashPassword } from '../lib/auth.ts';
import type { Ctx } from '../lib/ledger-db.ts';
import { postDocument } from '../lib/ledger-db.ts';
import { createStore } from '../lib/stores.ts';
import { createItem } from '../lib/items.ts';
import { suggestConversions } from '../lib/units.ts';
import { classify } from '../modules/smart-category/classify.mjs';

const golden: { name: string }[] = JSON.parse(readFileSync(new URL('../modules/smart-category/fixtures/golden.json', import.meta.url), 'utf8'));

export async function seed(db: Db, password: string, log = console.log) {
  if ((await db.query('SELECT 1 FROM companies LIMIT 1')).rowCount) {
    log('database already has data; seed skipped');
    return null;
  }
  const companyId = (await db.query("INSERT INTO companies (name) VALUES ('BloomHome Constructions') RETURNING id")).rows[0].id;
  const hash = await hashPassword(password);
  const users: Record<string, number> = {};
  for (const [role, name] of [['admin', 'Asha Admin'], ['storekeeper', 'Sam Storekeeper'], ['pm', 'Priya PM'], ['engineer', 'Eli Engineer']]) {
    users[role] = (await db.query(
      'INSERT INTO users (company_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [companyId, `${role}@demo.site`, name, hash, role])).rows[0].id;
  }
  const admin: Ctx = { companyId, userId: users.admin, role: 'admin', storeIds: 'all' };
  const stores = [];
  for (const [project, code, name] of [['Tower A – Whitefield', 'TWA', 'Tower A site store'], ['Villa Park – Sarjapur', 'VPS', 'Villa Park site store']]) {
    const projectId = (await db.query('INSERT INTO projects (company_id, name) VALUES ($1, $2) RETURNING id', [companyId, project])).rows[0].id;
    stores.push((await createStore(db, admin, { projectId, code, name })).id);
  }
  // Storekeeper runs Tower A; the PM covers both sites (reversals need store access, SEC-4).
  await db.query('INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2), ($3, $2), ($3, $4), ($5, $4)',
    [users.storekeeper, stores[0], users.pm, stores[1], users.engineer]);
  const suppliers = [];
  for (const s of ['UltraBuild Cements', 'Shree TMT Steels', 'Metro Aggregates', 'Volt Electricals', 'AquaFlow Plumbing']) {
    suppliers.push((await db.query('INSERT INTO suppliers (company_id, name) VALUES ($1, $2) RETURNING id', [companyId, s])).rows[0].id);
  }

  const counters: Record<string, number> = {};
  const items: { id: number; name: string; baseUom: string }[] = [];
  for (const { name } of golden) {
    const c = classify(name);
    if (!c.category || !c.defaults) throw new Error(`seed item not classifiable: ${name}`);
    const defaults = c.defaults;
    counters[c.category] = (counters[c.category] ?? 0) + 1;
    const code = `${c.category}-${String(counters[c.category]).padStart(3, '0')}`;
    const { id } = await createItem(db, admin, {
      code, name, category: c.category, baseUom: defaults.baseUom,
      conversions: suggestConversions(c), reorderLevel: defaults.baseUom === 'pcs' ? 20 : 10 });
    items.push({ id, name, baseUom: defaults.baseUom });
  }

  // Opening stock for the first 30 items in Tower A, so the dashboard has data.
  let i = 0;
  for (const item of items.slice(0, 30)) {
    await postDocument(db, admin, {
      key: `seed-opening-${item.id}`, type: 'GRN', storeId: stores[0], supplierId: suppliers[i++ % suppliers.length],
      supplierRef: `OPENING-${item.id}`, note: 'Opening stock',
      lines: [{ itemId: item.id, received: 5 + (item.id % 7) * 10, unitCost: 50 + (item.id * 37) % 900 }] });
  }
  log(`seeded company ${companyId}: ${items.length} items, 2 stores, 5 suppliers, 4 users (admin|storekeeper|pm|engineer@demo.site)`);
  return { companyId, stores, items: items.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString('base64url');
  const db = createPool(process.env.DATABASE_URL ?? '');
  seed(db, password)
    .then((r) => { if (r && !process.env.SEED_PASSWORD) console.log(`password for all demo users: ${password}`); })
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => db.end());
}
