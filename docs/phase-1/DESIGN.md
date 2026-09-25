# Phase 1 App: Design

**Stage:** Proven. Follows `docs/PROTOCOL.md`. Scope comes from `docs/PROMPT.md` §11, Phase 1.

## Problem
The rules for stock and categories are proven as pure modules. The site needs a working app on top of them. Storekeepers need to create items (helped by Smart Category), print QR labels, receive deliveries, and issue material. Managers need to see stock. And every rule must survive a real database with several phones posting at once.

## Scope
| In Phase 1 | Deferred |
|---|---|
| Sign-in, roles, company and store scoping | Material requests and approvals (Phase 2) |
| Stores and locations (MAIN, plus system TRANSIT and QUARANTINE) | Returns, transfers, adjustments, tool checkout (Phase 2) |
| Items with Smart Category, units and conversions | Stock counts, reports, Excel export (Phase 3) |
| QR codes and label printing (A4 grid and 50×25 mm) | Offline PWA sync (Phase 3) |
| GRN (receive) and Issue with scan input | Photos and signatures |
| Reversal of posted documents | |
| Dashboard: stock value, low stock, today's activity | |

## Stack
The spec's defaults are followed, with one deliberate change:
- Next.js (App Router), TypeScript, Tailwind CSS
- PostgreSQL 16
- `qrcode` to generate labels and `@zxing/browser` to scan them
- Playwright for end-to-end tests
- **Raw SQL through `pg` instead of Prisma.** Three reasons:
  - The ledger's correctness depends on explicit `SELECT … FOR UPDATE` in a set order, which should be visible in the code.
  - `NUMERIC` values come back as exact strings, which feed straight into BigInt arithmetic.
  - There is no engine binary to download.
- Server code in `lib/` is plain TypeScript that Node runs directly, so the tests import it without a build step.

## Interface
- `lib/ledger-db.ts`:
  - `postDocument(db, ctx, doc)` → `{ id, docNo, duplicate }`, where `doc.type` is `GRN` or `ISSUE`
  - `reverseDocument(db, ctx, { key, documentId })`
- `lib/auth.ts`: `login`, `getSession`, `requireRole`
- HTTP: route handlers under `app/api/*`. Each takes JSON, needs a session, and returns `{ error: CODE }` with a 4xx status on refusal.

## Rules
### Database ledger
- **DB-1** Ledger rows are append-only. A trigger rejects `UPDATE` and `DELETE` on `stock_entries`.
- **DB-2** A document posts in one transaction: every line, or nothing.
- **DB-3** Stock never goes negative, even under concurrency:
  - balance rows are locked with `FOR UPDATE` in a fixed order (store, location, item), so there are no deadlocks;
  - `CHECK (qty >= 0)` is a backstop.
- **DB-4** Idempotency. `UNIQUE (company_id, idem_key)` plus a SHA-256 fingerprint of the **canonical** JSON request, meaning keys sorted, so field order doesn't matter.
  - Same key and same content returns the original document.
  - Same key and different content gives `KEY_REUSED`.
  - Two identical requests at the same moment create one document.
- **DB-5** Exact numbers. Quantities and money are `NUMERIC(18,4)` and conversion factors `NUMERIC(18,6)`. The application does its arithmetic in BigInt, rounding half away from zero. Floating point is never used. Input with more than 4 decimal places is rejected.
- **DB-6** The database ledger matches the reference model. A randomised differential test applies the same operations to both. It checks that each operation gives the same outcome (posted, duplicate, or the same error code) and that the final quantities and values are identical.
- **DB-7** A document is reversed at most once, enforced by `UNIQUE (reverses_id)`, so this also holds under concurrency. A reversal can't be reversed. A reversed receipt leaves at the current average and records `price_variance`.
- **DB-8** Balances always equal the sum of ledger entries (checked in SQL).

### Security
- **SEC-1** Every page and API needs a session.
  - Passwords are hashed with scrypt.
  - Session tokens are random, and only their SHA-256 hash is stored.
  - The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, and expires after 12 hours.
- **SEC-2** Companies are isolated. Every query is filtered by the session's company. An ID from another company gets `NOT_FOUND`, never data.
- **SEC-3** Roles are enforced on the server:

  | Role | Can do |
  |---|---|
  | `storekeeper` | Receive, issue, create items, locations and suppliers |
  | `pm` | Reverse documents |
  | `admin` | Everything |
  | `engineer` | View only |

- **SEC-4** Non-admins can post only to stores they are assigned to (`user_stores`).
- **SEC-5** A request that changes data must be JSON and come from the same origin (checked with the `Origin` header). This blocks cross-site form posts.

### App
- **APP-1** Smart Category runs in the browser as the item name is typed. If the user picks a different category from the suggestion, it is saved as a company override and applied to that name from then on.
- **APP-2** Every item and location gets an opaque QR code: 12 characters from `crypto.randomBytes`. The URL `/q/<code>` resolves only within the viewer's company.
- **APP-3** Labels encode the full URL at error-correction level M with a 4-module quiet zone, and decode back to exactly the same URL (round-trip test).
- **APP-4** The scan field accepts a QR URL, a bare QR code, or an item code (from a keyboard-wedge scanner or typing), and resolves each to the same item.
- **APP-5** Seed data:
  - 1 company, 2 projects with one store each;
  - 5 suppliers;
  - all 65 golden-set names as items, each classified by Smart Category (every seeded item's category comes from the classifier);
  - one user per role.
- **APP-6** End to end in a real browser: sign in → create an item with a Smart Category suggestion → receive → issue → the dashboard and item page show the right stock.

## Measured, not assumed
- **Label damage.** A square smudge over 6% of the symbol always decodes, and the test checks this. Measured over 40 labels each: 8% decodes 37/40, 10% decodes 21/40, 12% decodes 1/40. Scattered damage is worse: level M corrects about 15% of *codewords*, and scattered flipped modules land in many codewords.
- **Lock ordering.** With the sort removed and 150 fresh item pairs racing, Postgres recorded real deadlocks in 5 of 6 runs. With the sort in place: 0 of 6, and 0 of 8 in an earlier series. The test checks Postgres's own deadlock counter, because `tx()` retries deadlocks and would otherwise hide one.
- **Differential.** Five seeds of 1,500 operations each (about 7,500 in total). Every outcome and every balance matched the reference model.

## Not in scope
Everything in the Deferred column. Camera scanning on real phones is a manual check: headless Chromium has no camera and no `BarcodeDetector`.
