# CONTEXT.md glossary for the compiler
Type: grilling
Status: resolved
Blocked by:

## Question

Write `packages/compiler/CONTEXT.md`: canonical terms and the ones they replace. Candidates
needing a ruling: ModulePlan vs LinkedPlan vs "the plan"; payload vs program vs chunk vs
segment vs QRL; hole vs content vs text effect; row vs collection; projection vs slot;
carrier; live alias vs snapshot; complete vs incomplete link; artifact vs output; native
target vs "target-native" (retire the latter). No implementation detail in the glossary.

## Answer

Resolved 2026-09-17. Glossary written to `packages/compiler/CONTEXT.md` (the asset). Varixo's rulings on the two
open terms: **hole** alone is the payload sense (what the `js-hole` diagnostic names); the JSX sense is always
**text hole**; `analyse/lower-hole.ts` is renamed `lower-text.ts` in the responsibility-map moves. **Lane**
replaces "head" for the multi-head render unit (one word for the scheduler lane and the unit it runs).
