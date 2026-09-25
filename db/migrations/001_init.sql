-- Phase 1 schema. Rules referenced here are defined in docs/phase-1/DESIGN.md.
-- Every business table carries company_id (SEC-2).

CREATE TABLE companies (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL
);

CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'storekeeper', 'pm', 'engineer')),
  active        boolean NOT NULL DEFAULT true
);

-- SEC-1: only a hash of the session token is stored.
CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL
);

CREATE TABLE projects (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id),
  name        text NOT NULL
);

CREATE TABLE stores (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id),
  project_id  bigint NOT NULL REFERENCES projects(id),
  code        text NOT NULL,
  name        text NOT NULL,
  UNIQUE (company_id, code)
);

CREATE TABLE locations (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id),
  store_id    bigint NOT NULL REFERENCES stores(id),
  code        text NOT NULL,
  name        text NOT NULL,
  system      boolean NOT NULL DEFAULT false,   -- TRANSIT / QUARANTINE: not user-selectable
  UNIQUE (store_id, code)
);

-- SEC-4
CREATE TABLE user_stores (
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id    bigint NOT NULL REFERENCES stores(id),
  PRIMARY KEY (user_id, store_id)
);

CREATE TABLE suppliers (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id),
  name        text NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE items (
  id              bigserial PRIMARY KEY,
  company_id      bigint NOT NULL REFERENCES companies(id),
  code            text NOT NULL,
  name            text NOT NULL,
  category        text NOT NULL,
  base_uom        text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('consumable', 'asset')),
  returnable      boolean NOT NULL DEFAULT false,
  hazardous       boolean NOT NULL DEFAULT false,
  restricted      boolean NOT NULL DEFAULT false,
  issue_to_person boolean NOT NULL DEFAULT false,
  attributes      jsonb NOT NULL DEFAULT '{}',
  reorder_level   numeric(18,4) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  created_by      bigint REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- Conversion: 1 <uom> = factor × base unit. The base unit itself has factor 1.
CREATE TABLE item_uoms (
  item_id     bigint NOT NULL REFERENCES items(id),
  uom         text NOT NULL,
  factor      numeric(18,6) NOT NULL CHECK (factor > 0),
  PRIMARY KEY (item_id, uom)
);

-- APP-1: corrections to Smart Category suggestions.
CREATE TABLE category_overrides (
  company_id      bigint NOT NULL REFERENCES companies(id),
  normalized_name text NOT NULL,
  category        text NOT NULL,
  created_by      bigint REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, normalized_name)
);

-- APP-2: opaque QR codes.
CREATE TABLE qr_codes (
  code        text PRIMARY KEY CHECK (length(code) >= 10),
  company_id  bigint NOT NULL REFERENCES companies(id),
  entity_type text NOT NULL CHECK (entity_type IN ('item', 'location', 'document')),
  entity_id   bigint NOT NULL,
  UNIQUE (entity_type, entity_id)
);

-- Document numbers come from a sequence rather than a per-company counter row:
-- a counter row would serialise every posting in the company behind one lock.
-- Numbers are unique and increasing, not gapless (a rolled-back post uses one).
CREATE SEQUENCE document_no_seq;

CREATE TABLE documents (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id),
  idem_key      text NOT NULL,
  fingerprint   text NOT NULL,
  type          text NOT NULL CHECK (type IN ('GRN', 'ISSUE', 'REVERSAL')),
  doc_no        text NOT NULL,
  store_id      bigint REFERENCES stores(id),
  supplier_id   bigint REFERENCES suppliers(id),
  supplier_ref  text,             -- delivery note / invoice number
  vehicle       text,
  receiver_name text,             -- ISSUE: who took the material
  work_area     text,             -- ISSUE: where it is used
  reverses_id   bigint REFERENCES documents(id),
  note          text,
  posted_by     bigint NOT NULL REFERENCES users(id),
  posted_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idem_key),  -- DB-4
  UNIQUE (reverses_id),           -- DB-7: at most one reversal per document
  UNIQUE (company_id, doc_no)
);

CREATE TABLE document_lines (
  id            bigserial PRIMARY KEY,
  document_id   bigint NOT NULL REFERENCES documents(id),
  line_no       int NOT NULL,
  item_id       bigint NOT NULL REFERENCES items(id),
  location_id   bigint NOT NULL REFERENCES locations(id),
  uom           text NOT NULL,
  qty           numeric(18,4) NOT NULL,          -- ISSUE qty / GRN received
  rejected      numeric(18,4) NOT NULL DEFAULT 0,
  reject_reason text,
  unit_cost     numeric(18,4),
  UNIQUE (document_id, line_no)
);

CREATE TABLE stock_entries (
  id             bigserial PRIMARY KEY,
  company_id     bigint NOT NULL REFERENCES companies(id),
  document_id    bigint NOT NULL REFERENCES documents(id),
  store_id       bigint NOT NULL REFERENCES stores(id),
  location_id    bigint NOT NULL REFERENCES locations(id),
  item_id        bigint NOT NULL REFERENCES items(id),
  qty            numeric(18,4) NOT NULL,          -- base unit, signed
  value          numeric(18,4) NOT NULL,          -- signed
  price_variance numeric(18,4),                   -- DB-7: reversed receipts
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_entries_item ON stock_entries (company_id, item_id, id);
CREATE INDEX stock_entries_doc ON stock_entries (document_id);

-- DB-1: the ledger is append-only.
CREATE FUNCTION stock_entries_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_entries is append-only (%)', TG_OP USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER stock_entries_no_update BEFORE UPDATE OR DELETE ON stock_entries
  FOR EACH ROW EXECUTE FUNCTION stock_entries_append_only();
CREATE TRIGGER stock_entries_no_truncate BEFORE TRUNCATE ON stock_entries
  FOR EACH STATEMENT EXECUTE FUNCTION stock_entries_append_only();

CREATE TABLE stock_balances (
  company_id  bigint NOT NULL REFERENCES companies(id),
  store_id    bigint NOT NULL REFERENCES stores(id),
  location_id bigint NOT NULL REFERENCES locations(id),
  item_id     bigint NOT NULL REFERENCES items(id),
  qty         numeric(18,4) NOT NULL DEFAULT 0 CHECK (qty >= 0),   -- DB-3 backstop
  value       numeric(18,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, location_id, item_id)
);
CREATE INDEX stock_balances_item ON stock_balances (company_id, item_id);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id),
  user_id     bigint REFERENCES users(id),
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   bigint,
  data        jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

