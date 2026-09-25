# Ledger: Design

**Stage:** Proven (revised after review, see `docs/PROTOCOL.md`). Follows `docs/PROTOCOL.md`.

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
- **LED-1** The ledger is append-only. Posted rows are immutable, and corrections are reversals. A document is reversed **at most once**. A reversal cannot itself be reversed. An issue can't be reversed while returns against it are still standing.
- **LED-2** A document posts completely or not at all.
- **LED-3** Stock cannot go negative unless `allowNegative` is set. Transit is exempt.
- **LED-4** The same idempotency key never posts twice. A retry with the same content returns the original result. The same key with **different** content is rejected (`KEY_REUSED`), so a document is never silently lost.
- **LED-5** Quantities are converted to the base unit and stored as scaled integers with 4 decimal places, so they never drift. Units not configured for the item are rejected.
- **LED-6** Stock is valued at weighted-average cost per item, store and location. Stock **coming in** enters at its recorded cost. Stock **going out**, including a reversed receipt, leaves at the current average, and any gap is recorded as `priceVariance`. This keeps the average within the range of costs actually paid.
- **LED-7** A GRN adds only received − rejected.
- **LED-8** A transfer moves stock and value through `TRANSIT`, and total value is conserved.
- **LED-9** A return must reference an issue from the **same store**. The **total** returned against an issue can never exceed what it issued, and a reversed issue accepts no returns. Returns go back to the bin they came from, valued at issue cost, or to `QUARANTINE` if damaged.
- **LED-10** Count variance is measured against the quantity at the time of counting, and that time must fall between the start of the count and now. A count only closes once its adjustment has posted. Retrying with the same key is safe.
- **LED-11** Running balances equal a full replay of the ledger. A randomised test of 3,000 mixed operations checks every invariant.
- **LED-12** Bad input is rejected before anything is written:
  - missing or negative unit cost;
  - rejected quantity below 0 or above received;
  - zero or non-numeric quantities;
  - no lines, no store, or an unknown type;
  - a transfer with no destination, or to its own store;
  - a unit conversion of 0 or less;
  - users posting into `TRANSIT` or `QUARANTINE`. Quarantined stock leaves only by an `ADJUST` write-off.

## Not in scope
Persistence and concurrency. The Postgres implementation must lock balance rows; see `docs/PROMPT.md` §3.
