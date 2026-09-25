import type { Db } from './db.ts';
import { tx } from './db.ts';
import { fail } from './errors.ts';
import { format, parseDec } from './decimal.ts';
import { audit, type Ctx } from './ledger-db.ts';
import { createQr, extractQrCode } from './qr.ts';
import { classify, normalize } from '../modules/smart-category/classify.mjs';
import { TAXONOMY } from '../modules/smart-category/taxonomy.mjs';

export type NewItem = {
  code: string; name: string; category: string; baseUom: string;
  conversions?: { uom: string; factor: number | string }[];
  reorderLevel?: number | string; attributes?: Record<string, unknown>;
};

export async function getOverrides(db: Db, companyId: number): Promise<Record<string, string>> {
  const rows = (await db.query(
    'SELECT normalized_name, category FROM category_overrides WHERE company_id = $1', [companyId])).rows;
  return Object.fromEntries(rows.map((r) => [r.normalized_name, r.category]));
}

const UOM = /^[a-z0-9]{1,12}$/i;

export async function createItem(db: Db, ctx: Ctx, input: NewItem) {
  const code = String(input?.code ?? '').trim().toUpperCase();
  const name = String(input?.name ?? '').trim();
  if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(code)) fail('BAD_INPUT', 'code: 2–40 letters, digits or dashes');
  if (name.length < 2 || name.length > 200) fail('BAD_INPUT', 'name: 2–200 characters');
  const category = TAXONOMY.find((c) => c.code === input.category);
  if (!category) fail('BAD_INPUT', `unknown category ${input.category}`);
  const baseUom = String(input.baseUom ?? '').trim();
  if (!UOM.test(baseUom)) fail('BAD_UOM', 'base unit is required');
  const conversions = (input.conversions ?? []).map((c) => {
    const uom = String(c.uom ?? '').trim();
    if (!UOM.test(uom) || uom === baseUom) fail('BAD_UOM', `bad unit ${uom}`);
    const factor = parseDec(c.factor, 6, `factor for ${uom}`);
    if (factor <= 0n) fail('BAD_UOM', `factor for ${uom} must be > 0`);
    return { uom, factor: format(factor, 6) };
  });
  if (new Set(conversions.map((c) => c.uom)).size !== conversions.length) fail('BAD_UOM', 'duplicate unit');
  const reorder = input.reorderLevel === undefined || input.reorderLevel === '' ? 0n : parseDec(input.reorderLevel, 4, 'reorder level');
  if (reorder < 0n) fail('BAD_INPUT', 'reorder level must be ≥ 0');

  // APP-1: the server re-runs the classifier (with this company's overrides).
  // If the user chose something else, that choice becomes an override.
  const overrides = await getOverrides(db, ctx.companyId);
  const suggestion = classify(name, { overrides });
  const attributes = { ...suggestion.attributes, ...(input.attributes ?? {}) };
  const d = category.code === suggestion.category && suggestion.defaults ? suggestion.defaults : {
    baseUom: category.baseUom, kind: category.kind, returnable: category.returnable,
    hazardous: category.hazardous, restricted: category.restricted, issueToPerson: category.issueToPerson };

  return tx(db, async (c) => {
    let id: number;
    try {
      id = (await c.query(
        `INSERT INTO items (company_id, code, name, category, base_uom, kind, returnable, hazardous, restricted,
           issue_to_person, attributes, reorder_level, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [ctx.companyId, code, name, category.code, baseUom, d.kind, d.returnable, d.hazardous, d.restricted,
         d.issueToPerson, JSON.stringify(attributes), format(reorder), ctx.userId])).rows[0].id;
    } catch (e) {
      if ((e as { constraint?: string }).constraint === 'items_company_id_code_key') fail('DUPLICATE', `item code ${code} already exists`, 409);
      throw e;
    }
    await c.query('INSERT INTO item_uoms (item_id, uom, factor) VALUES ($1, $2, 1)', [id, baseUom]);
    for (const conv of conversions) {
      await c.query('INSERT INTO item_uoms (item_id, uom, factor) VALUES ($1, $2, $3)', [id, conv.uom, conv.factor]);
    }
    const qr = await createQr(c, ctx.companyId, 'item', id);
    let learned = false;
    if (suggestion.category !== category.code) {
      await c.query(
        `INSERT INTO category_overrides (company_id, normalized_name, category, created_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (company_id, normalized_name) DO UPDATE SET category = EXCLUDED.category, created_by = EXCLUDED.created_by, created_at = now()`,
        [ctx.companyId, normalize(name), category.code, ctx.userId]);
      learned = true;
    }
    await audit(c, ctx, 'create', 'item', id, { code, category: category.code, suggested: suggestion.category, learned });
    return { id, code, qr, learned, suggested: suggestion.category };
  });
}

// APP-4: QR URL, bare QR code, or item code → item.
export async function findItemByScan(db: Db, ctx: Ctx, input: string) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const qr = extractQrCode(raw);
  if (qr) {
    const hit = (await db.query(
      `SELECT i.id, i.code, i.name, i.base_uom FROM qr_codes q JOIN items i ON i.id = q.entity_id
        WHERE q.code = $1 AND q.company_id = $2 AND q.entity_type = 'item'`, [qr, ctx.companyId])).rows[0];
    if (hit) return hit;
  }
  return (await db.query(
    'SELECT id, code, name, base_uom FROM items WHERE company_id = $1 AND code = upper($2)',
    [ctx.companyId, raw])).rows[0] ?? null;
}

export async function itemUoms(db: Db, ctx: Ctx, itemId: number) {
  return (await db.query(
    `SELECT u.uom, u.factor FROM item_uoms u JOIN items i ON i.id = u.item_id
      WHERE i.id = $1 AND i.company_id = $2 ORDER BY u.factor = 1 DESC, u.uom`, [itemId, ctx.companyId])).rows;
}
