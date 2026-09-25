# Protocol: Design → Isolate → Build → Prove

Every feature moves through four stages, in order. **Each stage has a gate that a script checks, not a person's judgment.** A feature isn't done until `npm run prove` passes for it.

```
Design ──► Isolate ──► Build ──► Prove
  │          │           │         ├─ every rule has a named test
  │          │           │         └─ every planted bug is caught
  │          │           └─ tests pass
  │          └─ pure module, sibling imports only
  └─ DESIGN.md with numbered rules
```

## 1. Design
Write `modules/<name>/DESIGN.md` **before any code**. It must contain:

| Section | Contents |
|---|---|
| `## Problem` | Who is affected, and what goes wrong today |
| `## Interface` | Function signatures, inputs and outputs |
| `## Rules` | Numbered, testable statements written as `**ABC-n**` |
| `## Not in scope` | What this module deliberately leaves to other modules |

A rule has to be something a test can confirm or refute. For example "Accepted = received − rejected" is a rule; "handles deliveries well" is not.

**Gate:** all four sections exist and there is at least one `**ABC-n**` rule.

## 2. Isolate
Each feature lives in its own folder, `modules/<name>/`, and holds pure logic only:
- Source files import **only their siblings** (`./x.mjs`). No npm packages, no `node:` built-ins, and no `../` into other modules.
- No input/output (database, network, storage) and nothing non-deterministic (`Date.now`, `Math.random`). The caller passes in time, IDs and persisted data such as overrides.
- The same module then runs unchanged in the browser (offline), on the server and in tests.
- Modules are connected only by app-level glue. Their contracts are checked in `tests/` (see `tests/integration.test.mjs`).

**Gate:** the import and I/O scan finds no leaks.

## 3. Build
- Write the smallest code that satisfies the rules. Put a comment on each rule's implementation citing its ID (`// SC-3`).
- Test data comes from reality, such as invoice-style names in `fixtures/golden.json`, not invented happy paths.
- Every known trap (an ambiguous word, a rounding edge case, a retry) gets a fixture or a test.

**Gate:** `node --test modules/<name>/*.test.mjs` passes.

## 4. Prove
Passing tests are not enough on their own: they might not test anything. The prove stage shows that they do.
1. **Rule coverage.** Every rule ID in DESIGN.md appears in at least one test title, and no test cites a rule that doesn't exist.
2. **Mutation check.** `mutations.json` lists at least 5 deliberate bugs, each tied to a rule. For each one, the checker copies the module, plants the bug and runs the tests. **The tests must fail.** A bug the tests miss ("survived") means the proof has a hole. A mutation whose target text no longer exists ("stale") also fails, so the list can't silently rot.
3. **Contracts.** `tests/integration.test.mjs` shows that one module's output is valid input for the next.

**Gate:** `npm run prove` reports `✔ all gates passed`.

## Commands
```bash
npm test                         # all unit and contract tests
npm run prove                    # all four gates for every module
node scripts/prove.mjs ledger    # one module
```

## Rules for proofs
- A new test must be shown to **fail on the bug it guards against** before its fix is accepted.
- Every module keeps at least one **randomised invariant test** with a fixed seed, so any failure can be reproduced.
- Mutations must leave the module **loadable**. A syntax-breaking mutation is reported as `invalid`, not `caught`.

## When a gate fails
Fix the cause, not the gate. Never weaken a test, delete a mutation or rename a rule to get to green. If a rule was wrong, change it in DESIGN.md first, then in the tests, then in the code, in that order.

## What the gates have caught so far
| Gate | Finding | Fix |
|---|---|---|
| Prove: mutations | Removing rounding from the ledger (LED-5) went unnoticed. The tests used 0.1 and 2.5, which scale to exact integers. | Added a 0.07 m³ test (0.07 × 10000 = 700.0000000000001) |
| Prove: rules | Rule IDs in the smart-category design doc were in the wrong format, so no rules were recognised | Rewrote them as `**SC-n**` |
| Build (golden set) | "Wire nails" tied between electrical and hardware | Added the phrase `wire nails` |
| Design review | Longest-match only applied within one category, so "grinder disc" would still score as a tool | Changed SC-2 to a single longest-match pass across all categories |

### Review 2: reproduce first, then fix
Each finding was first reproduced by a probe script, then fixed, then locked in with a regression test and a mutation.

| # | Found by | Defect (before the fix) | Rule |
|---|---|---|---|
| 1 | probe | Two returns of 15 against an issue of 20 were both accepted, so stock was created from nothing | LED-9 |
| 2 | probe | A return was accepted after its issue had been reversed (+20 phantom stock) | LED-9 |
| 3 | probe | The same document could be reversed twice | LED-1 |
| 4 | probe | Re-using a key for **different** content silently returned the old result, losing the new document | LED-4 |
| 5 | probe | A GRN with no unit cost made the stock value `NaN` | LED-12 |
| 6 | probe | A negative "rejected" quantity added stock that was never delivered | LED-12 |
| 7 | probe | A transfer with no destination sent stock to a store named "undefined" | LED-12 |
| 8 | probe | Users could post straight into `TRANSIT` or `QUARANTINE` | LED-12 |
| 9 | probe | A count whose adjustment failed was closed anyway, and a retry threw an error | LED-10 |
| 10 | **randomised test** | Reversing a cheap receipt after mixing costs pushed the average to 149.5 when only 1 and 100 had been paid | LED-6 |
| 11 | **randomised test** | `normalize` was not idempotent (`'mm5lin .2 sq'`) | SC-1 |
| 12 | probe | "53 Grade OPC" lost its grade; "Fe-500 D" lost its D | SC-5 |
| 13 | code reading | Every line of a document shared one `seq` by accident; now there is an explicit per-document sequence | LED-10 |
| 14 | attack on prover | A mutation that stopped the module loading counted as "caught" | tooling |
| 15 | attack on prover | A side-effect `import 'pkg'` got past the isolation check | tooling |
| 16 | meta-check | The first version of the randomised test **passed on the buggy ledger**. It relied on the ledger's own bookkeeping, so it was rewritten to keep its own independent records. It now fails on the old code and passes on the new. | LED-11 |

### Phase 1 build: what the proofs caught
| Found by | Defect | Fix |
|---|---|---|
| Differential test (step 2) | The database rejected float input like `12.340000000000001`, which the model accepted | Numbers within float noise of 4 decimals are accepted, the same tolerance on both sides; text input stays strict |
| Differential test | Unknown unit plus zero quantity: the model reported `BAD_UOM`, the database `BAD_QTY` | Same check order on both sides |
| Mutation gate (model) | `roundHalfAway` could be removed with no effect: dead code once over-precise input is rejected | Removed |
| Mutation gate (app) | Learning from a correction to a *wrong* suggestion was never asserted | Test added |
| Rule-coverage gate (app) | SEC-5 (same-origin JSON) had only a manual curl check | Browser test added |
| Concurrency mutation | Removing lock sorting passed the first test, because existing rows are locked in index order anyway | The test now races brand-new rows and reads Postgres's deadlock counter |
| QR damage test | My first "damage" wiped a finder pattern, and my second claimed a 5% scattered tolerance. Both were wrong | Measured the real limits; the test asserts a 6% smudge |
| Browser test | The receive form's "reason for rejection" label wasn't linked to its input (accessibility) | Every line label linked to its input |
| Browser test | The scanner ignored a repeat code for 1.5 s from the keyboard too, not only the camera | Repeats are only ignored for camera reads |
| Browser test | The seed gave the PM no store, so SEC-4 correctly blocked their reversals | Seed assigns the PM to both stores |
| Screenshot review | The dashboard's "below reorder level" showed the 12 listed items (12) instead of the true 43 | Separate count query and a regression test |
| **CI** (and one unexplained local failure) | `pool.end()` resolves before its sockets close; a connection killed in that gap raised an `error` nobody handled, which **would crash the app server** on a Postgres restart or failover. Reproduced on demand: 74 uncaught errors in 60 cycles without handlers, 0 with | Error handlers on every pool and client (DB-9), test cleanup waits for connections to close, and a DB-9 test proven to fail without the fix |

Lessons now built into the protocol:
- **Test the test.** Run every new proof against the known-buggy version, and require it to fail.
- **Invariants over examples.** Rows 10 and 11 were found only by randomised checks. Hand-written examples had passed.
- **Attack the gatekeeper.** The prover is code too, and it needs its own adversarial cases.
