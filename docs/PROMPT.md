# Build Prompt: Construction Site Store Management (QR)

**Phase 1 is built**: see the [README](../README.md) and [`phase-1/DESIGN.md`](phase-1/DESIGN.md). All protocol gates pass for the app against PostgreSQL.

**Version 3.1**: adds Smart Category and the build protocol, and fixes 16 defects found in review (see the review log). Every module is built under [`PROTOCOL.md`](PROTOCOL.md): Design → Isolate → Build → Prove, checked by `npm run prove`.

| Module | Rules | Proof |
|---|---|---|
| Stock ledger | LED-1…12 (section 3) | `modules/ledger/` |
| Smart category | SC-1…9 (section 2.A1) | `modules/smart-category/` |

---

**Build a web app for managing a construction site store. It tracks materials that come in from suppliers, materials issued to work crews, stock returned or moved between sites, and the stock left on hand. It uses QR codes so storekeepers can record every movement quickly and accurately from a phone.**

## 1. Users and roles
| Role | Can do |
|---|---|
| Store Keeper | Receive deliveries, issue and return materials, transfers, stock counts. Works on a phone, often with a poor connection. |
| Site Engineer / Foreman | Raise material requests; confirm what they receive. |
| Project Manager | Approve requests over the limit, adjustments and count variances; view reports. |
| Admin | Manage companies, projects, stores, users, suppliers, the item catalog and settings. |

- The system serves many companies. Every row carries a `company_id`, and every query is filtered by company and by the sites the user is assigned to.
- **Hierarchy:** Company → Project → Store → Location (bin, rack, yard, container). Every store also has two system locations, `TRANSIT` and `QUARANTINE`, which users cannot pick.

## 2. Modules

### A. Item master and QR labels
- **Item fields:** code, name, category, specification, **base unit of measure**, **unit conversions** (for example steel: 1 t = 1000 kg; cable: 1 roll = 90 m), minimum and reorder level, photo, and whether the item is **consumable** or a **tool/asset**.
- **Consumables** are counted in the base unit. The QR goes on the bin, pallet or batch, not on each bag.
- **Tools and assets** are tracked one by one, by serial number, with a QR on each unit.
- **QR content:** a URL of the form `https://<app>/q/<opaque-id>`. The ID is a random 10–12 character value, never a sequential number. Using a URL means the phone's own camera app also opens the right page. The QR holds only the ID; the item details live on the server.
- **QR types:** item/bin, tool, location, person (a badge used to identify the receiver), and document (printed on the GRN or issue slip so the paper links back to the record).
- **Label printing:** A4 grid PDF, and 50×25 mm labels for thermal printers. Use **error-correction level M** or higher so labels still scan when dusty or scratched, and keep a 4-module quiet zone around each code.

### A1. Smart Category
When someone types or imports an item name, the app suggests a category and pre-fills the item form. The full design is in `modules/smart-category/DESIGN.md`.
- **14 construction categories:** Cement & Binders, Ready-mix Concrete, Aggregates & Sand, Steel & Reinforcement, Masonry, Formwork & Timber, Electrical, Plumbing & Sanitary, Finishes & Tiles, Paints & Chemicals, Hardware/Fasteners/Abrasives, Safety & PPE, Tools & Equipment, Fuel & Lubricants.
- **The category sets defaults** for the item:
  - base unit and other units;
  - consumable or tool (a tool gets a serial number and a QR per unit);
  - **returnable** (formwork, tools), which enables returns tracking;
  - **hazardous** (paint, chemicals, fuel), which requires a hazardous storage location;
  - **restricted** (fuel), where every issue needs approval;
  - **issue to person** (PPE), where the receiver's badge must be scanned.
- **Attributes are read from the name:** size in mm or inches, steel grade (`Fe500D`), cement type and grade (`OPC 53`), concrete grade (`M25`), cable cross-section (`2.5 sq mm`), pack weight (`50kg`). The pack weight becomes a unit conversion, for example 1 t = 20 bags.
- **Missing required attributes are flagged**, for example a steel item with no grade. This keeps the catalog clean.
- **Explainable.** Each suggestion shows its reasons, the matched words ("tmt", "Fe500D"), and up to 3 alternative categories to switch to with one tap.
- **Confidence levels:**
  - `auto`: pre-filled.
  - `confirm`: pre-filled and highlighted.
  - `unknown`: the user picks.
  - Nothing is saved without the user accepting it. Bulk Excel import only accepts `auto` rows; the rest go to a review screen.
- **Learns from corrections.** When a user changes a suggestion, the correction is saved as an override (`CategoryOverride`: company, normalized name, category). It applies to that name from then on, across the company. It works offline and needs no retraining.
- **Rules-based, not AI:** deterministic, runs offline on the phone, and every answer is auditable. An AI fallback for `unknown` names is optional and can be added later behind the same interface.

### B. Delivery (Goods Received Note, GRN)
- **Header:** supplier, PO number (optional), delivery note or invoice number, vehicle, driver, date and time, receiving store.
- **Lines:** scan or search the item, pick the unit (any unit configured for that item), enter **received** and **rejected** quantities, and give a reason for any rejection. **Accepted = received − rejected**, and only the accepted quantity enters stock.
- **Evidence:** photos of the delivery note and the materials, and the storekeeper's signature.
- **PO match:** when a PO is linked, flag short and excess deliveries (the tolerance % is configurable).
- **Rejected quantities** feed a *Return to Supplier* document; they never enter stock.

### C. Material Issue
1. **Request.** The foreman lists items and quantities and assigns them to a **cost code** (project → work area → activity, for example "Block B / L3 / Slab casting").
2. **Approval.** Required when the request value exceeds a configurable limit, or when an item is flagged as restricted.
3. **Issue.** The storekeeper scans the item QR and enters the quantity, then identifies the receiver by scanning their badge QR or taking a signature. Partial issues are allowed; the unissued balance stays open on the request.
4. **Output.** An Issue Slip PDF with a document QR.

### D. Returns, transfers and adjustments
- **Return to store.** Must reference the original issue, and cannot return more than was issued. The return is valued at the cost it was issued at. Items returned as *damaged* go to `QUARANTINE`, not usable stock.
- **Return to supplier.** Linked to the rejected lines of a GRN.
- **Inter-site transfer.** *Dispatch* moves stock (and its value) into the destination's `TRANSIT` location. *Receive* moves it out of `TRANSIT` into usable stock. Any shortfall stays visible in `TRANSIT` until someone resolves it.
- **Adjustment.** For damage, theft, wastage or corrections. A reason is required, and adjustments over the limit need PM approval.

### E. Tool checkout
- Scan the tool QR, then the person QR, and set the expected return date. Checking a tool out does **not** reduce stock; the tool is an asset whose custody changes.
- Show overdue tools, each person's current holdings, and each tool's custody history.

### F. Stock count
- Counts can cover a single location or the whole store. The storekeeper scans the location, then each item, and enters the physical quantity.
- **Variance** = counted − system quantity **at the moment the shelf was counted**, not at the moment the count is approved. This way, issues posted between counting and approval are not mistaken for losses.
- Approved variances post as count-adjustment entries.

## 3. Inventory rules (must hold; proven in `modules/ledger/`, LED-1…12)
1. **Append-only ledger.** Every document writes rows to `stock_ledger` and no row is ever updated or deleted. Mistakes are fixed with **reversal** documents. On-hand stock is a cached balance, and replaying the ledger must always reproduce it.
2. **Atomic documents.** A multi-line document posts completely or not at all.
3. **No negative stock** by default (an admin setting can allow it per store). Postgres enforces this by locking the affected balance rows (`SELECT … FOR UPDATE`) and checking them in the same transaction as the insert, so two storekeepers can't both issue the last 10 bags.
4. **Idempotency.** Every document carries a client-generated UUID key with a unique constraint. Re-sending the same document returns the original result and never posts it twice. This is required for offline retries. Store a hash of the payload with the key: the **same key with different content is rejected** (`KEY_REUSED`), never silently ignored.
5. **Exact numbers.** Quantities are stored as `NUMERIC(18,4)` in the item's base unit, and money as `NUMERIC(18,4)`. Floating-point types are never used for quantities or money.
6. **Valuation: weighted-average cost** per item per store. Receipts add their accepted quantity × unit cost. Outbound movements go out at the current average. Returns come back at the cost they were issued at. Transfers carry their value through `TRANSIT`. **A reversed receipt also leaves at the current average.** The gap from its original cost is posted as a `priceVariance` to a price-difference account. Without this, the remaining stock's average can end up above anything actually paid.
7. **Reversals.** A document is reversed once at most. A reversal is never itself reversed; post the document again instead. An issue with standing returns can't be reversed until those returns are reversed.
8. **Returns.** The **total** returned against an issue is capped at what it issued, across all return documents. A reversed issue accepts no returns. Returns go back to the store and bin they came from.
9. **Input validation** happens before anything is written:
   - unit cost is required and ≥ 0;
   - 0 ≤ rejected ≤ received;
   - quantities are > 0;
   - a transfer needs a destination other than its own store;
   - users cannot post into system locations. Quarantine stock leaves only by a write-off adjustment.

## 3a. Build protocol
Every module is built under [`PROTOCOL.md`](PROTOCOL.md):
1. **Design**: `DESIGN.md` with numbered, testable rules.
2. **Isolate**: a pure module with no input/output and sibling imports only, so it runs in the browser offline and on the server.
3. **Build**: code, plus real-world fixtures and traps.
4. **Prove**: a test for every rule, and a mutation check where planted bugs must be caught.

Modules connect only through app glue, and a contract test covers each connection. `npm run prove` must pass on every change; CI runs it.

## 4. Scanning
- Use the browser's native `BarcodeDetector` where it exists (Chrome on Android). Otherwise fall back to **`@zxing/browser`**, which is actively maintained. Avoid `html5-qrcode`: its last release was 2.3.8 in April 2023.
- The camera needs **HTTPS**, including on staging servers.
- USB and Bluetooth scanners type like a keyboard; accept their input in any scan field.
- Scanning is context-aware: an item QR opens stock on hand, recent movements, and Receive/Issue buttons.
- For multi-line documents, scanning is continuous, with a beep or vibration on each read and a warning on duplicate scans. If a code won't scan, the user can search by item code instead.

## 5. Offline (PWA)
- The app is installable and caches the item catalog and the user's open requests.
- Documents created offline are stored in IndexedDB with their idempotency key and marked **Pending sync**.
- Sync runs on the `online` event, when the app is opened and when the user pulls to refresh. **Safari does not support the Background Sync API**, so the app must not depend on it.
- The server decides. An offline document that the server rejects (for example because it would make stock negative) is **not** dropped silently: it goes to a *Sync conflicts* queue for the storekeeper or PM to resolve.

## 6. Reports and dashboard
- **Dashboard:** stock value, low stock, today's receipts and issues, pending approvals, sync conflicts, overdue tools.
- **Reports:** stock on hand (as of any date, rebuilt from the ledger), movement ledger, consumption by cost code, supplier deliveries and rejection rate, count variances, wastage, value in transit.
- Export to Excel and PDF.

## 7. Security and audit
- Role-based access enforced on the **server**, not just hidden in the UI.
- Audit log recording user, device, time, action and before/after values.
- Posted documents are read-only.
- Photos and signatures are stored in private S3-compatible storage and served through signed URLs.

## 8. Tech stack (defaults)
- Next.js (App Router) with TypeScript, Tailwind, PWA
- PostgreSQL with Prisma, using `Decimal` for quantities and money
- Auth.js (next-auth) or Clerk for sign-in
- `qrcode` to generate codes and `@zxing/browser` to scan them
- `pdf-lib` for labels and slips
- S3-compatible storage for files
- Hosting on Vercel with Neon or Supabase Postgres

## 9. Data model (minimum)
`Company, Project, Store, Location, User, Role, UserSiteAccess, Supplier, Item, ItemCategory (code, defaults, required attributes), CategoryOverride, ItemAttribute, Uom, ItemUomConversion, Batch, Asset (tool), QrCode, PurchaseOrder, PurchaseOrderLine, Grn, GrnLine, MaterialRequest, MaterialRequestLine, Approval, Issue, IssueLine, Return, ReturnLine, Transfer, TransferLine, Adjustment, StockCount, StockCountLine, StockLedger, StockBalance, CostCode, AssetCheckout, Attachment, SyncConflict, AuditLog`

## 10. Acceptance criteria
Each rule in section 3 needs an automated test on the real database, mirroring `modules/ledger/ledger.test.mjs`:
- [ ] Receive 100 bags → issue 30 → return 5 → **75 on hand**, and stock value = 75 × unit cost
- [ ] A GRN with 100 received and 4 rejected adds **96**
- [ ] Issuing more than is on hand is rejected, and none of the document's lines post
- [ ] Posting the same idempotency key twice moves stock **once**
- [ ] 2.5 t of steel received and 125.5 kg issued leaves **2374.5 kg**, and issuing in a unit the item doesn't have is rejected
- [ ] Thirty issues of 0.1 m³ from 3 m³ leave exactly **0**
- [ ] Weighted average: 100 @ 400 + 50 @ 430 → **410**
- [ ] A damaged return goes to quarantine, and a return larger than the original issue is rejected
- [ ] Dispatch 40, receive 38 → **2** stay in transit, and total value is unchanged
- [ ] A reversal restores stock and leaves the original rows untouched
- [ ] A count of 97 against 100, with an issue of 10 posted before approval, gives a variance of **−3** and **87** on hand
- [ ] Cached balances equal a full replay of the ledger
- [ ] Randomised test of 3,000 mixed operations across 30 seeds: replay matches, stock is never negative, the average stays within the range of costs paid, returns never exceed issues, and nothing is reversed twice
- [ ] Two returns of 15 against an issue of 20: the second is rejected. A return against a reversed issue is rejected.
- [ ] Reusing an idempotency key with different content → `KEY_REUSED`
- [ ] Receive 10 @ 1 and 10 @ 100, issue 5, reverse the first receipt → average stays **50.5**, with a price variance of 495
- [ ] **Concurrency:** two simultaneous issues of 60 against 100 on hand → exactly one succeeds *(DB-level test)*
- [ ] Values that aren't exact in binary floating point still balance: three issues of 0.07 m³ from 1 m³ leave exactly **0.79**
- [ ] **Smart Category:** all 65 golden names classify correctly, including 15 traps (binding wire, MS pipe, solvent cement, grinder disc…)
- [ ] Smart Category: `pipe` alone → `confirm`; gibberish → `unknown`; a saved correction overrides the next suggestion
- [ ] Smart Category: `2.5 sq mm` cable gives a cross-section, not a 2.5 mm size; `OPC 53 50kg` gives 1 t = 20 bags
- [ ] Classified items are accepted by the ledger in their default and alternative units (contract test)
- [ ] `npm run prove` passes: every rule is tested and every planted bug is caught
- [ ] Scanning works on Android Chrome and iOS Safari (over HTTPS)
- [ ] An offline issue syncs after reconnecting, and a conflicting one appears in *Sync conflicts*
- [ ] Playwright end-to-end tests cover receive, issue, return and transfer
- [ ] Seed data: 1 company, 2 sites, 50 items, 5 suppliers
- [ ] README covers setup, environment variables and deployment

## 11. Phases
1. Item master with **Smart Category**, units and conversions, stores and locations, QR generation and printing, GRN, Issue, ledger and balances, basic dashboard.
2. Requests and approvals, returns, transfers through transit, tool checkout, cost codes.
3. Stock counts, reports and exports, offline sync with the conflict queue, alerts.

## Known limits (stated upfront)
- **Smart Category reads Latin-script names only.** A name like "सीमेंट" returns `unknown`, and the user picks the category, which is then saved as an override. Keyword lists for other languages are needed if invoices come in other scripts.
- **Concurrency is not proven yet.** The reference model runs on a single thread. The row-locking rule (§3.3) needs its planned database-level test once Postgres exists.
- **The fingerprint depends on key order.** It is JSON of the document, so a client must resend the identical payload. In production, hash a canonical form.
- The ledger and classifier are **reference models**. The production app still has to be built against them (Phase 1).

## Open decisions (defaults assumed above)
- Web PWA (assumed) or native app?
- Integrations with an ERP or accounting system (Tally, QuickBooks, SAP)?
- Currency, languages, and whether to add GST/VAT to GRN valuation.

---

## Review log: v3 → v3.1
Review 2 reproduced every suspected defect before fixing it. It found 12 bugs in the code and 4 in the tooling and tests. The full table is in [`PROTOCOL.md`](PROTOCOL.md#review-2-reproduce-first-then-fix). The most serious:
- Returns could exceed issues, or follow a reversal, which **created stock from nothing**.
- Double reversals.
- A reused key **silently lost a document**.
- A GRN with no unit cost made the stock value `NaN`.
- Reversing a receipt **pushed the average cost to 149.5 when only 1 and 100 had been paid**.

Proof strength after the fixes:
- Ledger: 19/19 mutations caught, 12/12 rules tested.
- Smart category: 14/14 mutations caught, 9/9 rules tested.
- The randomised ledger test fails on the old code and passes on the new.

## Review log: v2 → v3
| # | Change | How it's checked |
|---|---|---|
| 16 | Added Smart Category: 14 categories, defaults, attributes, confidence gate, corrections | SC-1…9, 65 golden names, 11 mutations |
| 17 | Added the Design → Isolate → Build → Prove protocol with automated gates | `npm run prove` |
| 18 | Found a hole in v2's proof: removing ledger rounding wasn't caught, because 0.1 and 2.5 scale exactly | New 0.07 m³ test; the mutation is now caught |
| 19 | Moved `proof/` into `modules/ledger/` and gave its rules IDs LED-1…11 | rule-coverage gate |
| 20 | Contract test connecting Smart Category's output to Ledger input (pack weight becomes a unit conversion) | `tests/integration.test.mjs` |

## Review log: v1 → v2
| # | Problem in v1 | Fix in v2 | How it's checked |
|---|---|---|---|
| 1 | Unclear whether rejected quantity enters stock | Accepted = received − rejected | test "GRN adds accepted quantity" |
| 2 | Recommended `html5-qrcode`, which has had no release since April 2023 | `BarcodeDetector` with `@zxing/browser` as fallback | `npm view html5-qrcode` → 2.3.8, 2023-04-15 |
| 3 | Offline retries could post a document twice | Client UUID idempotency key with a unique constraint | test "offline retry" |
| 4 | No unit conversion (buy in tonnes, issue in kg) | Base unit plus a per-item conversion table | test "unit conversion" |
| 5 | Number types not specified, so floats could drift | `NUMERIC(18,4)`, never floating point | test "0.1 m3 x 30" |
| 6 | Valuation method left open ("weighted average / FIFO") | Weighted average, with return and transfer rules | tests "weighted-average", "transfer" |
| 7 | No rule to stop two concurrent issues overdrawing stock | Row lock with the check in the same transaction | acceptance item (needs a DB test) |
| 8 | Transfers had no in-transit state | `TRANSIT` location that carries value | test "inter-site transfer" |
| 9 | Damaged returns went back into usable stock | `QUARANTINE` location | test "damaged return" |
| 10 | Count variance was ambiguous if stock moved during the count | Compare against quantity at count time | test "stock count" |
| 11 | Relied on offline sync that Safari doesn't support | Sync when online, on app open and on refresh, plus a conflict queue | spec (browser behaviour) |
| 12 | QR content was vague | Opaque-ID URL, error-correction level M, quiet zone | spec |
| 13 | Tool checkout's effect on stock was undefined | Custody change only; stock does not move | spec |
| 14 | No separation between companies | `company_id` on every row, filtering by company and site | spec |
| 15 | Acceptance criteria covered only the success path | 12 rule tests plus concurrency and sync-conflict cases | `npm test` |
