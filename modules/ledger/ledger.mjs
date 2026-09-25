// Stock-ledger module. Rules are defined in ./DESIGN.md (LED-1..LED-12).
// It is a reference model, not the production implementation: it pins down the
// business rules so the real (Postgres-backed) ledger can be tested against them.
//
// Quantities and money are stored as scaled integers (4 decimal places) so
// 2.5 m³ or 0.125 t never drift through floating-point error.

const SCALE = 10_000;
const toScaled = (n) => Math.round(n * SCALE);
const fromScaled = (n) => n / SCALE;

export const TRANSIT = '__TRANSIT__';
export const QUARANTINE = 'QUARANTINE';
const SYSTEM_LOCATIONS = new Set([TRANSIT, QUARANTINE]);

export class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => { throw new LedgerError(code, message); };
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export class Ledger {
  constructor({ allowNegative = false } = {}) {
    this.allowNegative = allowNegative;
    this.items = new Map(); // code -> { baseUom, factors: { uom: baseUnitsPerUom }, kind }
    this.entries = []; // append-only; each entry is frozen
    this.docs = new Map(); // idempotency key -> { id, type, fingerprint, entries }
    this.byId = new Map(); // doc id -> doc record
    this.reversed = new Set(); // doc ids that have been reversed
    this.balances = new Map(); // `${store}|${location}|${item}` -> { qty, value }
    this.counts = new Map();
    this.docSeq = 0; // one sequence number per posted document
  }

  defineItem(code, { baseUom, conversions = {}, kind = 'consumable' }) {
    for (const [u, f] of Object.entries(conversions)) {
      if (!isNum(f) || f <= 0) fail('BAD_UOM', `${code}: conversion for ${u} must be > 0`);
    }
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

  // Quantity as of a document sequence number, rebuilt from the ledger alone.
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
    return this.docSeq;
  }

  // --- posting ---------------------------------------------------------------

  // Every document carries a client-generated idempotency key. Re-posting the
  // same key with the same content (an offline queue retrying after a dropped
  // response) returns the original result instead of moving stock twice.
  // Re-using a key for DIFFERENT content is a client bug and is rejected, so
  // a document is never silently lost (LED-4).
  post(doc) {
    if (!doc?.key) fail('NO_KEY', 'document needs an idempotency key');
    const fingerprint = JSON.stringify(doc);
    const prior = this.docs.get(doc.key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail('KEY_REUSED', `key ${doc.key} was used for a different document`);
      return { id: prior.id, entries: prior.entries, duplicate: true };
    }
    if (!Array.isArray(doc.lines ?? doc.raw) || (doc.lines ?? doc.raw).length === 0) {
      fail('NO_LINES', 'document has no lines');
    }

    const moves = this.#plan(doc);

    // All-or-nothing (LED-2): validate every line against a scratch copy first.
    const scratch = new Map();
    const get = (k) => scratch.get(k) ?? { ...(this.balances.get(k) ?? { qty: 0, value: 0 }) };
    for (const m of moves) {
      const k = `${m.store}|${m.location}|${m.item}`;
      const b = get(k);
      if (m.value === undefined) {
        // Outbound at current weighted-average cost. Taking the whole balance
        // takes the whole value, so no rounding residue is ever left behind.
        m.value = b.qty === 0 ? 0 : Math.round((b.value * m.qty) / b.qty);
      }
      if (m.recordedValue !== undefined) {
        m.priceVariance = m.recordedValue - m.value;
        delete m.recordedValue;
      }
      b.qty += m.qty;
      b.value += m.value;
      if (b.qty < 0 && !this.allowNegative && m.location !== TRANSIT) {
        fail('NEGATIVE_STOCK', `${m.item} at ${m.store}/${m.location}: short by ${fromScaled(-b.qty)}`);
      }
      scratch.set(k, b);
    }

    const id = `${doc.type}-${this.docs.size + 1}`;
    const seq = ++this.docSeq;
    const written = moves.map((m) => Object.freeze({ ...m, seq, doc: id, type: doc.type }));
    this.entries.push(...written);
    for (const [k, b] of scratch) this.balances.set(k, b);

    const record = { id, type: doc.type, fingerprint, entries: written, reverses: doc.reverses };
    this.docs.set(doc.key, record);
    this.byId.set(id, record);
    if (doc.reverses) this.reversed.add(doc.reverses);
    return { id, entries: written };
  }

  // Corrections never edit history: they post equal-and-opposite entries (LED-1).
  // A document can be reversed once, a reversal cannot itself be reversed (post
  // the document again instead), and an issue with returns against it must have
  // those returns reversed first — otherwise the same stock comes back twice.
  reverse(key, docId) {
    const orig = this.byId.get(docId) ?? fail('NOT_FOUND', docId);
    const prior = this.docs.get(key);
    if (prior?.reverses === docId) return { id: prior.id, entries: prior.entries, duplicate: true };
    if (orig.type === 'REVERSAL') fail('BAD_TYPE', 'a reversal cannot be reversed; post the document again');
    if (this.reversed.has(docId)) fail('ALREADY_REVERSED', docId);
    const dependents = [...this.byId.values()].filter(
      (d) => d.type === 'RETURN_TO_STORE' && d.entries.some((e) => e.ref === docId) && !this.reversed.has(d.id));
    if (dependents.length) {
      fail('HAS_DEPENDENTS', `reverse ${dependents.map((d) => d.id).join(', ')} first`);
    }
    return this.post({ key, type: 'REVERSAL', reverses: docId,
                       raw: orig.entries.map((e) => ({ ...e, qty: -e.qty, value: -e.value })) });
  }

  startCount(store, item, location = 'MAIN') {
    const id = `COUNT-${this.counts.size + 1}`;
    this.counts.set(id, { store, item, location, open: true, startSeq: this.seq });
    return id;
  }

  // The physical count is compared with the system quantity at the moment the
  // shelf was counted (countedAtSeq), so movements posted between counting and
  // approval are not mistaken for variance (LED-10). The count only closes once
  // its adjustment has posted, and retrying with the same key is safe.
  postCount(key, countId, { counted, countedAtSeq }) {
    const c = this.counts.get(countId) ?? fail('NOT_FOUND', countId);
    if (c.key === key) return { ...c.result, duplicate: true };
    if (!c.open) fail('COUNT_CLOSED', countId);
    if (!isNum(counted) || counted < 0) fail('BAD_QTY', `counted must be >= 0, got ${counted}`);
    if (!Number.isInteger(countedAtSeq) || countedAtSeq < c.startSeq || countedAtSeq > this.seq) {
      fail('BAD_SEQ', `countedAtSeq must be between ${c.startSeq} and ${this.seq}`);
    }
    const expected = this.qtyAsOf(c.store, c.item, countedAtSeq, c.location);
    const variance = fromScaled(toScaled(counted) - toScaled(expected));
    const id = variance === 0 ? null : this.post({
      key, type: 'COUNT_ADJ', store: c.store,
      lines: [{ item: c.item, qty: variance, location: c.location }],
    }).id;
    Object.assign(c, { open: false, key, result: { variance, id } });
    return c.result;
  }

  // --- internals -------------------------------------------------------------

  #bal(store, location, item) {
    return this.balances.get(`${store}|${location}|${item}`) ?? { qty: 0, value: 0 };
  }

  #base(itemCode, qty, uom, { signed = false, allowZero = false } = {}) {
    const item = this.items.get(itemCode) ?? fail('UNKNOWN_ITEM', itemCode);
    const f = item.factors[uom ?? item.baseUom];
    if (f === undefined) fail('BAD_UOM', `${itemCode} has no unit ${uom}`);
    if (!isNum(qty) || (!signed && qty < 0) || (!allowZero && qty === 0)) {
      fail('BAD_QTY', `invalid quantity ${qty} for ${itemCode}`);
    }
    return { scaled: toScaled(qty * f), factor: f };
  }

  #plan(doc) {
    if (doc.type !== 'REVERSAL' && !doc.store) fail('NO_STORE', 'document needs a store');
    // LED-12: users may not post into system locations; only an adjustment may
    // write stock off from quarantine.
    const loc = (l) => {
      const where = l.location ?? 'MAIN';
      const allowed = doc.type === 'ADJUST' && where === QUARANTINE;
      if (SYSTEM_LOCATIONS.has(where) && !allowed) fail('SYSTEM_LOCATION', `${where} is managed by the system`);
      return where;
    };
    switch (doc.type) {
      case 'GRN':
        // Stock rises by ACCEPTED quantity only: received − rejected (LED-7).
        return doc.lines.map((l) => {
          if (!isNum(l.received) || l.received <= 0) fail('BAD_QTY', `received must be > 0 for ${l.item}`);
          const rejected = l.rejected ?? 0;
          if (!isNum(rejected) || rejected < 0 || rejected > l.received) {
            fail('BAD_QTY', `rejected must be between 0 and received for ${l.item}`);
          }
          if (!isNum(l.unitCost) || l.unitCost < 0) fail('BAD_COST', `unitCost required for ${l.item}`);
          const { scaled, factor } = this.#base(l.item, l.received - rejected, l.uom, { allowZero: true });
          return { store: doc.store, location: loc(l), item: l.item, qty: scaled,
                   value: Math.round(fromScaled(scaled) * (l.unitCost / factor) * SCALE) };
        });
      case 'ISSUE':
        return doc.lines.map((l) => ({ store: doc.store, location: loc(l), item: l.item,
                                       qty: -this.#base(l.item, l.qty, l.uom).scaled }));
      case 'RETURN_TO_STORE': {
        // LED-9: back to the store and bin it was issued from, valued at issue
        // cost; damaged goods go to quarantine. The total returned against an
        // issue can never exceed what it issued, and a reversed issue accepts
        // no returns.
        const pending = new Map();
        return doc.lines.map((l) => {
          const issue = this.byId.get(l.issueId);
          if (!issue || issue.type !== 'ISSUE') fail('NOT_FOUND', `no issue ${l.issueId}`);
          if (this.reversed.has(issue.id)) fail('ALREADY_REVERSED', `${issue.id} was reversed`);
          const src = issue.entries.filter((e) => e.item === l.item);
          if (!src.length) fail('NOT_FOUND', `no ${l.item} on ${l.issueId}`);
          if (src[0].store !== doc.store) fail('WRONG_STORE', `${issue.id} was issued from ${src[0].store}`);
          const issuedQty = -src.reduce((s, e) => s + e.qty, 0);
          const issuedValue = -src.reduce((s, e) => s + e.value, 0);
          const k = `${issue.id}|${l.item}`;
          const already = (pending.get(k) ?? 0) + this.#returned(issue.id, l.item);
          const { scaled } = this.#base(l.item, l.qty, l.uom);
          if (already + scaled > issuedQty) {
            fail('BAD_QTY', `return exceeds issued quantity (${fromScaled(issuedQty - already)} left)`);
          }
          pending.set(k, (pending.get(k) ?? 0) + scaled);
          return { store: doc.store, item: l.item, qty: scaled, ref: issue.id,
                   location: l.condition === 'damaged' ? QUARANTINE : src[0].location,
                   value: Math.round((issuedValue * scaled) / issuedQty) };
        });
      }
      case 'TRANSFER_OUT':
        // Stock sits in the destination's TRANSIT location until it is received,
        // carrying its value with it so nothing is created or lost (LED-8).
        if (!doc.to || doc.to === doc.store) fail('BAD_DEST', 'transfer needs a different destination store');
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
          if (scaled > t.qty) fail('BAD_QTY', 'receiving more than in transit');
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
        // Quantities are exactly opposite. Value follows LED-6: stock coming back
        // keeps its recorded value, but stock LEAVING (e.g. a reversed receipt)
        // leaves at the current average. Otherwise a reversed cheap receipt
        // would push the remaining stock's average above anything actually paid.
        // The gap is recorded as priceVariance for the price-difference account.
        return doc.raw.map(({ store, location, item, qty, value, ref }) =>
          ({ store, location, item, qty, ...(qty < 0 ? { recordedValue: value } : { value }),
             ...(ref ? { ref } : {}) }));
      default:
        return fail('BAD_TYPE', doc.type);
    }
  }

  // Quantity already returned against an issue, net of reversed returns.
  #returned(issueId, item) {
    return this.entries
      .filter((e) => e.ref === issueId && e.item === item)
      .reduce((s, e) => s + e.qty, 0);
  }
}
