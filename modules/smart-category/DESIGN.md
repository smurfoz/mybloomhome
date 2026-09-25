# Smart Category: Design

**Stage:** Proven. Follows `docs/PROTOCOL.md`.

## Problem
Storekeepers type item names the way they're written on supplier invoices, for example "OPC 53 grade cement 50kg", "12mm TMT Fe500D" or "2.5 sq mm FR copper wire". Picking the category, unit and handling flags by hand is slow and inconsistent. When an item gets the wrong category, units, reorder rules, approvals, hazard storage and reports all go wrong with it.

## What it does
The storekeeper types an item name, and the module returns:
- a suggested **category**, with a **confidence** level and the **reasons** for it (the matched words);
- the category's **defaults**: base unit, other units, consumable or tool, and flags (returnable, hazardous, restricted, issue-to-person);
- **attributes** read from the name: size in mm or inches, steel grade, cement type and grade, concrete grade, cable cross-section in sq mm, pack weight in kg;
- **missing** attributes the category requires, such as a steel item with no grade;
- **alternatives**: the next-best categories, so the user can switch with one tap.

## Why rules and not AI
- It runs **offline in the browser**, on the same phone that scans QR codes.
- It is **deterministic and explainable.** The same name always gives the same answer, and the reasons are shown, so storekeepers trust it and auditors can check it.
- It **learns from corrections** without retraining. A saved correction is an exact-match override.
- An AI model can be added later as a **fallback** for names that come back `unknown`. This module only reports `unknown`; it never guesses.

## Interface (pure function, no input/output, no dependencies)
```js
classify(name, { overrides = {}, taxonomy = TAXONOMY } = {}) → {
  input, normalized,
  category: 'STL' | … | null,
  status: 'auto' | 'confirm' | 'unknown',
  confidence: 0..1,
  reasons: ['tmt', 'fe500d', 'pattern:fe-grade'],
  attributes: { sizeMm: 12, steelGrade: 'Fe500D' },
  defaults: { baseUom, altUoms, kind, returnable, hazardous, restricted, issueToPerson },
  missing: ['steelGrade'],
  alternatives: [{ category, score }]
}
normalize(name) → string        // the key used for overrides
```

## Rules
- **SC-1** **Normalization** is idempotent (`normalize(normalize(x)) === normalize(x)`). It ignores case, punctuation and spacing, and writes units one way (`sq.mm` → `sq mm`, `mm.` → `mm`, `12MM` → `12 mm`).
- **SC-2** **Specific wins.** Matching is a single longest-match pass across *all* categories. Once a longer phrase claims some words, no other category can count them. For example "binding wire" is steel and electrical gets nothing for "wire"; "solvent cement" is plumbing and cement gets nothing. Weights are 1 for a word, 2.5 for a two-word phrase and 4 for three words. A short `strong` list of unambiguous trade terms (TMT, ISMB, MCB, CPVC…) weighs 2.5. Regex patterns such as `Fe500` or `M25` add 2.
- **SC-3** **Confidence gate.**
  - `auto` when the top score is at least 2 and at least 2× the runner-up.
  - `confirm` when there is some signal but the result is ambiguous.
  - `unknown` (category `null`) when nothing matches.
  - The UI pre-fills `auto` and `confirm` suggestions, but nothing is saved until the user accepts it. Bulk import only accepts `auto` without review.
- **SC-4** **Overrides win.** A correction saved for a normalized name returns that category with confidence 1, status `auto` and reason `override`, before any scoring.
- **SC-5** **Attributes** are extracted whatever the category. A 12 mm pipe and a 12 mm bar both give `sizeMm: 12`. A cable's `2.5 sq mm` is **not** read as a 2.5 mm size.
- **SC-6** **Defaults** come only from the chosen category. Tools are `kind: 'asset'`. Paint, chemicals and fuel are `hazardous`. Fuel is `restricted`, so issuing it needs approval. PPE is `issueToPerson`. Formwork is `returnable`.
- **SC-7** **Missing attributes.** Each category lists the attributes it requires, and any not found are returned in `missing`. For example steel needs `sizeMm` and `steelGrade`.
- **SC-8** **Accuracy gate.** Every case in `fixtures/golden.json` must classify to its expected category. The set covers real invoice spellings and known traps. A wrong answer blocks the build.
- **SC-9** **Taxonomy integrity.** Every category has a unique code, a base unit, a valid kind, and at least one keyword. No phrase appears in two categories.

## Edge cases to prove
- Pipe could be steel (`ms pipe`), plumbing (`pvc pipe`) or electrical (`conduit pipe`).
- Wire could be steel (`binding wire`) or electrical (`copper wire`).
- Cutting disc is a consumable; angle grinder is a tool.
- `20mm aggregate` is aggregate, and `M25` is a concrete grade, not a size.
- Empty input and gibberish both return `unknown`.

## Not in scope
Persistence of overrides (the app stores them in a `CategoryOverride` table and passes them in), and an AI fallback.
