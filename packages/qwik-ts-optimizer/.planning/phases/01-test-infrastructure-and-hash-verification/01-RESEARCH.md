# Phase 1: Test Infrastructure and Hash Verification - Research

**Researched:** 2026-04-10
**Domain:** Snapshot parsing, AST comparison, SipHash-1-3 hashing, symbol naming
**Confidence:** HIGH

## Summary

Phase 1 is a pure tooling and algorithm verification phase -- no optimizer codegen. It builds three foundational capabilities: (1) a snapshot parser that extracts structured data from 209 `.snap` files, (2) an AST comparison utility for semantic code equivalence, and (3) a SipHash-1-3 implementation verified to produce byte-identical hashes to every hash in the snapshot corpus. Additionally, display name and symbol name construction must be implemented and verified against all snapshot metadata.

The snapshot format is a Rust `insta`-style text format with YAML frontmatter, optional INPUT section, segment output blocks with metadata JSON, a transformed parent module block, source map lines, and a diagnostics section. The format is consistent across all 209 files with minor variations (one file lacks INPUT, some have non-empty diagnostics). The hash algorithm is well-documented: Rust's `DefaultHasher::new()` which is SipHash-1-3 with keys (0,0), confirmed via Rust stdlib source. The `siphash` npm package by jedisct1 (co-author of SipHash) provides a dedicated `siphash13.js` module.

**Primary recommendation:** Build snapshot parser first (it gates everything else), then hash + naming (verifiable against all 209 snapshots immediately), then AST comparison (needed for Phase 2+), then batch test runner.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Snapshot parser reads `.snap` files and extracts INPUT, segment outputs, metadata JSON, and diagnostics | Snapshot format fully reverse-engineered from 209 files -- see Architecture Patterns section |
| TEST-02 | AST comparison utility parses both expected and actual code with oxc-parser and compares structurally | oxc-parser ESTree output + fast-deep-equal for cleaned AST comparison -- see Architecture Patterns |
| TEST-03 | Segment metadata comparison matches all fields exactly | Metadata JSON structure documented from snapshots -- 13 fields with exact types |
| TEST-04 | Test runner supports batch mode -- run N snapshots at a time, lock passing batches | vitest + custom test generation pattern -- see Architecture Patterns |
| HASH-01 | SipHash-1-3 with keys (0,0) produces byte-identical hashes to SWC optimizer | siphash npm package v1.2.0, siphash13.js module, keys `[0,0,0,0]` -- verified from Rust source |
| HASH-02 | Hash input is raw concatenated bytes: scope + rel_path + display_name (no separators) | Confirmed from Qwik transform.rs -- `hasher.write()` calls are streaming and equivalent to concatenation |
| HASH-03 | Hash output is u64 little-endian, base64url-encoded (no padding), with `-` and `_` replaced by `0` | `base64()` function extracted from Qwik Rust source -- exact encoding documented |
| HASH-04 | Display name follows `{file}_{context}` pattern | `register_context_name()` fully extracted -- escape_sym + dedup logic documented |
| HASH-05 | Symbol name follows `{context}_{ctxName}_{hash}` pattern | Symbol name is `{display_name}_{hash64}` in dev/test mode -- confirmed from Rust source |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| siphash | 1.2.0 | SipHash-1-3 hashing via `lib/siphash13.js` | By SipHash co-author jedisct1; dedicated SipHash-1-3 variant matches Rust DefaultHasher [VERIFIED: npm registry] |
| oxc-parser | 0.124.0 | Parse expected/actual code to ESTree AST for comparison | Already decided in CLAUDE.md; native NAPI binding [VERIFIED: npm registry] |
| fast-deep-equal | 3.1.3 | Deep structural equality for cleaned AST nodes | Already decided in CLAUDE.md; zero-dep, fast [VERIFIED: npm registry] |
| vitest | 4.1.4 | Test runner, assertions, batch execution | Already decided in CLAUDE.md; ESM-native [VERIFIED: npm registry] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pathe | 2.0.3 | Path normalization (forward-slash) | When constructing rel_path for hash input [VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| siphash npm | Custom SipHash-1-3 impl | Unnecessary -- jedisct1's package is authoritative and battle-tested |
| fast-deep-equal | assert.deepStrictEqual | fast-deep-equal is 7x faster and allows custom cleaning before comparison |
| vitest batch mode | jest | vitest is faster, ESM-native, better watch mode |

**Installation:**
```bash
npm install siphash pathe
npm install -D vitest oxc-parser fast-deep-equal
```

**Version verification:** All versions confirmed via `npm view <pkg> version` on 2026-04-10. [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure
```
src/
  testing/
    snapshot-parser.ts       # TEST-01: Parse .snap files to structured data
    ast-compare.ts           # TEST-02: Semantic AST comparison
    metadata-compare.ts      # TEST-03: Exact metadata field comparison
    batch-runner.ts          # TEST-04: Batch test execution with locking
  hashing/
    siphash.ts               # HASH-01, HASH-02, HASH-03: SipHash-1-3 wrapper
    naming.ts                # HASH-04, HASH-05: Display name and symbol name construction
tests/
  hashing/
    siphash.test.ts          # Verify hashes against all 209 snapshots
    naming.test.ts           # Verify display names and symbol names against all snapshots
  testing/
    snapshot-parser.test.ts  # Parser correctness tests
    ast-compare.test.ts      # AST comparison correctness tests
```

### Pattern 1: Snapshot File Structure

**What:** Every `.snap` file follows this structure (reverse-engineered from all 209 files):

```
---                                          # YAML frontmatter
source: packages/optimizer/core/src/test.rs
assertion_line: NNN
expression: output
---
==INPUT==                                    # Optional (208/209 have it, 1 doesn't)

[source code]

===== filename.tsx (ENTRY POINT)==           # 0+ segment blocks
                                             #   Each has: code, source map line, metadata JSON
[segment code]

Some("...")                                  # Source map (always Some(...), never None)
/*
{ ... metadata JSON ... }
*/

===== filename ==                            # 0-1 transformed parent module blocks
                                             #   Has: code, source map line, NO metadata JSON
[transformed parent code]

Some("...")                                  # Source map

== DIAGNOSTICS ==                            # Always present, exactly once

[JSON array - may be empty [] or contain diagnostic objects]
```

**Key observations from corpus analysis:**
- 209 total snapshot files [VERIFIED: filesystem count]
- 208 have `==INPUT==`, 1 does not (`relative_paths.snap`) [VERIFIED: grep]
- Segment blocks contain `(ENTRY POINT)` in the header delimiter
- Parent module blocks do NOT contain `(ENTRY POINT)`
- Source map lines are always `Some("...")` format (Rust Option serialization), never `None` [VERIFIED: grep]
- Metadata JSON blocks appear ONLY after segment blocks (inside `/* ... */` comments)
- Diagnostics section is always last, always present [VERIFIED: grep]
- Diagnostics are a JSON array -- usually `[]`, sometimes contains error objects [VERIFIED: content inspection]
- Segment counts per file range from 0 to 25 [VERIFIED: grep count]

**Metadata JSON fields (from segment blocks):**
```typescript
interface SegmentMetadata {
  origin: string;           // e.g., "test.tsx"
  name: string;             // e.g., "Foo_component_HTDRsvUbLiE"
  entry: string | null;     // usually null
  displayName: string;      // e.g., "test.tsx_Foo_component"
  hash: string;             // e.g., "HTDRsvUbLiE" (11 chars, base64url-safe)
  canonicalFilename: string; // e.g., "test.tsx_Foo_component_HTDRsvUbLiE"
  path: string;             // e.g., "" or "components" or "../../node_modules/dep/dist"
  extension: string;        // "tsx", "js", "ts"
  parent: string | null;    // null or parent segment name
  ctxKind: string;          // "function" or "eventHandler"
  ctxName: string;          // "component$", "onClick$", "$", "q-e:click" etc.
  captures: boolean;        // whether segment captures outer scope vars
  loc: [number, number];    // [start, end] byte offsets in original source
  paramNames?: string[];    // optional, present in ~91 snapshots
  captureNames?: string[];  // optional, present in ~33 snapshots
}
```

**Diagnostic object fields:**
```typescript
interface Diagnostic {
  category: "error";        // always "error" in observed data
  code: string;             // "C02", "C03", "C05"
  file: string;             // e.g., "test.tsx"
  message: string;          // human-readable error message
  highlights: Array<{lo: number; hi: number; startLine: number; startCol: number; endLine: number; endCol: number}> | null;
  suggestions: null;        // always null in observed data
  scope: "optimizer";       // always "optimizer" in observed data
}
```

### Pattern 2: Hash Algorithm Implementation

**What:** SipHash-1-3 with zero keys, producing base64url-encoded output with character substitution.

**Exact algorithm (from Qwik Rust source):** [VERIFIED: GitHub raw source]

```typescript
// Step 1: Concatenate hash input (no separators)
// In Rust: hasher.write(scope), hasher.write(rel_path), hasher.write(display_name)
// Equivalent to: hash(scope + rel_path + display_name) as bytes
const input = (scope ?? '') + relPath + displayName;

// Step 2: Hash with SipHash-1-3, keys (0,0,0,0)
const SipHash13 = require('siphash/lib/siphash13');
const result = SipHash13.hash([0, 0, 0, 0], input);
// result = { h: number (high 32 bits), l: number (low 32 bits) }

// Step 3: Convert to u64 little-endian bytes
const buf = new Uint8Array(8);
// Little-endian: low bytes first
buf[0] = result.l & 0xff;
buf[1] = (result.l >>> 8) & 0xff;
buf[2] = (result.l >>> 16) & 0xff;
buf[3] = (result.l >>> 24) & 0xff;
buf[4] = result.h & 0xff;
buf[5] = (result.h >>> 8) & 0xff;
buf[6] = (result.h >>> 16) & 0xff;
buf[7] = (result.h >>> 24) & 0xff;

// Step 4: Base64url encode (no padding), replace - and _ with 0
const base64url = btoa(String.fromCharCode(...buf))
  .replace(/\+/g, '-')    // standard base64 -> base64url
  .replace(/\//g, '_')    // standard base64 -> base64url
  .replace(/=+$/, '')     // strip padding
  .replace(/[-_]/g, '0'); // Qwik-specific: replace - and _ with 0
```

**CRITICAL NOTE on base64url encoding:** Rust's `base64::engine::general_purpose::URL_SAFE_NO_PAD` uses `-` and `_` as the URL-safe characters (instead of `+` and `/`). The Qwik code then replaces both `-` and `_` with `0`. So the effective alphabet is `A-Za-z0-9` plus `0` replacing both special chars. In JS, we can use standard `btoa()` which produces `+` and `/`, convert to URL-safe (`-` and `_`), strip padding, then replace `-` and `_` with `0`. [VERIFIED: Qwik transform.rs source]

### Pattern 3: Display Name and Symbol Name Construction

**What:** Exact algorithm from Qwik Rust source. [VERIFIED: GitHub raw source]

```typescript
// escape_sym: replace non-alphanumeric with _, trim leading _, squash consecutive _
function escapeSym(str: string): string {
  let result = '';
  let lastWasUnderscore = true; // treat start as _ to trim leading
  for (const ch of str) {
    if (/[A-Za-z0-9]/.test(ch)) {
      if (!lastWasUnderscore && result.length > 0) {
        // normal char after normal char
      } else if (lastWasUnderscore && result.length > 0) {
        result += '_';
      }
      result += ch;
      lastWasUnderscore = false;
    } else {
      if (result.length > 0) {
        lastWasUnderscore = true;
      }
      // else: leading non-alnum, skip entirely
    }
  }
  return result;
}

// register_context_name algorithm:
// 1. Join stack_ctxt with "_"
// 2. If stack empty, use "s_"
// 3. escape_sym the result
// 4. Prepend "_" if starts with digit
// 5. Track duplicates, append "_N" for N>0
// 6. Hash: SipHash13(scope + rel_path + display_name)
// 7. symbol_name = "{display_name}_{hash64}" (dev/test mode)
// 8. display_name = "{file_name}_{display_name}" (prepend filename)
```

**stack_ctxt population:** The context stack accumulates identifiers as the AST is traversed:
- Variable declarations: variable name pushed
- Function declarations: function name pushed
- JSX element tags: tag name pushed
- JSX attribute names: attribute name pushed (for event handlers like `onClick$`)
- Export default: file stem or folder name pushed

**Example:** For `export const Foo = component$((props) => { ... })`:
- stack = ["Foo", "component$"] at extraction point
- joined = "Foo_component$"
- escaped = "Foo_component" ($ becomes _)
- display_name = "Foo_component"
- full display_name = "test.tsx_Foo_component"
- hash input = "" + "test.tsx" + "Foo_component" (scope is usually empty)

### Pattern 4: AST Comparison

**What:** Parse both expected and actual code strings with oxc-parser, strip position/range/loc data, compare structurally.

```typescript
import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';

function compareAst(expected: string, actual: string, lang: string): boolean {
  const expectedAst = parseSync(lang, expected);
  const actualAst = parseSync(lang, actual);
  
  // Strip position data recursively
  const cleanExpected = stripPositions(expectedAst.program);
  const cleanActual = stripPositions(actualAst.program);
  
  return equal(cleanExpected, cleanActual);
}

function stripPositions(node: any): any {
  if (Array.isArray(node)) return node.map(stripPositions);
  if (node === null || typeof node !== 'object') return node;
  
  const cleaned: any = {};
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue;
    cleaned[key] = stripPositions(value);
  }
  return cleaned;
}
```

### Anti-Patterns to Avoid

- **String comparison for code:** Never compare code output as strings. The SWC optimizer's whitespace is an artifact of its printer. AST comparison is the only correct approach.
- **Comparing source maps:** Source maps encode byte positions that differ between implementations. Skip entirely.
- **Custom SipHash implementation:** Use jedisct1's package. Custom implementations will have subtle byte-order bugs.
- **Processing all 209 snapshots at once for testing:** Use batch-of-10 locking strategy to prevent regression whack-a-mole.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SipHash-1-3 | Custom hash function | `siphash` npm package (lib/siphash13.js) | Crypto algorithms have subtle bugs; jedisct1 is SipHash co-author |
| AST parsing | Regex-based code parsing | `oxc-parser` parseSync | Regex cannot handle nested structures, comments, string literals |
| Deep object comparison | Custom recursive equality | `fast-deep-equal` | Edge cases with circular refs, symbols, typed arrays |
| Base64url encoding | Manual bit manipulation | `btoa()` + character replacement | Standard base64 is well-tested; only need simple char swaps |

**Key insight:** The hash must be byte-identical to Rust output. Any hand-rolled crypto will waste days debugging off-by-one byte-order bugs.

## Common Pitfalls

### Pitfall 1: siphash npm Package is CJS-Only
**What goes wrong:** Importing `siphash/lib/siphash13` in an ESM project fails or requires special handling.
**Why it happens:** The siphash package has no ESM exports, only CommonJS `module.exports`. [VERIFIED: package.json inspection]
**How to avoid:** Use `import SipHash13 from 'siphash/lib/siphash13.js'` with Node's CJS interop, or use `createRequire`. In an ESM TypeScript project with `"module": "NodeNext"`, Node's built-in CJS interop should handle default imports. Test this early.
**Warning signs:** `ERR_REQUIRE_ESM` or `SipHash13.hash is not a function` at runtime.

### Pitfall 2: Base64 Encoding Order -- btoa vs URL-safe vs Qwik Replacement
**What goes wrong:** Hash output doesn't match because the base64 variant or character replacement order is wrong.
**Why it happens:** Three layers: standard base64 (`+`, `/`, `=`), URL-safe base64 (`-`, `_`, no `=`), Qwik base64 (replace `-` and `_` with `0`). Applying replacements in wrong order produces different output.
**How to avoid:** The Rust code uses URL_SAFE_NO_PAD base64 directly, then replaces `-` and `_` with `0`. In JS: use standard btoa, convert `+` to `-` and `/` to `_`, strip `=` padding, then replace `-` and `_` with `0`. OR: shortcut -- since `-` and `_` both become `0`, you can also just do `btoa(...).replace(/[+/]/g, '0').replace(/=+$/, '')` which has the same result.
**Warning signs:** Hash strings contain `-` or `_` characters (should be `0` instead), or hashes are wrong length.

### Pitfall 3: SipHash h/l Byte Order for u64 Little-Endian
**What goes wrong:** The hash output is reversed because high/low 32-bit words are in wrong order when constructing the 8-byte u64.
**Why it happens:** The siphash13 `hash()` returns `{h, l}` where `h` is high 32 bits and `l` is low 32 bits. Rust's `u64::to_le_bytes()` puts the least significant byte first. So `l` bytes come first (indices 0-3), then `h` bytes (indices 4-7).
**How to avoid:** Write unit tests comparing against known Rust output IMMEDIATELY. Use the snapshot hashes as ground truth.
**Warning signs:** Hashes are consistent but wrong for every snapshot.

### Pitfall 4: Snapshot Parser Edge Cases
**What goes wrong:** Parser fails on snapshots with unusual structure.
**Why it happens:** One snapshot (`relative_paths.snap`) has no `==INPUT==` section. Some snapshots have 0 segment blocks. Some have multiple parent module sections (one per origin file).
**How to avoid:** Build parser to handle optional INPUT and 0+ segments. Test against all 209 files immediately.
**Warning signs:** Parser throws on specific files or returns wrong segment count.

### Pitfall 5: escape_sym Leading Underscore Trimming
**What goes wrong:** Display names have extra leading underscores, causing hash mismatch.
**Why it happens:** The Rust `escape_sym` function trims leading underscores (non-alnum chars at start are dropped entirely, not converted to `_`). A naive regex approach like `str.replace(/[^A-Za-z0-9]/g, '_')` will produce leading underscores for strings starting with special chars.
**How to avoid:** Implement the exact fold logic from the Rust source: skip leading non-alnum, squash consecutive `_`, trim trailing `_`.
**Warning signs:** Display names like `_component` instead of `component`.

### Pitfall 6: oxc-parser ESTree Output Includes Extra Fields
**What goes wrong:** AST comparison fails because oxc-parser includes fields not in the ESTree spec (like `typeAnnotation`, extra `optional` fields on non-optional nodes).
**Why it happens:** oxc-parser's ESTree output includes TypeScript-related and implementation-specific fields.
**How to avoid:** Strip not just position data but also implementation-specific fields. OR better: strip position data only and accept that both sides parse the same way (both use oxc-parser, so extra fields will be present in both).
**Warning signs:** AST comparison reports mismatches on nodes that look semantically identical.

## Code Examples

### Snapshot Parser (Core Logic)
```typescript
// Source: Reverse-engineered from 209 snapshot files [VERIFIED: filesystem]
interface ParsedSnapshot {
  frontmatter: { source: string; assertionLine: number; expression: string };
  input: string | null;  // null for snapshots without ==INPUT==
  segments: Array<{
    filename: string;
    isEntryPoint: boolean;
    code: string;
    sourceMap: string | null;
    metadata: SegmentMetadata | null;
  }>;
  parentModules: Array<{
    filename: string;
    code: string;
    sourceMap: string | null;
  }>;
  diagnostics: Diagnostic[];
}

// Parsing approach: split on delimiter pattern, classify each block
const SECTION_DELIM = /^={5,}\s*(.+?)\s*==$/m;
const ENTRY_POINT_MARKER = '(ENTRY POINT)';
const INPUT_MARKER = '==INPUT==';
const DIAG_MARKER = '== DIAGNOSTICS ==';
```

### Hash Function Wrapper
```typescript
// Source: Qwik transform.rs base64() + register_context_name() [VERIFIED: GitHub]
import SipHash13 from 'siphash/lib/siphash13.js';

const ZERO_KEY = [0, 0, 0, 0];

export function qwikHash(scope: string | undefined, relPath: string, displayName: string): string {
  // Concatenate raw bytes (no separators) -- matches Rust hasher.write() sequence
  const input = (scope ?? '') + relPath + displayName;
  
  // SipHash-1-3 with zero keys
  const result = SipHash13.hash(ZERO_KEY, input);
  
  // u64 little-endian bytes
  const bytes = new Uint8Array(8);
  bytes[0] = result.l & 0xff;
  bytes[1] = (result.l >>> 8) & 0xff;
  bytes[2] = (result.l >>> 16) & 0xff;
  bytes[3] = (result.l >>> 24) & 0xff;
  bytes[4] = result.h & 0xff;
  bytes[5] = (result.h >>> 8) & 0xff;
  bytes[6] = (result.h >>> 16) & 0xff;
  bytes[7] = (result.h >>> 24) & 0xff;
  
  // Base64url encode, no padding, replace - and _ with 0
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .replace(/[-_]/g, '0');
}
```

### escape_sym Implementation
```typescript
// Source: Qwik transform.rs escape_sym() [VERIFIED: GitHub]
export function escapeSym(str: string): string {
  let result = '';
  let pending_underscore = false;
  let has_content = false;
  
  for (const ch of str) {
    const isAlnum = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (isAlnum) {
      if (pending_underscore && has_content) {
        result += '_';
      }
      result += ch;
      has_content = true;
      pending_underscore = false;
    } else {
      if (has_content) {
        pending_underscore = true;
      }
    }
  }
  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rust DefaultHasher = SipHash-2-4 | Rust DefaultHasher = SipHash-1-3 | July 2016 (Rust PR #33940) | Must use SipHash-1-3, NOT 2-4 |
| `useLexicalScope()` for captures | `_captures` array for captures | Recent Qwik versions | 4/209 snapshots still use old style; most use `_captures` |
| SipHasher (deprecated) | DefaultHasher (opaque) | Rust 1.13+ | DefaultHasher wraps SipHasher13 internally |

**Deprecated/outdated:**
- `useLexicalScope()`: Being replaced by `_captures` in newer Qwik versions. Both appear in snapshots. For Phase 1 (metadata/hash verification), this distinction doesn't matter -- the metadata fields are the same regardless.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `scope` parameter is usually empty/undefined for standard Qwik test snapshots | Hash Algorithm | LOW -- if scope is non-empty, hashes won't match and we'll discover immediately during verification |
| A2 | The siphash npm package's string_to_u8 uses TextEncoder (UTF-8), matching Rust's `.as_bytes()` | Hash Algorithm | MEDIUM -- if encoding differs, all hashes will be wrong; testable immediately |
| A3 | oxc-parser's ESTree output for the same code string is deterministic across calls | AST Comparison | LOW -- oxc-parser is deterministic by design |

## Open Questions

1. **What is `scope` in `register_context_name`?**
   - What we know: It's `self.options.scope`, an optional string prepended to hash input
   - What's unclear: What value it takes in the test snapshots (likely empty/None based on context)
   - Recommendation: Extract hashes from all snapshots and verify with scope=undefined first. If any mismatch, investigate scope values.

2. **How does `stack_ctxt` accumulate for complex nested cases?**
   - What we know: Variable names, function names, JSX tags, and attribute names are pushed
   - What's unclear: Exact push/pop order for deeply nested `$()` calls, especially with JSX
   - Recommendation: For Phase 1, verify display names and hashes against snapshot metadata. Detailed stack_ctxt logic is needed for Phase 2+ when we actually traverse the AST.

3. **Does the siphash13.js `string_to_u8` handle all Unicode correctly vs Rust's `.as_bytes()`?**
   - What we know: Both use UTF-8 encoding. The siphash13.js uses `TextEncoder` when available.
   - What's unclear: Edge cases with multi-byte Unicode in file paths or identifiers
   - Recommendation: File paths and JS identifiers in practice are ASCII. Verify with snapshot corpus first.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v24.14.1 | -- |
| npm | Package management | Yes | 11.11.0 | -- |
| siphash | HASH-01 | Not installed yet | 1.2.0 (npm) | -- |
| oxc-parser | TEST-02 | Not installed yet | 0.124.0 (npm) | -- |
| vitest | TEST-04 | Not installed yet | 4.1.4 (npm) | -- |
| fast-deep-equal | TEST-02 | Not installed yet | 3.1.3 (npm) | -- |

**Missing dependencies with no fallback:** None -- all installable via npm.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | None -- Wave 0 must create vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Snapshot parser extracts all sections from .snap files | unit | `npx vitest run tests/testing/snapshot-parser.test.ts` | No -- Wave 0 |
| TEST-02 | AST comparison identifies semantic equivalence | unit | `npx vitest run tests/testing/ast-compare.test.ts` | No -- Wave 0 |
| TEST-03 | Metadata comparison matches all 13 fields exactly | unit | `npx vitest run tests/testing/metadata-compare.test.ts` | No -- Wave 0 |
| TEST-04 | Batch runner executes N snapshots, reports pass/fail | integration | `npx vitest run tests/testing/batch-runner.test.ts` | No -- Wave 0 |
| HASH-01 | SipHash-1-3 with (0,0) keys matches all snapshot hashes | unit | `npx vitest run tests/hashing/siphash.test.ts` | No -- Wave 0 |
| HASH-02 | Hash input is scope + rel_path + display_name bytes | unit | Covered by HASH-01 test (verified against known outputs) | No -- Wave 0 |
| HASH-03 | Hash output encoding matches base64url with 0 replacement | unit | Covered by HASH-01 test | No -- Wave 0 |
| HASH-04 | Display name construction matches all snapshot metadata | unit | `npx vitest run tests/hashing/naming.test.ts` | No -- Wave 0 |
| HASH-05 | Symbol name construction matches all snapshot metadata | unit | Covered by HASH-04 test | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- project root, ESM config
- [ ] `tsconfig.json` -- TypeScript configuration (ESM, NodeNext)
- [ ] `package.json` -- project manifest with dependencies
- [ ] `tests/hashing/siphash.test.ts` -- covers HASH-01, HASH-02, HASH-03
- [ ] `tests/hashing/naming.test.ts` -- covers HASH-04, HASH-05
- [ ] `tests/testing/snapshot-parser.test.ts` -- covers TEST-01
- [ ] `tests/testing/ast-compare.test.ts` -- covers TEST-02
- [ ] `tests/testing/metadata-compare.test.ts` -- covers TEST-03
- [ ] `tests/testing/batch-runner.test.ts` -- covers TEST-04
- [ ] Framework install: `npm install` -- no node_modules exist yet

## Security Domain

Security enforcement is not applicable to this phase. Phase 1 is pure test infrastructure and deterministic hashing -- no user input processing, no network I/O, no authentication, no data storage.

| ASVS Category | Applies | Reason |
|---------------|---------|--------|
| V2 Authentication | No | No auth in test tooling |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No access control |
| V5 Input Validation | No | Input is trusted snapshot files from local filesystem |
| V6 Cryptography | No | SipHash is a PRF for naming, not security-sensitive crypto |

## Sources

### Primary (HIGH confidence)
- [Rust DefaultHasher source](https://github.com/rust-lang/rust/blob/main/library/std/src/hash/random.rs) -- Confirmed SipHash-1-3 with keys (0,0) [VERIFIED: WebFetch]
- [Qwik transform.rs](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/transform.rs) -- base64(), register_context_name(), escape_sym() extracted [VERIFIED: WebFetch]
- [Rust PR #33940](https://github.com/rust-lang/rust/pull/33940) -- DefaultHasher changed from SipHash-2-4 to SipHash-1-3 in July 2016 [VERIFIED: WebFetch]
- siphash npm package v1.2.0 -- siphash13.js source inspected, 1 round + 3 finalization rounds confirmed [VERIFIED: npm pack + file inspection]
- 209 snapshot files in `match-these-snaps/` -- structure reverse-engineered from full corpus [VERIFIED: filesystem]

### Secondary (MEDIUM confidence)
- [siphash-js GitHub](https://github.com/jedisct1/siphash-js) -- API documentation for key format and return types [VERIFIED: WebFetch]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified on npm, algorithm confirmed from Rust source
- Architecture: HIGH -- snapshot format fully reverse-engineered from 209 files, hash algorithm extracted from Qwik source
- Pitfalls: HIGH -- identified from direct code inspection (CJS compatibility, byte order, base64 encoding layers)

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain -- hash algorithm and snapshot format won't change)
