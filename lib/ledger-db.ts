// PostgreSQL stock ledger (rules DB-1..DB-8 in docs/phase-1/DESIGN.md).
// Behaviour must match the reference model in modules/ledger — checked by the
// differential test in tests/db/differential.test.ts (DB-6).
import { createHash } from 'node:crypto';
import type { Client, Db } from './db.ts';
import { tx } from './db.ts';
import { AppError, fail } from './errors.ts';
import { FACTOR_SCALE, SCALE, format, mulDiv, parseDec } from './decimal.ts';

export type Role = 'admin' | 'storekeeper' | 'pm' | 'engineer';
export type Ctx = { companyId: number; userId: number; role: Role; storeIds: number[] | 'all' };

export type GrnLine = {
  itemId: number; received: number | string; rejected?: number | string; rejectReason?: string;
  unitCost: number | string; uom?: string; locationId?: number;
};
export type IssueLine = { itemId: number; qty: number | string; uom?: string; locationId?: number };
export type GrnDoc = {
  key: string; type: 'GRN'; storeId: number; supplierId?: number; supplierRef?: string;
  vehicle?: string; note?: string; lines: GrnLine[];
};
export type IssueDoc = {
  key: string; type: 'ISSUE'; storeId: number; receiverName: string; workArea?: string;
  note?: string; lines: IssueLine[];
};
export type PostResult = { id: number; docNo: string; duplicate: boolean };

type Move = { storeId: number; locationId: number; itemId: number; qty: bigint; value?: bigint;
              recordedValue?: bigint; priceVariance?: bigint };

// ---------------------------------------------------------------------------

// Canonical JSON: object keys sorted, so field order never changes the
// fingerprint (DB-4).
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const fingerprintOf = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');

export function assertStoreAccess(ctx: Ctx, storeId: number) {
  if (ctx.storeIds !== 'all' && !ctx.storeIds.includes(storeId)) {
    fail('FORBIDDEN_STORE', 'you are not assigned to this store', 403);
  }
}

const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const text = (v: unknown, max = 200) =>
  v === undefined || v === null || v === '' ? null
  : typeof v === 'string' && v.length <= max ? v.trim() : fail('BAD_INPUT', `text too long or not text`);

// ---------------------------------------------------------------------------

export async function postDocument(db: Db, ctx: Ctx, doc: GrnDoc | IssueDoc): Promise<PostResult> {
  if (typeof doc?.key !== 'string' || doc.key.length < 1 || doc.key.length > 100) {
    fail('NO_KEY', 'document needs an idempotency key (1–100 characters)');
  }
  if (doc.type !== 'GRN' && doc.type !== 'ISSUE') fail('BAD_TYPE', `cannot post ${(doc as { type: unknown }).type}`);
  if (!Array.isArray(doc.lines) || doc.lines.length === 0) fail('NO_LINES', 'document has no lines');
  if (doc.lines.length > 200) fail('BAD_INPUT', 'at most 200 lines per document');
  if (!isId(doc.storeId)) fail('NO_STORE', 'document needs a store');
  if (doc.type === 'ISSUE' && !text(doc.receiverName, 120)) fail('NO_RECEIVER', 'who is receiving the material?');
  const { key, ...content } = doc;
  const fingerprint = fingerprintOf(content);

  return tx(db, async (c) => {
    const claimed = await claimKey(c, ctx, key, fingerprint, {
      type: doc.type, storeId: doc.storeId,
      supplierId: doc.type === 'GRN' ? doc.supplierId ?? null : null,
      supplierRef: doc.type === 'GRN' ? text(doc.supplierRef) : null,
      vehicle: doc.type === 'GRN' ? text(doc.vehicle, 40) : null,
      receiverName: doc.type === 'ISSUE' ? text(doc.receiverName, 120) : null,
      workArea: doc.type === 'ISSUE' ? text(doc.workArea) : null,
      note: text(doc.note, 1000), reversesId: null,
    });
    if (claimed.duplicate) {
      assertStoreAccess(ctx, doc.storeId);    // same fingerprint ⇒ same store
      return claimed;
    }

    const store = await c.query('SELECT id FROM stores WHERE id = $1 AND company_id = $2', [doc.storeId, ctx.companyId]);
    if (!store.rowCount) fail('NOT_FOUND', 'store not found', 404);
    assertStoreAccess(ctx, doc.storeId);
    if (doc.type === 'GRN' && doc.supplierId !== undefined) {
      const s = await c.query('SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2', [doc.supplierId, ctx.companyId]);
      if (!s.rowCount) fail('NOT_FOUND', 'supplier not found', 404);
    }

    const refs = await loadRefs(c, ctx, doc.storeId, doc.lines);
    const lines: unknown[][] = [];
    const moves: Move[] = doc.lines.map((l, i) => {
      const locationId = refs.location(l.locationId);
      const uom = l.uom ?? refs.baseUom(l.itemId);
      if (doc.type === 'GRN') {
        const g = l as GrnLine;
        // LED-7: stock rises by accepted = received − rejected; value = accepted × cost
        // in the unit it was bought in.
        const received = parseDec(g.received, 4, 'received');
        if (received <= 0n) fail('BAD_QTY', `received must be > 0 for line ${i + 1}`);
        const rejected = g.rejected === undefined ? 0n : parseDec(g.rejected, 4, 'rejected');
        if (rejected < 0n || rejected > received) fail('BAD_QTY', `rejected must be between 0 and received (line ${i + 1})`);
        if (g.unitCost === undefined || g.unitCost === null || g.unitCost === '') fail('BAD_COST', `unit cost required (line ${i + 1})`);
        const cost = parseDec(g.unitCost, 4, 'unit cost');
        if (cost < 0n) fail('BAD_COST', `unit cost must be ≥ 0 (line ${i + 1})`);
        const accepted = received - rejected;
        lines.push([i + 1, g.itemId, locationId, uom, format(received), format(rejected), text(g.rejectReason), format(cost)]);
        return { storeId: doc.storeId, locationId, itemId: g.itemId,
                 qty: mulDiv(accepted, refs.factor(g.itemId, uom), FACTOR_SCALE),
                 value: mulDiv(accepted, cost, SCALE) };
      }
      // Same check order as the reference model: item and unit, then quantity.
      const factor = refs.factor(l.itemId, uom);
      const q = parseDec((l as IssueLine).qty, 4, 'quantity');
      if (q <= 0n) fail('BAD_QTY', `quantity must be > 0 (line ${i + 1})`);
      lines.push([i + 1, l.itemId, locationId, uom, format(q), '0', null, null]);
      return { storeId: doc.storeId, locationId, itemId: l.itemId, qty: -mulDiv(q, factor, FACTOR_SCALE) };
    });

    await insertLines(c, claimed.id, lines);
    await applyMoves(c, ctx, claimed.id, moves);
    await audit(c, ctx, `post_${doc.type.toLowerCase()}`, 'document', claimed.id, { docNo: claimed.docNo });
    return claimed;
  });
}

// DB-7 / LED-1: equal-and-opposite entries; once per document; a reversal is
// never reversed. Stock leaving (a reversed receipt) leaves at the current
// average and the gap is recorded as price_variance (LED-6).
export async function reverseDocument(db: Db, ctx: Ctx, req: { key: string; documentId: number; note?: string }) {
  if (typeof req?.key !== 'string' || req.key.length < 1 || req.key.length > 100) fail('NO_KEY', 'reversal needs an idempotency key');
  if (!isId(req.documentId)) fail('NOT_FOUND', 'document not found', 404);
  const fingerprint = fingerprintOf({ type: 'REVERSAL', documentId: req.documentId });

  return tx(db, async (c) => {
    const orig = (await c.query(
      'SELECT id, type, store_id FROM documents WHERE id = $1 AND company_id = $2',
      [req.documentId, ctx.companyId])).rows[0];
    if (!orig) fail('NOT_FOUND', 'document not found', 404);
    const existing = (await c.query(
      'SELECT id, doc_no, idem_key FROM documents WHERE reverses_id = $1', [orig.id])).rows[0];
    if (existing?.idem_key === req.key) return { id: existing.id, docNo: existing.doc_no, duplicate: true };
    if (orig.type === 'REVERSAL') fail('BAD_TYPE', 'a reversal cannot be reversed; post the document again');
    if (existing) fail('ALREADY_REVERSED', `already reversed by ${existing.doc_no}`, 409);
    assertStoreAccess(ctx, orig.store_id);

    const claimed = await claimKey(c, ctx, req.key, fingerprint, {
      type: 'REVERSAL', storeId: orig.store_id, supplierId: null, supplierRef: null, vehicle: null,
      receiverName: null, workArea: null, note: text(req.note, 1000), reversesId: orig.id,
    });
    if (claimed.duplicate) return claimed;

    const entries = (await c.query(
      'SELECT store_id, location_id, item_id, qty, value FROM stock_entries WHERE document_id = $1 ORDER BY id',
      [orig.id])).rows;
    const moves: Move[] = entries.map((e) => {
      const qty = -parseDec(e.qty), value = -parseDec(e.value);
      return qty < 0n
        ? { storeId: e.store_id, locationId: e.location_id, itemId: e.item_id, qty, recordedValue: value }
        : { storeId: e.store_id, locationId: e.location_id, itemId: e.item_id, qty, value };
    });
    await applyMoves(c, ctx, claimed.id, moves);
    await audit(c, ctx, 'reverse', 'document', claimed.id, { reverses: orig.id });
    return claimed;
  });
}

// ---------------------------------------------------------------------------

type Header = { type: string; storeId: number; supplierId: number | null; supplierRef: string | null;
                vehicle: string | null; receiverName: string | null; workArea: string | null;
                note: string | null; reversesId: number | null };

// DB-4: claim the idempotency key first. A concurrent identical request waits
// on the unique index and then sees this row; a failed post rolls back and
// frees the key for a retry.
async function claimKey(c: Client, ctx: Ctx, key: string, fingerprint: string, h: Header): Promise<PostResult> {
  let rows;
  try {
    ({ rows } = await c.query(
      `INSERT INTO documents (company_id, idem_key, fingerprint, type, doc_no, store_id, supplier_id,
         supplier_ref, vehicle, receiver_name, work_area, note, reverses_id, posted_by)
       VALUES ($1, $2, $3, $4, $4 || '-' || lpad(nextval('document_no_seq')::text, 6, '0'),
               $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (company_id, idem_key) DO NOTHING
       RETURNING id, doc_no`,
      [ctx.companyId, key, fingerprint, h.type, h.storeId, h.supplierId, h.supplierRef, h.vehicle,
       h.receiverName, h.workArea, h.note, h.reversesId, ctx.userId]));
  } catch (e) {
    if ((e as { constraint?: string }).constraint === 'documents_reverses_id_key') {
      fail('ALREADY_REVERSED', 'document was reversed by another request', 409);
    }
    throw e;
  }
  if (rows.length) return { id: rows[0].id, docNo: rows[0].doc_no, duplicate: false };
  const prior = (await c.query(
    'SELECT id, doc_no, fingerprint FROM documents WHERE company_id = $1 AND idem_key = $2',
    [ctx.companyId, key])).rows[0];
  if (prior.fingerprint !== fingerprint) fail('KEY_REUSED', `key ${key} was used for a different document`, 409);
  return { id: prior.id, docNo: prior.doc_no, duplicate: true };
}

async function loadRefs(c: Client, ctx: Ctx, storeId: number, lines: { itemId: number; locationId?: number }[]) {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  if (!itemIds.every(isId)) fail('UNKNOWN_ITEM', 'line has no item');
  const items = new Map((await c.query(
    'SELECT id, base_uom FROM items WHERE company_id = $1 AND id = ANY($2)', [ctx.companyId, itemIds])).rows
    .map((r) => [r.id, r.base_uom as string]));
  for (const id of itemIds) if (!items.has(id)) fail('UNKNOWN_ITEM', `item ${id} not found`, 404);
  const factors = new Map((await c.query(
    'SELECT item_id, uom, factor FROM item_uoms WHERE item_id = ANY($1)', [itemIds])).rows
    .map((r) => [`${r.item_id}|${r.uom}`, parseDec(r.factor, 6)]));
  const locations = new Map((await c.query(
    'SELECT id, code, system FROM locations WHERE store_id = $1 AND company_id = $2', [storeId, ctx.companyId])).rows
    .map((r) => [r.id, r]));
  const main = [...locations.values()].find((l) => l.code === 'MAIN');
  return {
    baseUom: (itemId: number) => items.get(itemId)!,
    factor: (itemId: number, uom: string) =>
      factors.get(`${itemId}|${uom}`) ?? fail('BAD_UOM', `item ${itemId} has no unit ${uom}`),
    location: (id?: number): number => {
      const loc = id === undefined ? main : locations.get(id);
      if (!loc) return fail('NOT_FOUND', 'location not found in this store', 404);
      if (loc.system) return fail('SYSTEM_LOCATION', `${loc.code} is managed by the system`);
      return loc.id;
    },
  };
}

async function insertLines(c: Client, documentId: number, lines: unknown[][]) {
  const values: unknown[] = [];
  const rows = lines.map((l, i) => {
    values.push(documentId, ...l);
    const b = i * 9;
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`;
  });
  await c.query(
    `INSERT INTO document_lines (document_id, line_no, item_id, location_id, uom, qty, rejected, reject_reason, unit_cost)
     VALUES ${rows.join(', ')}`, values);
}

// DB-2 / DB-3: lock every balance row this document touches, in one fixed
// order, then apply all moves in memory before writing anything.
async function applyMoves(c: Client, ctx: Ctx, documentId: number, moves: Move[]) {
  const keyOf = (m: { storeId: number; locationId: number; itemId: number }) => `${m.storeId}|${m.locationId}|${m.itemId}`;
  const keys = [...new Map(moves.map((m) => [keyOf(m), m])).values()]
    .sort((a, b) => a.storeId - b.storeId || a.locationId - b.locationId || a.itemId - b.itemId);

  // Create missing rows in the same sorted order, so two first-time postings
  // can never wait on each other's inserts in opposite orders.
  const ins: unknown[] = [];
  await c.query(
    `INSERT INTO stock_balances (company_id, store_id, location_id, item_id)
     VALUES ${keys.map((k, i) => { ins.push(ctx.companyId, k.storeId, k.locationId, k.itemId);
                                    return `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`; }).join(', ')}
     ON CONFLICT DO NOTHING`, ins);
  const sel: unknown[] = [];
  const locked = (await c.query(
    `SELECT store_id, location_id, item_id, qty, value FROM stock_balances
     WHERE (store_id, location_id, item_id) IN (${keys.map((k, i) => { sel.push(k.storeId, k.locationId, k.itemId);
       return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`; }).join(', ')})
     ORDER BY store_id, location_id, item_id
     FOR UPDATE`, sel)).rows;
  const bal = new Map(locked.map((r) => [
    `${r.store_id}|${r.location_id}|${r.item_id}`, { qty: parseDec(r.qty), value: parseDec(r.value) }]));

  for (const m of moves) {
    const b = bal.get(keyOf(m))!;
    if (m.value === undefined) {
      // Outbound at the current weighted average (LED-6).
      m.value = b.qty === 0n ? 0n : mulDiv(b.value, m.qty, b.qty);
      if (m.recordedValue !== undefined) m.priceVariance = m.recordedValue - m.value;
    }
    b.qty += m.qty;
    b.value += m.value;
    if (b.qty < 0n) {
      fail('NEGATIVE_STOCK', `not enough stock: short by ${format(-b.qty)} (item ${m.itemId})`, 409);
    }
  }

  const ev: unknown[] = [];
  await c.query(
    `INSERT INTO stock_entries (company_id, document_id, store_id, location_id, item_id, qty, value, price_variance)
     VALUES ${moves.map((m, i) => {
       ev.push(ctx.companyId, documentId, m.storeId, m.locationId, m.itemId, format(m.qty), format(m.value!),
               m.priceVariance === undefined ? null : format(m.priceVariance));
       const b = i * 8;
       return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`;
     }).join(', ')}`, ev);
  for (const k of keys) {
    const b = bal.get(keyOf(k))!;
    await c.query(
      'UPDATE stock_balances SET qty = $4, value = $5 WHERE store_id = $1 AND location_id = $2 AND item_id = $3',
      [k.storeId, k.locationId, k.itemId, format(b.qty), format(b.value)]);
  }
}

export async function audit(c: Client, ctx: Ctx, action: string, entity: string, entityId: number | null, data?: unknown) {
  await c.query(
    'INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, data) VALUES ($1, $2, $3, $4, $5, $6)',
    [ctx.companyId, ctx.userId, action, entity, entityId, data === undefined ? null : JSON.stringify(data)]);
}

export { AppError };
