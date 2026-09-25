# Build Prompt: Construction Site Store Management (QR)

**Version 2**: reviewed and corrected. The stock rules in section 3 are checked by `proof/` (`npm test`).

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

## 3. Inventory rules (must hold; proven in `proof/`)
1. **Append-only ledger.** Every document writes rows to `stock_ledger` and no row is ever updated or deleted. Mistakes are fixed with **reversal** documents. On-hand stock is a cached balance, and replaying the ledger must always reproduce it.
2. **Atomic documents.** A multi-line document posts completely or not at all.
3. **No negative stock** by default (an admin setting can allow it per store). Postgres enforces this by locking the affected balance rows (`SELECT … FOR UPDATE`) and checking them in the same transaction as the insert, so two storekeepers can't both issue the last 10 bags.
4. **Idempotency.** Every document carries a client-generated UUID key with a unique constraint. Re-sending the same document returns the original result and never posts it twice. This is required for offline retries.
5. **Exact numbers.** Quantities are stored as `NUMERIC(18,4)` in the item's base unit, and money as `NUMERIC(18,4)`. Floating-point types are never used for quantities or money.
6. **Valuation: weighted-average cost** per item per store. Receipts add their accepted quantity × unit cost. Outbound movements go out at the current average. Returns come back at the cost they were issued at. Transfers carry their value through `TRANSIT`.

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
`Company, Project, Store, Location, User, Role, UserSiteAccess, Supplier, Item, ItemCategory, Uom, ItemUomConversion, Batch, Asset (tool), QrCode, PurchaseOrder, PurchaseOrderLine, Grn, GrnLine, MaterialRequest, MaterialRequestLine, Approval, Issue, IssueLine, Return, ReturnLine, Transfer, TransferLine, Adjustment, StockCount, StockCountLine, StockLedger, StockBalance, CostCode, AssetCheckout, Attachment, SyncConflict, AuditLog`

## 10. Acceptance criteria
Each rule in section 3 needs an automated test on the real database, mirroring `proof/ledger.test.mjs`:
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
- [ ] **Concurrency:** two simultaneous issues of 60 against 100 on hand → exactly one succeeds *(DB-level test)*
- [ ] Scanning works on Android Chrome and iOS Safari (over HTTPS)
- [ ] An offline issue syncs after reconnecting, and a conflicting one appears in *Sync conflicts*
- [ ] Playwright end-to-end tests cover receive, issue, return and transfer
- [ ] Seed data: 1 company, 2 sites, 50 items, 5 suppliers
- [ ] README covers setup, environment variables and deployment

## 11. Phases
1. Item master with units and conversions, stores and locations, QR generation and printing, GRN, Issue, ledger and balances, basic dashboard.
2. Requests and approvals, returns, transfers through transit, tool checkout, cost codes.
3. Stock counts, reports and exports, offline sync with the conflict queue, alerts.

## Open decisions (defaults assumed above)
- Web PWA (assumed) or native app?
- Integrations with an ERP or accounting system (Tally, QuickBooks, SAP)?
- Currency, languages, and whether to add GST/VAT to GRN valuation.

---

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
