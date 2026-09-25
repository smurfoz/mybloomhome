// Domain logic. Every stock change goes through recordDocument(), which writes a
// document header plus one ledger movement per line inside a single transaction,
// stamps it with a server-side timestamp and an auto-generated reference number.

export class InventoryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const REF_PREFIX = { DELIVERY: 'DEL', ISSUE: 'ISS', RETURN: 'RET', ADJUSTMENT: 'ADJ' };

const now = () => new Date().toISOString();
const clean = (v) => (typeof v === 'string' ? v.trim() || null : v ?? null);

function positiveQty(qty, label) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) throw new InventoryError(`${label}: quantity must be a positive number`);
  return n;
}

export function createInventory(db) {
  const q = (sql) => db.prepare(sql);

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      if (String(err.message).includes('UNIQUE constraint failed')) {
        throw new InventoryError('A record with that unique value already exists', 409);
      }
      throw err;
    }
  }

  // ---------- master data ----------

  function findItem(line) {
    if (line.item_id != null) return q('SELECT * FROM items WHERE id = ?').get(Number(line.item_id));
    const code = clean(line.sku ?? line.barcode ?? line.code);
    if (!code) return undefined;
    return q('SELECT * FROM items WHERE sku = ? COLLATE NOCASE OR barcode = ?').get(code, code);
  }

  function createItem({ sku, name, unit, category, reorder_level, barcode }) {
    sku = clean(sku);
    name = clean(name);
    if (!sku || !name) throw new InventoryError('Item needs a SKU and a name');
    const { lastInsertRowid } = q(
      'INSERT INTO items (sku, barcode, name, unit, category, reorder_level) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(sku, clean(barcode), name, clean(unit) || 'pcs', clean(category), Number(reorder_level) || 0);
    return getItem(Number(lastInsertRowid));
  }

  function updateItem(id, fields) {
    const item = q('SELECT * FROM items WHERE id = ?').get(Number(id));
    if (!item) throw new InventoryError('Item not found', 404);
    const next = { ...item };
    for (const k of ['sku', 'barcode', 'name', 'unit', 'category']) if (k in fields) next[k] = clean(fields[k]);
    if ('reorder_level' in fields) next.reorder_level = Number(fields.reorder_level) || 0;
    if (!next.sku || !next.name) throw new InventoryError('Item needs a SKU and a name');
    try {
      q('UPDATE items SET sku=?, barcode=?, name=?, unit=?, category=?, reorder_level=? WHERE id=?').run(
        next.sku, next.barcode, next.name, next.unit || 'pcs', next.category, next.reorder_level, item.id
      );
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new InventoryError('SKU or barcode already in use', 409);
      throw err;
    }
    return getItem(item.id);
  }

  const ITEM_STOCK_SQL = `
    SELECT i.*,
      COALESCE((SELECT SUM(qty_change) FROM movements m WHERE m.item_id = i.id), 0) AS on_hand,
      COALESCE((SELECT SUM(-qty_change) FROM movements m
                 WHERE m.item_id = i.id AND m.type IN ('ISSUE','RETURN')), 0) AS with_installers
    FROM items i`;

  function getItem(id) {
    return q(`${ITEM_STOCK_SQL} WHERE i.id = ?`).get(Number(id));
  }

  function listItems() {
    return q(`${ITEM_STOCK_SQL} ORDER BY i.name`).all();
  }

  function lookupItem(code) {
    const item = findItem({ code });
    if (!item) throw new InventoryError(`No item with SKU or barcode "${code}"`, 404);
    return getItem(item.id);
  }

  function resolveSupplier({ supplier_id, supplier }) {
    if (supplier_id != null) {
      const s = q('SELECT * FROM suppliers WHERE id = ?').get(Number(supplier_id));
      if (!s) throw new InventoryError('Supplier not found', 404);
      return s;
    }
    const name = clean(supplier);
    if (!name) throw new InventoryError('A delivery needs a supplier');
    const existing = q('SELECT * FROM suppliers WHERE name = ?').get(name);
    if (existing) return existing;
    // New supplier names on a delivery are registered automatically.
    const { lastInsertRowid } = q('INSERT INTO suppliers (name) VALUES (?)').run(name);
    return q('SELECT * FROM suppliers WHERE id = ?').get(Number(lastInsertRowid));
  }

  function resolveInstaller({ installer_id, installer }, required) {
    let row;
    if (installer_id != null) row = q('SELECT * FROM installers WHERE id = ?').get(Number(installer_id));
    else if (clean(installer)) row = q('SELECT * FROM installers WHERE name = ?').get(clean(installer));
    else if (!required) return null;
    else throw new InventoryError('An installer is required');
    if (!row) throw new InventoryError('Installer not found', 404);
    if (!row.active) throw new InventoryError(`Installer ${row.name} is inactive`);
    return row;
  }

  function resolveProject({ project_id, project }) {
    let row;
    if (project_id != null && project_id !== '') row = q('SELECT * FROM projects WHERE id = ?').get(Number(project_id));
    else if (clean(project)) row = q('SELECT * FROM projects WHERE code = ?').get(clean(project));
    else return null;
    if (!row) throw new InventoryError('Project not found', 404);
    return row;
  }

  function addSupplier({ name, contact }) {
    if (!clean(name)) throw new InventoryError('Supplier name is required');
    return tx(() => {
      const { lastInsertRowid } = q('INSERT INTO suppliers (name, contact) VALUES (?, ?)').run(clean(name), clean(contact));
      return q('SELECT * FROM suppliers WHERE id = ?').get(Number(lastInsertRowid));
    });
  }

  function addInstaller({ name, company, phone }) {
    if (!clean(name)) throw new InventoryError('Installer name is required');
    return tx(() => {
      const { lastInsertRowid } = q('INSERT INTO installers (name, company, phone) VALUES (?, ?, ?)').run(
        clean(name), clean(company), clean(phone)
      );
      return q('SELECT * FROM installers WHERE id = ?').get(Number(lastInsertRowid));
    });
  }

  function addProject({ code, name, address }) {
    if (!clean(code) || !clean(name)) throw new InventoryError('Project needs a code and a name');
    return tx(() => {
      const { lastInsertRowid } = q('INSERT INTO projects (code, name, address) VALUES (?, ?, ?)').run(
        clean(code), clean(name), clean(address)
      );
      return q('SELECT * FROM projects WHERE id = ?').get(Number(lastInsertRowid));
    });
  }

  const listSuppliers = () => q('SELECT * FROM suppliers ORDER BY name').all();
  const listProjects = () => q('SELECT * FROM projects ORDER BY active DESC, code').all();
  const listInstallers = () =>
    q(`SELECT ins.*,
         COALESCE((SELECT SUM(-qty_change) FROM movements m
                    WHERE m.installer_id = ins.id AND m.type IN ('ISSUE','RETURN')), 0) AS units_held
       FROM installers ins ORDER BY ins.active DESC, ins.name`).all();

  function setActive(table, id, active) {
    const res = q(`UPDATE ${table} SET active = ? WHERE id = ?`).run(active ? 1 : 0, Number(id));
    if (!res.changes) throw new InventoryError('Not found', 404);
  }

  // ---------- stock queries ----------

  const onHand = (itemId) =>
    q('SELECT COALESCE(SUM(qty_change), 0) AS n FROM movements WHERE item_id = ?').get(itemId).n;

  const heldBy = (installerId, itemId) =>
    q(`SELECT COALESCE(SUM(-qty_change), 0) AS n FROM movements
        WHERE installer_id = ? AND item_id = ? AND type IN ('ISSUE','RETURN')`).get(installerId, itemId).n;

  function installerCustody(installerId) {
    const installer = q('SELECT * FROM installers WHERE id = ?').get(Number(installerId));
    if (!installer) throw new InventoryError('Installer not found', 404);
    const items = q(`
      SELECT i.id AS item_id, i.sku, i.name, i.unit,
             SUM(CASE WHEN m.type = 'ISSUE' THEN -m.qty_change ELSE 0 END) AS issued,
             SUM(CASE WHEN m.type = 'RETURN' THEN m.qty_change ELSE 0 END) AS returned,
             SUM(-m.qty_change) AS held,
             MAX(m.created_at) AS last_movement
        FROM movements m JOIN items i ON i.id = m.item_id
       WHERE m.installer_id = ? AND m.type IN ('ISSUE','RETURN')
       GROUP BY i.id ORDER BY i.name`).all(installer.id);
    return { installer, items };
  }

  // ---------- recording ----------

  // Collapse the submitted lines into one entry per item, resolving SKUs/barcodes.
  function resolveLines(lines, { autoCreate }) {
    if (!Array.isArray(lines) || lines.length === 0) throw new InventoryError('At least one line item is required');
    const merged = new Map();
    lines.forEach((line, i) => {
      const label = `Line ${i + 1}`;
      let item = findItem(line);
      if (!item) {
        if (autoCreate && clean(line.sku) && clean(line.name)) {
          item = createItem(line);
        } else {
          const code = line.item_id ?? line.sku ?? line.barcode ?? line.code ?? '(blank)';
          throw new InventoryError(`${label}: unknown item "${code}"`, 404);
        }
      }
      const qty = positiveQty(line.qty, label);
      const entry = merged.get(item.id) || { item, qty: 0 };
      entry.qty += qty;
      merged.set(item.id, entry);
    });
    return [...merged.values()];
  }

  function recordDocument(type, header, lines) {
    const createdAt = now();
    const { lastInsertRowid } = q(`
      INSERT INTO documents (type, supplier_id, installer_id, project_id, external_ref, recorded_by, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      type,
      header.supplier_id ?? null,
      header.installer_id ?? null,
      header.project_id ?? null,
      clean(header.external_ref),
      clean(header.recorded_by),
      clean(header.notes),
      createdAt
    );
    const docId = Number(lastInsertRowid);
    q('UPDATE documents SET ref = ? WHERE id = ?').run(`${REF_PREFIX[type]}-${String(docId).padStart(6, '0')}`, docId);

    const insert = q(`
      INSERT INTO movements (document_id, item_id, type, qty_change, installer_id, project_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const { item, change } of lines) {
      insert.run(docId, item.id, type, change, header.installer_id ?? null, header.project_id ?? null, createdAt);
    }
    return getDocument(docId);
  }

  /**
   * Goods arrive on site. Stock goes up automatically; unknown SKUs that come
   * with a name are added to the catalogue, and the same supplier delivery note
   * is never booked twice (a repeat returns the original record).
   */
  function receiveDelivery(input = {}) {
    return tx(() => {
      const supplier = resolveSupplier(input);
      const externalRef = clean(input.external_ref);
      if (externalRef) {
        const dup = q(`SELECT id FROM documents WHERE type = 'DELIVERY' AND supplier_id = ? AND external_ref = ?`)
          .get(supplier.id, externalRef);
        if (dup) return { ...getDocument(dup.id), duplicate: true };
      }
      const project = resolveProject(input);
      const lines = resolveLines(input.lines, { autoCreate: true }).map(({ item, qty }) => ({ item, change: qty }));
      return recordDocument('DELIVERY', { ...input, supplier_id: supplier.id, project_id: project?.id }, lines);
    });
  }

  /** Stock handed to an installer. Refuses to issue more than is on hand. */
  function issueToInstaller(input = {}) {
    return tx(() => {
      const installer = resolveInstaller(input, true);
      const project = resolveProject(input);
      const lines = resolveLines(input.lines, { autoCreate: false }).map(({ item, qty }) => {
        const available = onHand(item.id);
        if (qty > available) {
          throw new InventoryError(
            `Not enough ${item.name} (${item.sku}): requested ${qty} ${item.unit}, only ${available} on hand`, 409
          );
        }
        return { item, change: -qty };
      });
      return recordDocument('ISSUE', { ...input, installer_id: installer.id, project_id: project?.id }, lines);
    });
  }

  /** Unused stock coming back from an installer. */
  function returnFromInstaller(input = {}) {
    return tx(() => {
      const installer = resolveInstaller(input, true);
      const project = resolveProject(input);
      const lines = resolveLines(input.lines, { autoCreate: false }).map(({ item, qty }) => {
        const held = heldBy(installer.id, item.id);
        if (qty > held) {
          throw new InventoryError(
            `${installer.name} only holds ${held} ${item.unit} of ${item.name} (${item.sku}); cannot return ${qty}`, 409
          );
        }
        return { item, change: qty };
      });
      return recordDocument('RETURN', { ...input, installer_id: installer.id, project_id: project?.id }, lines);
    });
  }

  /** Stock-take corrections, damage, theft. Lines carry a signed `qty`. */
  function adjustStock(input = {}) {
    if (!clean(input.notes)) throw new InventoryError('Adjustments need a reason in notes');
    return tx(() => {
      if (!Array.isArray(input.lines) || input.lines.length === 0) {
        throw new InventoryError('At least one line item is required');
      }
      const lines = input.lines.map((line, i) => {
        const item = findItem(line);
        if (!item) throw new InventoryError(`Line ${i + 1}: unknown item`, 404);
        const change = Number(line.qty);
        if (!Number.isFinite(change) || change === 0) throw new InventoryError(`Line ${i + 1}: quantity must be non-zero`);
        if (onHand(item.id) + change < 0) {
          throw new InventoryError(`Line ${i + 1}: adjustment would take ${item.name} below zero`, 409);
        }
        return { item, change };
      });
      return recordDocument('ADJUSTMENT', { ...input, installer_id: null, project_id: null }, lines);
    });
  }

  // ---------- documents & reports ----------

  const DOC_SQL = `
    SELECT d.*, s.name AS supplier, ins.name AS installer, p.code AS project_code, p.name AS project_name,
           (SELECT COUNT(*) FROM movements m WHERE m.document_id = d.id) AS line_count
      FROM documents d
      LEFT JOIN suppliers s ON s.id = d.supplier_id
      LEFT JOIN installers ins ON ins.id = d.installer_id
      LEFT JOIN projects p ON p.id = d.project_id`;

  function getDocument(idOrRef) {
    const doc = typeof idOrRef === 'number'
      ? q(`${DOC_SQL} WHERE d.id = ?`).get(idOrRef)
      : q(`${DOC_SQL} WHERE d.ref = ?`).get(String(idOrRef).toUpperCase());
    if (!doc) throw new InventoryError('Document not found', 404);
    doc.lines = q(`
      SELECT m.item_id, i.sku, i.name, i.unit, ABS(m.qty_change) AS qty, m.qty_change
        FROM movements m JOIN items i ON i.id = m.item_id
       WHERE m.document_id = ? ORDER BY m.id`).all(doc.id);
    return doc;
  }

  function listDocuments({ type, limit = 50 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
    if (type) return q(`${DOC_SQL} WHERE d.type = ? ORDER BY d.id DESC LIMIT ?`).all(String(type).toUpperCase(), lim);
    return q(`${DOC_SQL} ORDER BY d.id DESC LIMIT ?`).all(lim);
  }

  function listMovements({ item_id, installer_id, project_id, type, from, to, limit = 1000 } = {}) {
    const where = [];
    const args = [];
    const add = (sql, v) => { where.push(sql); args.push(v); };
    if (item_id) add('m.item_id = ?', Number(item_id));
    if (installer_id) add('m.installer_id = ?', Number(installer_id));
    if (project_id) add('m.project_id = ?', Number(project_id));
    if (type) add('m.type = ?', String(type).toUpperCase());
    if (from) add('m.created_at >= ?', String(from));
    if (to) add('m.created_at < ?', String(to));
    args.push(Math.min(Math.max(Number(limit) || 1000, 1), 10000));
    return q(`
      SELECT m.id, m.created_at, m.type, d.ref, d.external_ref, d.recorded_by,
             i.sku, i.name AS item, i.unit, m.qty_change,
             s.name AS supplier, ins.name AS installer, p.code AS project
        FROM movements m
        JOIN documents d ON d.id = m.document_id
        JOIN items i ON i.id = m.item_id
        LEFT JOIN suppliers s ON s.id = d.supplier_id
        LEFT JOIN installers ins ON ins.id = m.installer_id
        LEFT JOIN projects p ON p.id = m.project_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY m.id DESC LIMIT ?`).all(...args);
  }

  function dashboard() {
    const today = now().slice(0, 10);
    const count = (type) =>
      q(`SELECT COUNT(*) AS n FROM documents WHERE type = ? AND created_at >= ?`).get(type, today).n;
    const items = listItems();
    return {
      totals: {
        items: items.length,
        installers: q('SELECT COUNT(*) AS n FROM installers WHERE active = 1').get().n,
        deliveries_today: count('DELIVERY'),
        issues_today: count('ISSUE'),
        returns_today: count('RETURN'),
      },
      low_stock: items.filter((i) => i.on_hand <= i.reorder_level && i.reorder_level > 0),
      recent: listDocuments({ limit: 10 }),
    };
  }

  return {
    createItem, updateItem, getItem, listItems, lookupItem,
    addSupplier, listSuppliers, addInstaller, listInstallers, addProject, listProjects,
    setInstallerActive: (id, a) => setActive('installers', id, a),
    setProjectActive: (id, a) => setActive('projects', id, a),
    receiveDelivery, issueToInstaller, returnFromInstaller, adjustStock,
    getDocument, listDocuments, listMovements, installerCustody, dashboard,
    createItemTx: (fields) => tx(() => createItem(fields)),
  };
}
