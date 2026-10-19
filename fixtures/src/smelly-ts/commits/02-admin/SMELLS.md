# SMELLS.md: the answer key

This repository is a test fixture for Codebase Quest. Every code smell in it is
deliberate, and each one is listed here: at least one instance of every monster
in the Bestiary (MASTER-PLAN §8). Analyzer tests (Phase 02) check that each row
is detected with the right kind and location, and that nothing else of those
kinds is reported.

Lines are 1-based and inclusive. Paths are relative to the repository root.

| # | Monster | Smell kind | File | Symbol | Lines | Evidence |
|---|---|---|---|---|---|---|
| 1 | Gremlin | todo-comment | `src/cart/cartTotal.ts` | `cartTotal` | 5–5 | `FIXME` comment |
| 2 | Spaghetti Serpent | complex-function | `src/pricing/discount.ts` | `discountRate` | 20–57 | cyclomatic complexity 15 (threshold 10) |
| 3 | Mimic | duplicate-code | `src/format/money.ts` + `src/format/price.ts` | `formatMoney` + `formatPrice` | 9–16 + 9–16 | same 6 statements; they differ only at line 12 (`Math.floor` vs `Math.round`) |
| 4 | Mutant | injected-mutation | `src/cart/coupon.ts` | `applyCoupon` | 4–7 | not a static smell: the designated target for Mutant Hunt (mutations are injected at play time, Phase 07) |
| 5 | Ghost | dead-code | `src/orders/orders.ts` | `legacyOrderCode` | 8–10 | no callers, not exported, not an entry point |
| 6 | Wisp | possibly-dead-code | `src/plugins/hooks.ts` | `onLegacyCheckout` | 21–23 | no callers and not exported, but its name appears as a string (line 9) and the file makes dynamic calls (`hook(order)`) |
| 7 | Labyrinth Minotaur | deep-nesting | `src/shipping/label.ts` | `shippingLabel` | 8–24 | nesting depth 5 at line 14 (threshold 4) |
| 8 | Imp | magic-number | `src/orders/tax.ts` | `addTax` | 3–3 | unnamed literals `1.0825` and `30` |
| 9 | Wraith | swallowed-error | `src/storage/save.ts` | `saveOrder` | 8–8 | empty `catch` block |
| 10 | Shapeshifter | missing-types | `src/api/parse.ts` | `parseOrder` | 4–4 | parameter `raw: any` |
| 11 | Echo | long-parameter-list | `src/orders/createOrder.ts` | `createOrder` | 7–30 | 8 parameters (threshold 5) |
| 12 | Shadow | untested-code | `src/reports/monthly.ts` | `monthlyRevenue` | 4–12 | no test imports or calls it |
| 13 | Golem | huge-file | `src/i18n/messages.ts` | (file) | 1–875 | 875 lines (threshold 800) |
| 14 | Titan | god-class | `src/core/ShopManager.ts` | `ShopManager` | 2–100 | 22 methods (threshold 20) over 5 unrelated fields (users, stock, outbox, ledger, audit log) |
| 15 | Ouroboros | circular-dependency | `src/inventory/stock.ts` → `src/inventory/warehouse.ts` → `src/inventory/restock.ts` → `src/inventory/stock.ts` | (module cycle) | import lines 1 | a 3-module import cycle |

## Assumptions this key makes

The detection rules are finalized in Phase 02. This key assumes:

- **Test files** (`tests/`) are excluded from Imp, Ghost, Wisp, Shadow and Echo.
- **0 and 1** (and `-1` as an index) are not magic numbers. Literals assigned to
  a named `const` are not magic.
- **Dead code is not also untested code:** Ghost and Wisp symbols are not
  reported as Shadow.
- A class counts as tested if a test imports it; its methods don't need
  separate test references.
- Kind names in the "Smell kind" column are proposals; Phase 02 may rename them
  (update this file in the same change).

If Phase 02 calibrates a rule differently, update this table and
`fixtures/fixtures.lock.json` together, and say why in the pull request.
