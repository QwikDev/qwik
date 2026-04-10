# Quick Task 260410-jbb: Convert remaining raw regex to magic-regexp

**Date:** 2026-04-10
**Commit:** b9a85ec

## Changes

### src/testing/snapshot-parser.ts
- Added `magic-regexp` import (createRegExp, exactly, oneOrMore, char, whitespace, linefeed, multiline, global)
- Line 166: `/^={3,}\s*.+?\s*==$/m` → `createRegExp(exactly('=').times.atLeast(3)...at.lineStart().at.lineEnd(), [m])`
- Line 183: `SECTION_DELIM_RE` → `createRegExp` with named groups (`eq`, `name`, `end`)
- Line 266: `/^Some\("(.*)"\)$/m` → `createRegExp` with named group (`val`)
- Line 274: `/\\"/g` → `createRegExp(exactly('\\"'), [g])`
- Line 275: `/\\\\/g` → `createRegExp(exactly('\\\\'), [g])`
- Line 293: `/^\n+/` and `/\n+$/` → `createRegExp(oneOrMore(linefeed).at.lineStart/End())`

### tests/hashing/siphash.test.ts
- Added `magic-regexp` import
- Line 25: `/^[A-Za-z0-9]+$/` → `createRegExp(oneOrMore(anyOf(letter, digit)).at.lineStart().at.lineEnd())`
- Line 27: `/[-_]/` → `createRegExp(charIn('-_'))`

## Result

All 92 tests pass. Zero raw regex literals remain in source or test files.
