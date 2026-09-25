// Each test file gets its own freshly migrated database, dropped afterwards.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createPool, type Db } from '../../lib/db.ts';
import { migrate } from '../../scripts/migrate.ts';
import { hashPassword } from '../../lib/auth.ts';
import type { Ctx, Role } from '../../lib/ledger-db.ts';
import { createStore } from '../../lib/stores.ts';
import { createItem } from '../../lib/items.ts';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

export async function freshDb(): Promise<{ db: Db; url: string; drop: () => Promise<void> }> {
  const name = `store_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  await migrate(url, () => {});
  const db = createPool(url, 30);
  return {
    db, url,
    drop: async () => {
      await db.end();
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}

export async function makeCompany(db: Db, name = 'Acme Build') {
  const companyId = (await db.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [name])).rows[0].id;
  const projectId = (await db.query('INSERT INTO projects (company_id, name) VALUES ($1, $2) RETURNING id', [companyId, 'Tower A'])).rows[0].id;
  const hash = await hashPassword('correct horse battery');
  const users: Record<Role, number> = {} as Record<Role, number>;
  for (const role of ['admin', 'storekeeper', 'pm', 'engineer'] as Role[]) {
    users[role] = (await db.query(
      'INSERT INTO users (company_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [companyId, `${role}@${name.toLowerCase().replace(/\W/g, '')}.test`, `${role} user`, hash, role])).rows[0].id;
  }
  const admin: Ctx = { companyId, userId: users.admin, role: 'admin', storeIds: 'all' };
  const s1 = (await createStore(db, admin, { projectId, code: 'S1', name: 'Store 1' })).id;
  const s2 = (await createStore(db, admin, { projectId, code: 'S2', name: 'Store 2' })).id;
  await db.query('INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2)', [users.storekeeper, s1]);
  const ctx = (role: Role): Ctx => ({ companyId, userId: users[role], role,
    storeIds: role === 'admin' ? 'all' : role === 'storekeeper' ? [s1] : [] });
  const cement = (await createItem(db, admin, { code: 'CEM-OPC53', name: 'OPC 53 Grade Cement 50kg', category: 'CEM', baseUom: 'bag',
    conversions: [{ uom: 't', factor: 20 }] })).id;
  const steel = (await createItem(db, admin, { code: 'STL-TMT12', name: '12mm TMT Fe500D', category: 'STL', baseUom: 'kg',
    conversions: [{ uom: 't', factor: 1000 }] })).id;
  const rmc = (await createItem(db, admin, { code: 'RMC-M25', name: 'RMC M25', category: 'CON', baseUom: 'm3' })).id;
  const loc = async (storeId: number, code: string) =>
    (await db.query('SELECT id FROM locations WHERE store_id = $1 AND code = $2', [storeId, code])).rows[0].id as number;
  return { companyId, projectId, users, ctx, admin, s1, s2, items: { cement, steel, rmc }, loc };
}

export async function balance(db: Db, storeId: number, itemId: number, locationCode = 'MAIN') {
  const r = (await db.query(
    `SELECT b.qty, b.value FROM stock_balances b JOIN locations l ON l.id = b.location_id
      WHERE b.store_id = $1 AND b.item_id = $2 AND l.code = $3`, [storeId, itemId, locationCode])).rows[0];
  return { qty: Number(r?.qty ?? 0), value: Number(r?.value ?? 0) };
}

export const code = (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e as { code?: string }).code ?? String(e));
