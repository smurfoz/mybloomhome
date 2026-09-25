import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id            INTEGER PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  barcode       TEXT UNIQUE,
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  category      TEXT,
  reorder_level REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  contact    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS installers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  company    TEXT,
  phone      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name       TEXT NOT NULL,
  address    TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One row per recorded event (a delivery note, an issue slip, a return, an adjustment).
CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY,
  ref          TEXT UNIQUE,
  type         TEXT NOT NULL CHECK (type IN ('DELIVERY','ISSUE','RETURN','ADJUSTMENT')),
  supplier_id  INTEGER REFERENCES suppliers(id),
  installer_id INTEGER REFERENCES installers(id),
  project_id   INTEGER REFERENCES projects(id),
  external_ref TEXT,
  recorded_by  TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS documents_type_created ON documents(type, created_at);
-- A supplier's delivery note can only be received once (makes webhook retries safe).
CREATE UNIQUE INDEX IF NOT EXISTS documents_delivery_note
  ON documents(supplier_id, external_ref) WHERE type = 'DELIVERY' AND external_ref IS NOT NULL;

-- Append-only stock ledger. On-hand stock is always SUM(qty_change).
CREATE TABLE IF NOT EXISTS movements (
  id           INTEGER PRIMARY KEY,
  document_id  INTEGER NOT NULL REFERENCES documents(id),
  item_id      INTEGER NOT NULL REFERENCES items(id),
  type         TEXT NOT NULL,
  qty_change   REAL NOT NULL,
  installer_id INTEGER REFERENCES installers(id),
  project_id   INTEGER REFERENCES projects(id),
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS movements_item ON movements(item_id);
CREATE INDEX IF NOT EXISTS movements_installer ON movements(installer_id, item_id);
CREATE INDEX IF NOT EXISTS movements_project ON movements(project_id);

CREATE TRIGGER IF NOT EXISTS movements_no_update BEFORE UPDATE ON movements
BEGIN SELECT RAISE(ABORT, 'stock ledger is append-only; record an adjustment instead'); END;
CREATE TRIGGER IF NOT EXISTS movements_no_delete BEFORE DELETE ON movements
BEGIN SELECT RAISE(ABORT, 'stock ledger is append-only; record an adjustment instead'); END;
`;

export function openDatabase(file = process.env.INVENTORY_DB || 'data/inventory.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}
