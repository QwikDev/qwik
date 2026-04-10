---
type: quick
plan: 260410-ith
tags: [tooling, pnpm, regex, magic-regexp]
key-files:
  modified:
    - package.json
    - pnpm-lock.yaml
    - src/hashing/siphash.ts
decisions:
  - "Kept snapshot-parser.ts and siphash.test.ts regexes as raw literals: magic-regexp charIn cannot handle A-Za-z0-9 ranges (escapes hyphens, breaking range semantics) and complex multiline patterns are less readable with magic-regexp"
metrics:
  duration: 2min
  completed: "2026-04-10T18:39:21Z"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 260410-ith: Switch from npm to pnpm + magic-regexp Summary

Switched package manager to pnpm 10.25.0 and converted siphash.ts base64 encoding regexes to magic-regexp; kept complex/range-dependent regexes as raw literals where magic-regexp would degrade readability or break behavior.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Switch from npm to pnpm | 802e3cc | Done |
| 2 | Replace raw regex with magic-regexp | c5655fd | Done |

## Changes Made

### Task 1: Switch from npm to pnpm
- Deleted `package-lock.json` and `node_modules/`
- Ran `pnpm install` to generate `pnpm-lock.yaml`
- Added `"packageManager": "pnpm@10.25.0"` to package.json
- All 66 tests pass

### Task 2: Replace raw regex with magic-regexp
- Added `magic-regexp@0.11.0` as production dependency
- Converted 4 regex patterns in `src/hashing/siphash.ts` to magic-regexp:
  - `/\+/g` -> `createRegExp(exactly('+'), [g])`
  - `/\//g` -> `createRegExp(exactly('/'), [g])`
  - `/=+$/` -> `createRegExp(oneOrMore('=').at.lineEnd())`
  - `/[-_]/g` -> `createRegExp(charIn('-_'), [g])`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] magic-regexp charIn cannot handle character ranges**
- **Found during:** Task 2
- **Issue:** `charIn('A-Za-z0-9')` escapes hyphens as `[A\-Za\-z0\-9]`, breaking range semantics (e.g., 'B' and '5' don't match). This would have broken the hash format validation test.
- **Fix:** Kept `siphash.test.ts` regexes as raw literals since magic-regexp cannot express `[A-Za-z0-9]` correctly.
- **Files affected:** tests/hashing/siphash.test.ts (no changes made - intentionally kept raw)

**2. [Rule 2 - Readability] Complex regex patterns kept as raw literals**
- **Found during:** Task 2
- **Issue:** snapshot-parser.ts regexes are complex multiline patterns with captures. Converting to magic-regexp would make them harder to read, not easier.
- **Fix:** Per plan guidance ("prefer keeping it raw where magic-regexp doesn't genuinely improve readability"), kept all snapshot-parser.ts regexes as raw literals.
- **Files affected:** src/testing/snapshot-parser.ts (no changes made - intentionally kept raw)

## Verification

- All 66 tests pass (6 test files)
- No `package-lock.json` exists
- `pnpm-lock.yaml` exists
- `magic-regexp` appears in package.json dependencies
- siphash.ts has no raw regex literals (all converted)
- snapshot-parser.ts and siphash.test.ts retain raw literals where appropriate

## Self-Check: PASSED
