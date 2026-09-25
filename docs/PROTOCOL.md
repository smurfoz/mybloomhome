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

## When a gate fails
Fix the cause, not the gate. Never weaken a test, delete a mutation or rename a rule to get to green. If a rule was wrong, change it in DESIGN.md first, then in the tests, then in the code, in that order.

## What the gates have caught so far
| Gate | Finding | Fix |
|---|---|---|
| Prove: mutations | Removing rounding from the ledger (LED-5) went unnoticed. The tests used 0.1 and 2.5, which scale to exact integers. | Added a 0.07 m³ test (0.07 × 10000 = 700.0000000000001) |
| Prove: rules | Rule IDs in the smart-category design doc were in the wrong format, so no rules were recognised | Rewrote them as `**SC-n**` |
| Build (golden set) | "Wire nails" tied between electrical and hardware | Added the phrase `wire nails` |
| Design review | Longest-match only applied within one category, so "grinder disc" would still score as a tool | Changed SC-2 to a single longest-match pass across all categories |
