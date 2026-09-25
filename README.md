# mybloomhome — construction site inventory

A small inventory system for a construction site store. It **records every
delivery and every issue to an installer automatically**: when stock arrives or
is handed out, the system writes a numbered, timestamped record and adjusts
stock straight away. Nobody has to update a spreadsheet afterwards.

## How recording works

| Event | What gets recorded automatically |
|---|---|
| **Delivery received** | `DEL-xxxxxx` record with supplier, delivery note/PO #, project, who received it, time. Stock goes up. New SKUs that come with a name are added to the catalogue. New supplier names are registered. |
| **Issued to installer** | `ISS-xxxxxx` record with installer, project, who issued it, time. Stock goes down and the installer's "material held" goes up. Issuing more than is on hand is refused. |
| **Returned by installer** | `RET-xxxxxx` record. Stock goes back up. An installer can only return what they currently hold. |
| **Adjustment** | `ADJ-xxxxxx` record with a required reason (stock-take, damage, loss). Can't take stock below zero. |

Other safeguards:

- **Append-only ledger.** Every change is a row in `movements`; on-hand stock is
  the sum of that ledger. Database triggers block edits and deletes, so mistakes
  are fixed with an adjustment and the history stays intact.
- **No double counting.** The same supplier + delivery note number is only
  booked once. A repeat (for example a supplier system retrying a webhook)
  returns the original record with `"duplicate": true`.
- **All-or-nothing.** Each record is written in a single transaction. If one
  line fails (say, not enough stock), nothing from that record is saved.

## Running it

Needs Node.js 22.5 or newer (uses the built-in `node:sqlite`). No npm packages
to install.

```bash
npm run seed   # optional: load demo items, installers, projects and movements
npm start      # http://localhost:3000
npm test
```

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `INVENTORY_DB` | `data/inventory.db` | SQLite file |
| `INVENTORY_API_KEY` | unset | If set, every non-GET `/api` request needs an `x-api-key` header |

## Using the app

- **Receive delivery / Issue / Return:** scan a barcode or type a SKU and press
  Enter. Handheld barcode scanners that act as a keyboard work as-is. Confirm, and
  you get a printable slip. Issue slips include an installer signature line.
- **Recorded by** (top right) is remembered on each device and is stamped on
  every record.
- **Dashboard:** today's deliveries, issues and returns, items at or below
  their reorder level, and the latest records.
- **Installers:** click a name to see exactly what they hold (issued, returned,
  still holding).
- **Movement log:** filter by type, item, installer, project and date, and
  export to CSV.

## API

All bodies are JSON. Lines can point to an item by `item_id`, `sku` or `barcode`.

```bash
# Supplier / purchasing system posts a delivery (safe to retry)
curl -X POST localhost:3000/api/deliveries -H 'content-type: application/json' -d '{
  "supplier": "Timber & Board Supplies", "external_ref": "DN-10021", "project": "BH-001",
  "recorded_by": "Gate scanner",
  "lines": [{ "sku": "PLY-18", "qty": 40 }, { "sku": "SIL-CLR", "name": "Silicone clear", "unit": "tube", "qty": 24 }]
}'

# Issue to an installer
curl -X POST localhost:3000/api/issues -H 'content-type: application/json' -d '{
  "installer": "Sam Carter", "project": "BH-001", "lines": [{ "sku": "PLY-18", "qty": 12 }]
}'
```

| Method & path | Purpose |
|---|---|
| `POST /api/deliveries` | Record a delivery (`supplier`/`supplier_id`, `external_ref`, `project`/`project_id`, `lines`) |
| `POST /api/issues` | Issue to an installer (`installer`/`installer_id`, `project`/`project_id`, `lines`) |
| `POST /api/returns` | Return from an installer |
| `POST /api/adjustments` | Signed `qty` per line; `notes` required |
| `GET /api/documents[?type=ISSUE]`, `GET /api/documents/:ref` | Records and their lines |
| `GET /api/movements`, `GET /api/movements.csv` | Ledger; filters `type`, `item_id`, `installer_id`, `project_id`, `from`, `to` |
| `GET /api/items`, `POST /api/items`, `PUT /api/items/:id`, `GET /api/items/lookup?code=` | Catalogue with `on_hand` and `with_installers` |
| `GET/POST /api/installers`, `GET /api/installers/:id/custody`, `POST /api/installers/:id/active` | Installers and what they hold |
| `GET/POST /api/suppliers`, `GET/POST /api/projects`, `POST /api/projects/:id/active` | Reference data |
| `GET /api/dashboard` | Totals, low stock, recent records |

## Layout

```
src/db.js         SQLite schema (append-only movements ledger)
src/inventory.js  Business rules: deliveries, issues, returns, adjustments, reports
src/server.js     HTTP API and static file server
public/           Web UI (plain HTML/CSS/JS)
scripts/seed.js   Demo data
test/             node:test suite
```
