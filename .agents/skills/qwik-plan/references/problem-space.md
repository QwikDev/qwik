# Problem-space study

A **dimension** (D) is one choice the design must make; its **options** are the possible answers. A
**use case** (UC) is a real situation an option passes (1) or fails (0). Weight each UC: ×3
decisive, ×2 or ×1. An option that fails a decisive UC is out, whatever its total.

Lay the study out in this order.

## Summary

Open with: "✗ marks a decisive use case an option fails: the option is out, whatever its total."
Then one table per dimension, and bold the winner:

**D1 — <the choice>**

| UC                                     | Weight        | <Option> | <Option> |
| -------------------------------------- | ------------- | -------- | -------- |
| 1 — <what must hold, in product words> | ×3 (decisive) | 1        | 0 ✗      |
| 2 — <…>                                | ×2            | 0        | 1        |
| **Weighted**                           |               | **3**    | 2, ✗ UC1 |

## Dimensions

Per dimension, one bullet per option: its name, one sentence on how it behaves, and a one-line code
example. End with **Fixed outside this decision:** what the study takes as given.

## Use cases

Grouped by dimension, under `### D1 — <the choice> — <Option> vs <Option>`. Per UC:

#### UC1 — <title> — **DECISIVE** (or ×2, ×1)

<minimal code example, when one applies>

✅ **Desired (<options that pass>)** — what happens.

❌ **Violation (<options that fail>)** — what goes wrong, in product terms.

| <Option> | <Option> |
| -------- | -------- |
| 1        | 0        |

**Eliminated: <options>.** (decisive UCs only)

## Decision

One line per dimension: **D1 — <the choice>** — <option>.
