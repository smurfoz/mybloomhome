// Stock-ledger module. Rules are defined in ./DESIGN.md (LED-1..LED-11).
// It is a proof harness, not the production implementation: it pins down the
// business rules so the real (Postgres-backed) ledger can be tested against them.
//
// Quantities and money are stored as scaled integers (4 decimal places) so
// 2.5 m³ or 0.125 t never drift through floating-point error.

const SCALE = 10_000;
const toScaled = (n) => Math.round(n * SCALE);
const fromScaled = (n) => n / SCALE;

export const TRANSIT = '__TRANSIT__';
export const QUARANTINE = 'QUARANTINE';

export class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class Ledger {
  constructor({ allowNegative = false } = {}) {
    this.allowNegative = allowNegative;
    this.items = new Map(); // code -> { baseUom, factors: { uom: baseUnitsPerUom }, kind }
    this.entries = []; // append-only; each entry is frozen
    this.docs = new Map(); // idempotency key -> { id, entries }
    this.balances = new Map(); // `${store}|${location}|${item}` -> { qty, value }
    this.counts = new Map();
  }

  defineItem(code, { baseUom, conversions = {}, kind = 'consumable' }) {
    this.items.set(code, { baseUom, factors: { [baseUom]: 1, ...conversions }, kind });
  }

  // --- queries -------------------------------------------------------------

  onHand(store, item, location = 'MAIN') {
    return fromScaled(this.#bal(store, location, item).qty);
  }

  value(store, item, location = 'MAIN') {
    return fromScaled(this.#bal(store, location, item).value);
  }

  avgCost(store, item, location = 'MAIN') {
    const b = this.#bal(store, location, item);
    return b.qty === 0 ? 0 : b.value / b.qty;
  }

  // Quantity as of a ledger sequence number, rebuilt from the ledger alone.
  qtyAsOf(store, item, seq, location = 'MAIN') {
    let q = 0;
    for (const e of this.entries) {
      if (e.seq > seq) break;
      if (e.store === store && e.location === location && e.item === item) q += e.qty;
    }
    return fromScaled(q);
  }

  // Replaying the ledger must always reproduce the running balances.
  replay() {
    const out = new Map();
    for (const e of this.entries) {
      const k = `${e.store}|${e.location}|${e.item}`;
      const b = out.get(k) ?? { qty: 0, value: 0 };
      b.qty += e.qty;
      b.value += e.value;
      out.set(k, b);
    }
    return out;
  }

  get seq() {
    return this.entries.length;
  }

  // --- posting ---------------------------------------------------------------

  // Every document carries a client-generated idempotency key. Re-posting the
  // same key (e.g. an offline queue retrying after a dropped response) returns
  // the original result instead of moving stock twice.
  post(doc) {
    if (!doc.key) throw new LedgerError('NO_KEY', 'document needs an idempotency key');
    const prior = this.docs.get(doc.key);
    if (prior) return { ...prior, duplicate: true };

    const moves = this.#plan(doc);

    // All-or-nothing: validate every line against a scratch copy before writing.
    const scratch = new Map();
    const get = (k) => scratch.get(k) ?? { ...(this.balances.get(k) ?? { qty: 0, value: 0 }) };
    for (const m of moves) {
      const k = `${m.store}|${m.location}|${m.item}`;
      const b = get(k);
      if (m.value === undefined) {
        // Outbound at current weighted-average cost.
        m.value = b.qty === 0 ? 0 : Math.round((b.value * m.qty) / b.qty);
      }
      b.qty += m.qty;
      b.value += m.value;
      if (b.qty < 0 && !this.allowNegative && m.location !== TRANSIT) {
        throw new LedgerError(
          'NEGATIVE_STOCK',
          `${m.item} at ${m.store}/${m.location}: short by ${fromScaled(-b.qty)}`
        );
      }
      if (b.qty === 0) b.value = 0; // clear rounding residue once a bin empties
      scratch.set(k, b);
    }

    const id = `${doc.type}-${this.docs.size + 1}`;
    const written = moves.map((m) =>
      Object.freeze({ ...m, seq: this.entries.length + 1, doc: id, type: doc.type })
    ).map((e) => (this.entries.push(e), e));
    for (const [k, b] of scratch) this.balances.set(k, b);

    const result = { id, entries: written };
    this.docs.set(doc.key, result);
    return result;
  }

  // Corrections never edit history: they post equal-and-opposite entries.
  reverse(key, docId) {
    const orig = [...this.docs.values()].find((d) => d.id === docId);
    if (!orig) throw new LedgerError('NOT_FOUND', docId);
    return this.post({
      key,
      type: 'REVERSAL',
      raw: orig.entries.map((e) => ({ ...e, qty: -e.qty, value: -e.value })),
    });
  }

  startCount(store, item, location = 'MAIN') {
    const id = `COUNT-${this.counts.size + 1}`;
    this.counts.set(id, { store, item, location, open: true });
    return id;
  }

  // The physical count is compared with the system quantity at the moment the
  // shelf was counted (countedAtSeq), so movements posted between counting and
  // approval are not mistaken for variance.
  postCount(key, countId, { counted, countedAtSeq }) {
    const c = this.counts.get(countId);
    if (!c?.open) throw new LedgerError('COUNT_CLOSED', countId);
    const expected = this.qtyAsOf(c.store, c.item, countedAtSeq, c.location);
    const variance = counted - expected;
    c.open = false;
    if (variance === 0) return { variance, id: null };
    const r = this.post({
      key,
      type: 'COUNT_ADJ',
      store: c.store,
      lines: [{ item: c.item, qty: variance, location: c.location }],
    });
    return { variance, id: r.id };
  }

  // --- internals -------------------------------------------------------------

  #bal(store, location, item) {
    return this.balances.get(`${store}|${location}|${item}`) ?? { qty: 0, value: 0 };
  }

  #base(itemCode, qty, uom, { signed = false } = {}) {
    const item = this.items.get(itemCode);
    if (!item) throw new LedgerError('UNKNOWN_ITEM', itemCode);
    const f = item.factors[uom ?? item.baseUom];
    if (f === undefined) throw new LedgerError('BAD_UOM', `${itemCode} has no unit ${uom}`);
    if (!Number.isFinite(qty) || (!signed && qty < 0)) {
      throw new LedgerError('BAD_QTY', `quantity must be >= 0, got ${qty}`);
    }
    return { scaled: toScaled(qty * f), factor: f };
  }

  #plan(doc) {
    const loc = (l) => l.location ?? 'MAIN';
    switch (doc.type) {
      case 'GRN':
        // Stock rises by ACCEPTED quantity only: received − rejected.
        return doc.lines.map((l) => {
          if (l.rejected > l.received) throw new LedgerError('BAD_QTY', 'rejected > received');
          const { scaled, factor } = this.#base(l.item, l.received - (l.rejected ?? 0), l.uom);
          const costPerBase = l.unitCost / factor;
          return { store: doc.store, location: loc(l), item: l.item, qty: scaled,
                   value: Math.round(fromScaled(scaled) * costPerBase * SCALE) };
        });
      case 'ISSUE':
        return doc.lines.map((l) => ({ store: doc.store, location: loc(l), item: l.item,
                                       qty: -this.#base(l.item, l.qty, l.uom).scaled }));
      case 'RETURN_TO_STORE':
        // Valued at the cost it left the store at; damaged goods go to quarantine.
        return doc.lines.map((l) => {
          const issue = [...this.docs.values()].find((d) => d.id === l.issueId);
          const src = issue?.entries.find((e) => e.item === l.item);
          if (!src) throw new LedgerError('NOT_FOUND', `no ${l.item} on ${l.issueId}`);
          const { scaled } = this.#base(l.item, l.qty, l.uom);
          const issuedQty = -src.qty;
          if (scaled > issuedQty) throw new LedgerError('BAD_QTY', 'return exceeds issued quantity');
          return { store: doc.store, item: l.item, qty: scaled,
                   location: l.condition === 'damaged' ? QUARANTINE : 'MAIN',
                   value: Math.round((-src.value * scaled) / issuedQty) };
        });
      case 'TRANSFER_OUT':
        // Stock sits in the destination's TRANSIT location until it is received,
        // carrying its value with it so nothing is created or lost on the way.
        return doc.lines.flatMap((l) => {
          const { scaled } = this.#base(l.item, l.qty, l.uom);
          const b = this.#bal(doc.store, loc(l), l.item);
          const v = b.qty === 0 ? 0 : Math.round((b.value * scaled) / b.qty);
          return [
            { store: doc.store, location: loc(l), item: l.item, qty: -scaled, value: -v },
            { store: doc.to, location: TRANSIT, item: l.item, qty: scaled, value: v },
          ];
        });
      case 'TRANSFER_IN':
        return doc.lines.flatMap((l) => {
          const { scaled } = this.#base(l.item, l.qty, l.uom);
          const t = this.#bal(doc.store, TRANSIT, l.item);
          if (scaled > t.qty) throw new LedgerError('BAD_QTY', 'receiving more than in transit');
          const v = Math.round((t.value * scaled) / t.qty);
          return [
            { store: doc.store, location: TRANSIT, item: l.item, qty: -scaled, value: -v },
            { store: doc.store, location: loc(l), item: l.item, qty: scaled, value: v },
          ];
        });
      case 'ADJUST':
      case 'COUNT_ADJ':
        // Signed quantity; valued at the current weighted-average cost.
        return doc.lines.map((l) => {
          const { scaled } = this.#base(l.item, l.qty, l.uom, { signed: true });
          const b = this.#bal(doc.store, loc(l), l.item);
          return { store: doc.store, location: loc(l), item: l.item, qty: scaled,
                   value: b.qty === 0 ? 0 : Math.round((b.value * scaled) / b.qty) };
        });
      case 'REVERSAL':
        return doc.raw.map(({ store, location, item, qty, value }) => ({ store, location, item, qty, value }));
      default:
        throw new LedgerError('BAD_TYPE', doc.type);
    }
  }
}
