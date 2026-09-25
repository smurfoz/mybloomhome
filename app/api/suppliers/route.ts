import { api } from '../../../lib/api.ts';
import { CAN } from '../../../lib/auth.ts';
import { getPool } from '../../../lib/db.ts';
import { AppError } from '../../../lib/errors.ts';

export const POST = api({ roles: CAN.manage }, async (u, body) => {
  const name = String(body?.name ?? '').trim();
  if (name.length < 2 || name.length > 120) throw new AppError('BAD_INPUT', 'supplier name: 2–120 characters');
  const r = await getPool().query(
    `INSERT INTO suppliers (company_id, name) VALUES ($1, $2)
     ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name`, [u.companyId, name]);
  return r.rows[0];
});
