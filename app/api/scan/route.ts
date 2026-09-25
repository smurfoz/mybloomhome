import { api } from '../../../lib/api.ts';
import { getPool } from '../../../lib/db.ts';
import { AppError } from '../../../lib/errors.ts';
import { findItemByScan, itemUoms } from '../../../lib/items.ts';

// APP-4. With ?store=<id>, also returns usable stock there (system locations excluded).
export const GET = api({ mutate: false }, async (u, _b, req) => {
  const params = new URL(req.url).searchParams;
  const q = params.get('q') ?? '';
  const item = await findItemByScan(getPool(), u, q);
  if (!item) throw new AppError('NOT_FOUND', `nothing matches “${q.slice(0, 60)}”`, 404);
  const store = Number(params.get('store'));
  const onHand = Number.isSafeInteger(store) && store > 0 ? (await getPool().query(
    `SELECT coalesce(sum(b.qty), 0)::text AS q FROM stock_balances b JOIN locations l ON l.id = b.location_id
      WHERE b.company_id = $1 AND b.store_id = $2 AND b.item_id = $3 AND NOT l.system`,
    [u.companyId, store, item.id])).rows[0].q : null;
  return { ...item, onHand, uoms: await itemUoms(getPool(), u, item.id) };
});
