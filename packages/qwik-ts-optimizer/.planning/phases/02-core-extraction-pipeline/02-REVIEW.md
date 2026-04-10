---
phase: 02-core-extraction-pipeline
reviewed: 2026-04-10T12:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/optimizer/types.ts
  - src/optimizer/rewrite-imports.ts
  - src/optimizer/context-stack.ts
  - src/optimizer/marker-detection.ts
  - src/optimizer/extract.ts
  - src/optimizer/segment-codegen.ts
  - src/optimizer/rewrite-calls.ts
  - src/optimizer/rewrite-parent.ts
  - src/optimizer/transform.ts
  - tests/optimizer/rewrite-imports.test.ts
  - tests/optimizer/context-stack.test.ts
  - tests/optimizer/marker-detection.test.ts
  - tests/optimizer/extract.test.ts
  - tests/optimizer/rewrite-calls.test.ts
  - tests/optimizer/rewrite-parent.test.ts
  - tests/optimizer/transform.test.ts
  - tests/optimizer/snapshot-batch.test.ts
  - tests/optimizer/types.test.ts
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-10T12:00:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

The core extraction pipeline implements a well-structured transformation flow: parse -> extract marker calls -> rewrite parent module -> generate segment modules. The architecture cleanly separates concerns across files (marker detection, context stack, extraction, codegen, rewriting). Types are well-defined and match the NAPI interface contract.

Key concerns: (1) the `minifyFunctionText` function uses naive regex-based minification that will corrupt string literals containing comments or operators, (2) dead code in rewrite-parent.ts, (3) double-parsing in transform.ts, and (4) fragile nesting detection that may misassign parent references for deeply nested extractions.

## Critical Issues

### CR-01: minifyFunctionText corrupts string literals

**File:** `src/optimizer/rewrite-calls.ts:65-84`
**Issue:** The `minifyFunctionText` function uses sequential regex replacements that do not account for string literals. The comment-removal regex `\/\/[^\n]*` will strip content inside strings like `"http://example.com"`. The whitespace-collapsing and operator-spacing regexes will mangle string contents, e.g. `"hello   world"` becomes `"hello world"`, and `"a = b"` becomes `"a=b"`. Since this minified text is passed as the second argument to `_qrlSync()` and may be used at runtime for serialization or comparison, corrupted output could cause runtime failures.
**Fix:**
Replace the naive regex approach with a minifier that tracks whether it is inside a string literal (single-quote, double-quote, or template literal). A simple state machine that skips characters between matching quote delimiters would prevent corruption:
```typescript
function minifyFunctionText(text: string): string {
  let result = '';
  let i = 0;
  let prevNonWs = '';
  while (i < text.length) {
    const ch = text[i];
    // Pass through string literals unchanged
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      result += ch;
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') {
          result += text[i++]; // escape char
          if (i < text.length) result += text[i++];
        } else {
          result += text[i++];
        }
      }
      if (i < text.length) result += text[i++]; // closing quote
      continue;
    }
    // Skip block comments
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Skip line comments
    if (ch === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    // Collapse whitespace
    if (/\s/.test(ch)) {
      i++;
      while (i < text.length && /\s/.test(text[i])) i++;
      // Only emit space if needed to separate identifiers/keywords
      if (result.length > 0 && /[a-zA-Z0-9_$]/.test(result[result.length - 1]) &&
          i < text.length && /[a-zA-Z0-9_$]/.test(text[i])) {
        result += ' ';
      }
      continue;
    }
    result += ch;
    i++;
  }
  return result.trim();
}
```

## Warnings

### WR-01: Dead code - unused preambleParts array

**File:** `src/optimizer/rewrite-parent.ts:284-288`
**Issue:** The `preambleParts` array is allocated and conditionally populated but never used. The actual preamble assembly uses a separate `preamble` array starting at line 293. This dead code suggests an incomplete refactor and may confuse future maintainers.
**Fix:**
Remove lines 284-288:
```typescript
// Remove this block:
const preambleParts: string[] = [];
if (importStatements.length > 0) {
  preambleParts.push(importStatements.join('\n'));
}
```

### WR-02: Fragile nesting detection may misassign parents

**File:** `src/optimizer/rewrite-parent.ts:184-196`
**Issue:** The nesting detection loop iterates all extractions for each extraction to find containment. It uses `break` after the first match, but since the outer loop iterates `j` from 0 to N, and the array is sorted by `callStart` ascending, for a triply-nested case (A contains B contains C), when checking C, the loop may find A before B depending on their `argStart` positions. The correct parent for C should be B (the innermost containing extraction), not A.
**Fix:**
After finding all potential parents for each extraction, select the one with the smallest containing range (closest ancestor):
```typescript
for (let i = 0; i < sorted.length; i++) {
  let closestParent: ExtractionResult | null = null;
  let closestRange = Infinity;
  for (let j = 0; j < sorted.length; j++) {
    if (i === j) continue;
    if (
      sorted[i].callStart >= sorted[j].argStart &&
      sorted[i].callEnd <= sorted[j].argEnd
    ) {
      const range = sorted[j].argEnd - sorted[j].argStart;
      if (range < closestRange) {
        closestRange = range;
        closestParent = sorted[j];
      }
    }
  }
  if (closestParent) {
    sorted[i].parent = closestParent.symbolName;
  }
}
```

### WR-03: Double parsing in transformModule wastes cycles and risks inconsistency

**File:** `src/optimizer/transform.ts:95-99`
**Issue:** `extractSegments()` internally calls `parseSync()` to get the AST. Then `transformModule()` calls `parseSync()` again on the same source to get the import map via `collectImports()`. This double-parse is wasteful, and if the parser version or options ever diverge, the two ASTs could be inconsistent.
**Fix:**
Refactor `extractSegments` to accept an already-parsed program and import map, or return them alongside results so `transformModule` can reuse them:
```typescript
// Option A: extractSegments returns the import map
export function extractSegments(source: string, relPath: string, scope?: string)
  : { results: ExtractionResult[]; imports: Map<string, ImportInfo> } { ... }

// Option B: Accept pre-parsed program
export function extractSegments(program: any, source: string, relPath: string, scope?: string)
  : ExtractionResult[] { ... }
```

### WR-04: segment-codegen uses localName for import dedup, ignoring aliased imports

**File:** `src/optimizer/segment-codegen.ts:38-43`
**Issue:** When grouping imports by source, the code checks `if (!existing.includes(imp.localName))` to deduplicate. However, for aliased imports like `import { foo as bar } from './mod'`, the generated import statement will emit `import { bar } from "./mod"` instead of `import { foo as bar } from "./mod"`. The segment code then references `bar` but imports `bar` as a named export, which would fail if the module exports `foo` not `bar`.
**Fix:**
Track both `importedName` and `localName` and emit the alias form when they differ:
```typescript
interface ImportEntry { importedName: string; localName: string; }
const importsBySource = new Map<string, ImportEntry[]>();
// ... populate ...
// When emitting:
const specifiers = entries.map(e =>
  e.importedName !== e.localName
    ? `${e.importedName} as ${e.localName}`
    : e.localName
).join(', ');
parts.push(`import { ${specifiers} } from "${source}";`);
```

### WR-05: Duplicate step numbering in rewrite-parent.ts

**File:** `src/optimizer/rewrite-parent.ts:209,232`
**Issue:** There are two sections labeled "Step 4" -- the call site rewriting (line 209) and the import building (line 232). This indicates a copy-paste error in comments and makes the code harder to follow.
**Fix:**
Renumber: call site rewriting should be Step 4, import building Step 5, QRL declarations Step 6, and assembly Step 7.

## Info

### IN-01: Unused preambleParts variable (related to WR-01)

**File:** `src/optimizer/rewrite-parent.ts:284`
**Issue:** `preambleParts` is declared and populated but never read. This is dead code left from a refactor.
**Fix:** Remove it (see WR-01).

### IN-02: Extension determination does not preserve .tsx for TypeScript-only segments

**File:** `src/optimizer/extract.ts:76-88`
**Issue:** When a `.tsx` source file has a segment with no JSX in its body, `determineExtension` returns `.js` (falling through the `.ts` check since `sourceExt` is `.tsx`, not `.ts`). A segment from a `.tsx` file that has no JSX but uses TypeScript syntax would get a `.js` extension. This may be intentional to match the Rust optimizer's behavior, but could cause issues if the segment body contains TypeScript-only syntax (type annotations would have been stripped by then, so likely fine).
**Fix:** If this causes issues, add a `.tsx` check:
```typescript
if (hasJsx) return '.tsx';
if (sourceExt === '.ts' || sourceExt === '.tsx') return '.ts';
return '.js';
```

### IN-03: marker-detection collectImports uses `any` typed parameters

**File:** `src/optimizer/marker-detection.ts:56`
**Issue:** `collectImports(program: any)` accepts an untyped parameter. While the ESTree AST types from oxc-parser may not have convenient TS types, using `any` bypasses type checking for all downstream property accesses. Same pattern appears in `collectCustomInlined`, `getCalleeName`, `isMarkerCall`, and `isBare$`.
**Fix:** Consider defining a minimal ESTree Program interface or using the types from `oxc-parser` if available, even if partial. This would catch typos in property names at compile time.

---

_Reviewed: 2026-04-10T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
