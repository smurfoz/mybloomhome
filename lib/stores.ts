import type { Db } from './db.ts';
import { tx } from './db.ts';
import { fail } from './errors.ts';
import { audit, type Ctx } from './ledger-db.ts';
import { createQr } from './qr.ts';

const CODE = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

// Every store gets MAIN plus the two system locations from the spec.
export async function createStore(db: Db, ctx: Ctx, input: { projectId: number; code: string; name: string }) {
  const code = String(input?.code ?? '').trim().toUpperCase();
  const name = String(input?.name ?? '').trim();
  if (!CODE.test(code)) fail('BAD_INPUT', 'store code: 1–20 letters, digits or dashes');
  if (name.length < 2) fail('BAD_INPUT', 'store name is required');
  return tx(db, async (c) => {
    const p = await c.query('SELECT 1 FROM projects WHERE id = $1 AND company_id = $2', [input.projectId, ctx.companyId]);
    if (!p.rowCount) fail('NOT_FOUND', 'project not found', 404);
    let id: number;
    try {
      id = (await c.query('INSERT INTO stores (company_id, project_id, code, name) VALUES ($1, $2, $3, $4) RETURNING id',
        [ctx.companyId, input.projectId, code, name])).rows[0].id;
    } catch (e) {
      if ((e as { constraint?: string }).constraint === 'stores_company_id_code_key') fail('DUPLICATE', `store ${code} exists`, 409);
      throw e;
    }
    for (const [lc, ln, system] of [['MAIN', 'Main store', false], ['TRANSIT', 'In transit', true], ['QUARANTINE', 'Quarantine', true]] as const) {
      const loc = (await c.query(
        'INSERT INTO locations (company_id, store_id, code, name, system) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [ctx.companyId, id, lc, ln, system])).rows[0].id;
      if (!system) await createQr(c, ctx.companyId, 'location', loc);
    }
    await audit(c, ctx, 'create', 'store', id, { code });
    return { id, code };
  });
}

export async function createLocation(db: Db, ctx: Ctx, input: { storeId: number; code: string; name: string }) {
  const code = String(input?.code ?? '').trim().toUpperCase();
  if (!CODE.test(code) || ['TRANSIT', 'QUARANTINE'].includes(code)) fail('BAD_INPUT', 'location code: 1–20 letters/digits, not a system name');
  return tx(db, async (c) => {
    const s = await c.query('SELECT 1 FROM stores WHERE id = $1 AND company_id = $2', [input.storeId, ctx.companyId]);
    if (!s.rowCount) fail('NOT_FOUND', 'store not found', 404);
    let id: number;
    try {
      id = (await c.query('INSERT INTO locations (company_id, store_id, code, name) VALUES ($1, $2, $3, $4) RETURNING id',
        [ctx.companyId, input.storeId, code, String(input.name ?? code).trim() || code])).rows[0].id;
    } catch (e) {
      if ((e as { constraint?: string }).constraint === 'locations_store_id_code_key') fail('DUPLICATE', `location ${code} exists`, 409);
      throw e;
    }
    await createQr(c, ctx.companyId, 'location', id);
    await audit(c, ctx, 'create', 'location', id, { code });
    return { id, code };
  });
}
