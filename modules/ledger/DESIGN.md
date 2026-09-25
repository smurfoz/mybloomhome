# Ledger: Design

**Stage:** Proven. Follows `docs/PROTOCOL.md`.

## Problem
Every movement of stock (receiving, issuing, returns, transfers, adjustments, counts) must be recorded so that the on-hand quantity and its value are always correct and can be audited.

## Interface
`new Ledger({ allowNegative })` sets up a ledger.

| Call | Purpose |
|---|---|
| `defineItem(code, { baseUom, conversions, kind })` | Register an item and its units |
| `post({ key, type, store, lines })` | Post a document: `GRN`, `ISSUE`, `RETURN_TO_STORE`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUST` |
| `reverse(key, docId)` | Cancel a posted document with opposite entries |
| `startCount` / `postCount` | Run a stock count and post its variance |
| `onHand`, `value`, `avgCost`, `qtyAsOf`, `replay` | Queries |

## Rules
- **LED-1** The ledger is append-only. Posted rows are immutable, and corrections are reversals.
- **LED-2** A document posts completely or not at all.
- **LED-3** Stock cannot go negative unless `allowNegative` is set. Transit is exempt.
- **LED-4** The same idempotency key never posts twice.
- **LED-5** Quantities are converted to the base unit and stored as scaled integers with 4 decimal places, so they never drift. Units not configured for the item are rejected.
- **LED-6** Stock is valued at weighted-average cost per item, store and location.
- **LED-7** A GRN adds only received − rejected.
- **LED-8** A transfer moves stock and value through `TRANSIT`, and total value is conserved.
- **LED-9** A return must reference its issue, cannot exceed the issued quantity, is valued at issue cost, and goes to `QUARANTINE` if damaged.
- **LED-10** Count variance is measured against the quantity at the time of counting.
- **LED-11** Running balances equal a full replay of the ledger.

## Not in scope
Persistence and concurrency. The Postgres implementation must lock balance rows; see `docs/PROMPT.md` §3.
