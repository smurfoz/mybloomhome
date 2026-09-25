// Read models for pages. Every query is filtered by the viewer's company (SEC-2).
import { getPool } from './db.ts';
import type { SessionUser } from './auth.ts';

// Rows are plain records; NUMERIC columns arrive as strings (DB-5).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
const db = () => getPool();

export async function dashboard(u: SessionUser) {
  // Items whose usable stock is below their reorder level (count and list share this).
  const lowSql = `SELECT i.id, i.code, i.name, i.base_uom, i.reorder_level::text,
                         coalesce(sum(b.qty) FILTER (WHERE NOT l.system), 0) AS on_hand_n
                    FROM items i
                    LEFT JOIN stock_balances b ON b.item_id = i.id
                    LEFT JOIN locations l ON l.id = b.location_id
                   WHERE i.company_id = $1 AND i.reorder_level > 0
                   GROUP BY i.id
                  HAVING coalesce(sum(b.qty) FILTER (WHERE NOT l.system), 0) < i.reorder_level`;
  const [value, today, low, lowCount, recent, counts] = await Promise.all([
    db().query(`SELECT coalesce(sum(value), 0)::text AS v FROM stock_balances WHERE company_id = $1`, [u.companyId]),
    db().query(`SELECT type, count(*)::int AS n FROM documents
                 WHERE company_id = $1 AND posted_at >= date_trunc('day', now()) GROUP BY type`, [u.companyId]),
    db().query(`SELECT id, code, name, base_uom, reorder_level, on_hand_n::text AS on_hand FROM (${lowSql}) x
                 ORDER BY on_hand_n / reorder_level::numeric, code LIMIT 12`, [u.companyId]),
    db().query(`SELECT count(*)::int AS n FROM (${lowSql}) x`, [u.companyId]),
    db().query(`SELECT d.id, d.doc_no, d.type, d.posted_at, s.code AS store, u.name AS by, o.doc_no AS reverses,
                       (SELECT count(*)::int FROM document_lines WHERE document_id = d.id) AS lines
                  FROM documents d LEFT JOIN stores s ON s.id = d.store_id JOIN users u ON u.id = d.posted_by
                  LEFT JOIN documents o ON o.id = d.reverses_id
                 WHERE d.company_id = $1 ORDER BY d.id DESC LIMIT 8`, [u.companyId]),
    db().query(`SELECT (SELECT count(*)::int FROM items WHERE company_id = $1) AS items,
                       (SELECT count(*)::int FROM stores WHERE company_id = $1) AS stores`, [u.companyId]),
  ]);
  const t = Object.fromEntries(today.rows.map((r) => [r.type, r.n]));
  return { value: value.rows[0].v as string, receiptsToday: (t.GRN ?? 0) as number, issuesToday: (t.ISSUE ?? 0) as number,
           lowStock: low.rows as Row[], lowStockCount: lowCount.rows[0].n as number, recent: recent.rows as Row[], items: counts.rows[0].items as number, stores: counts.rows[0].stores as number };
}

export async function itemsList(u: SessionUser, q = '') {
  return (await db().query(
    `SELECT i.id, i.code, i.name, i.category, i.base_uom, i.reorder_level::text,
            coalesce(sum(b.qty) FILTER (WHERE NOT l.system), 0)::text AS on_hand,
            coalesce(sum(b.value), 0)::text AS value
       FROM items i
       LEFT JOIN stock_balances b ON b.item_id = i.id
       LEFT JOIN locations l ON l.id = b.location_id
      WHERE i.company_id = $1 AND ($2 = '' OR i.code ILIKE '%' || $2 || '%' OR i.name ILIKE '%' || $2 || '%')
      GROUP BY i.id ORDER BY i.code LIMIT 500`, [u.companyId, q.trim()])).rows;
}

export async function itemDetail(u: SessionUser, id: number) {
  const item = (await db().query(
    `SELECT i.*, i.reorder_level::text, q.code AS qr FROM items i
       LEFT JOIN qr_codes q ON q.entity_type = 'item' AND q.entity_id = i.id
      WHERE i.id = $1 AND i.company_id = $2`, [id, u.companyId])).rows[0];
  if (!item) return null;
  const [uoms, stock, moves] = await Promise.all([
    db().query('SELECT uom, factor::text FROM item_uoms WHERE item_id = $1 ORDER BY factor = 1 DESC, uom', [id]),
    db().query(`SELECT s.code AS store, l.code AS location, l.system, b.qty::text, b.value::text
                  FROM stock_balances b JOIN stores s ON s.id = b.store_id JOIN locations l ON l.id = b.location_id
                 WHERE b.item_id = $1 AND b.company_id = $2 AND (b.qty <> 0 OR b.value <> 0)
                 ORDER BY s.code, l.code`, [id, u.companyId]),
    db().query(`SELECT e.id, e.qty::text, e.value::text, e.price_variance::text, e.created_at,
                       d.id AS doc_id, d.doc_no, d.type, s.code AS store, l.code AS location
                  FROM stock_entries e JOIN documents d ON d.id = e.document_id
                  JOIN stores s ON s.id = e.store_id JOIN locations l ON l.id = e.location_id
                 WHERE e.item_id = $1 AND e.company_id = $2 ORDER BY e.id DESC LIMIT 50`, [id, u.companyId]),
  ]);
  return { item, uoms: uoms.rows, stock: stock.rows, moves: moves.rows };
}

export async function documentsList(u: SessionUser) {
  return (await db().query(
    `SELECT d.id, d.doc_no, d.type, d.posted_at, d.supplier_ref, d.receiver_name, s.code AS store,
            sp.name AS supplier, u.name AS by, r.doc_no AS reversed_by, o.doc_no AS reverses
       FROM documents d LEFT JOIN stores s ON s.id = d.store_id JOIN users u ON u.id = d.posted_by
       LEFT JOIN suppliers sp ON sp.id = d.supplier_id
       LEFT JOIN documents r ON r.reverses_id = d.id
       LEFT JOIN documents o ON o.id = d.reverses_id
      WHERE d.company_id = $1 ORDER BY d.id DESC LIMIT 200`, [u.companyId])).rows;
}

export async function documentDetail(u: SessionUser, id: number) {
  const doc = (await db().query(
    `SELECT d.*, s.code AS store, s.name AS store_name, sp.name AS supplier, u.name AS by,
            r.id AS reversed_by_id, r.doc_no AS reversed_by, o.doc_no AS reverses
       FROM documents d LEFT JOIN stores s ON s.id = d.store_id JOIN users u ON u.id = d.posted_by
       LEFT JOIN suppliers sp ON sp.id = d.supplier_id
       LEFT JOIN documents r ON r.reverses_id = d.id
       LEFT JOIN documents o ON o.id = d.reverses_id
      WHERE d.id = $1 AND d.company_id = $2`, [id, u.companyId])).rows[0];
  if (!doc) return null;
  const [lines, entries] = await Promise.all([
    db().query(`SELECT dl.line_no, dl.uom, dl.qty::text, dl.rejected::text, dl.reject_reason, dl.unit_cost::text,
                       i.id AS item_id, i.code, i.name, l.code AS location
                  FROM document_lines dl JOIN items i ON i.id = dl.item_id JOIN locations l ON l.id = dl.location_id
                 WHERE dl.document_id = $1 ORDER BY dl.line_no`, [id]),
    db().query(`SELECT e.qty::text, e.value::text, e.price_variance::text, i.code, i.base_uom, l.code AS location
                  FROM stock_entries e JOIN items i ON i.id = e.item_id JOIN locations l ON l.id = e.location_id
                 WHERE e.document_id = $1 ORDER BY e.id`, [id]),
  ]);
  return { doc, lines: lines.rows, entries: entries.rows };
}

export async function storesWithLocations(u: SessionUser) {
  const stores = (await db().query(
    `SELECT s.id, s.code, s.name, p.name AS project FROM stores s JOIN projects p ON p.id = s.project_id
      WHERE s.company_id = $1 ORDER BY s.code`, [u.companyId])).rows;
  const locs = (await db().query(
    `SELECT l.id, l.store_id, l.code, l.name, l.system, q.code AS qr FROM locations l
       LEFT JOIN qr_codes q ON q.entity_type = 'location' AND q.entity_id = l.id
      WHERE l.company_id = $1 ORDER BY l.system, l.code`, [u.companyId])).rows;
  type Loc = { id: number; code: string; name: string; system: boolean; qr: string | null };
  return stores.map((s: Row) => ({ id: s.id as number, code: s.code as string, name: s.name as string, project: s.project as string,
                              locations: locs.filter((l: Row) => l.store_id === s.id) as Loc[],
                              canPost: u.storeIds === 'all' || u.storeIds.includes(s.id) }));
}

export async function projects(u: SessionUser) {
  return (await db().query('SELECT id, name FROM projects WHERE company_id = $1 ORDER BY name', [u.companyId])).rows;
}

export async function suppliers(u: SessionUser) {
  return (await db().query('SELECT id, name FROM suppliers WHERE company_id = $1 ORDER BY name', [u.companyId])).rows;
}

export async function labelTargets(u: SessionUser, itemIds: number[], locationIds: number[]) {
  const items = itemIds.length ? (await db().query(
    `SELECT i.id, i.code, i.name, i.base_uom, q.code AS qr FROM items i JOIN qr_codes q ON q.entity_type = 'item' AND q.entity_id = i.id
      WHERE i.company_id = $1 AND i.id = ANY($2) ORDER BY i.code`, [u.companyId, itemIds])).rows : [];
  const locations = locationIds.length ? (await db().query(
    `SELECT l.id, l.code, l.name, s.code AS store, q.code AS qr FROM locations l JOIN stores s ON s.id = l.store_id
       JOIN qr_codes q ON q.entity_type = 'location' AND q.entity_id = l.id
      WHERE l.company_id = $1 AND l.id = ANY($2) ORDER BY s.code, l.code`, [u.companyId, locationIds])).rows : [];
  return { items, locations };
}

export async function resolveQr(u: SessionUser, code: string) {
  return (await db().query('SELECT entity_type, entity_id FROM qr_codes WHERE code = $1 AND company_id = $2',
    [code.toLowerCase(), u.companyId])).rows[0] ?? null;
}

export async function itemCode(u: SessionUser, id: number): Promise<string | null> {
  if (!Number.isSafeInteger(id)) return null;
  return (await db().query('SELECT code FROM items WHERE id = $1 AND company_id = $2', [id, u.companyId])).rows[0]?.code ?? null;
}
