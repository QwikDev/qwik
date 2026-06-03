/**
 * Branded primitive types for the optimizer.
 *
 * Per `CODING_BEST_PRACTICES.md` rules "Identifier-shaped strings are
 * branded" and "Wide types are not allowed": `string` is rarely the right
 * type for an identifier or path, and `number` is rarely the right type
 * for a position offset. Brands give the compiler enough information to
 * refuse `(symbolName, hash)` calls where the arguments are swapped.
 *
 * **Construction policy**: every brand has exactly one smart constructor
 * (the `mk<Brand>` functions in this file). Construction validates the
 * value's shape and throws on violation — per the CBP "Thrown exceptions
 * are reserved for defects" rule, an invalid brand value is a defect, not
 * a runtime condition the caller should recover from.
 *
 * **Foundation only.** This module defines brands + constructors. It does
 * *not* propagate them through `SegmentAnalysis`, `ExtractionResult`, or
 * any consumer signature — that propagation lives at the consumer-type
 * definitions in `types.ts`, `extract.ts`, and downstream callers.
 */

// ---------------------------------------------------------------------------
// Identifier brands
// ---------------------------------------------------------------------------

export type SymbolName = string & { readonly __brand: 'SymbolName' };
export type Hash = string & { readonly __brand: 'Hash' };
export type CanonicalFilename = string & { readonly __brand: 'CanonicalFilename' };
export type DisplayName = string & { readonly __brand: 'DisplayName' };
export type CtxName = string & { readonly __brand: 'CtxName' };

// ---------------------------------------------------------------------------
// Path brands
// ---------------------------------------------------------------------------

export type Origin = string & { readonly __brand: 'Origin' };
export type RelativePath = string & { readonly __brand: 'RelativePath' };
export type FilePath = string & { readonly __brand: 'FilePath' };

// ---------------------------------------------------------------------------
// Source-text brands
// ---------------------------------------------------------------------------

export type SourceText = string & { readonly __brand: 'SourceText' };
export type BodyText = string & { readonly __brand: 'BodyText' };

// ---------------------------------------------------------------------------
// Position brands
// ---------------------------------------------------------------------------

export type ByteOffset = number & { readonly __brand: 'ByteOffset' };
export type LineNumber = number & { readonly __brand: 'LineNumber' };
export type ColumnNumber = number & { readonly __brand: 'ColumnNumber' };

// ---------------------------------------------------------------------------
// Shape regexes
// ---------------------------------------------------------------------------

const IDENTIFIER_SHAPE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Hash slot shape: any non-empty alphanumeric-or-underscore string.
 *
 * Qwik's own `qwikHash()` always emits exactly 11 alphanumeric chars
 * (SipHash-1-3 → 8 bytes → 11 base64url chars after the `-`/`_` → `0`
 * safety rewrite — see OPTIMIZER.md "Symbol naming and hashing"). But the
 * inlinedQrl extraction path at `extract.ts` has two looser fallbacks
 * driven by peer-tool input we don't control:
 *
 * 1. Parser happy path accepts 8+ alphanumeric (`extract.ts:424`).
 * 2. Parse failure (no `_` separator, or last segment <8 chars / non-
 *    alphanumeric) falls back to using the whole symbol name as the hash
 *    slot — which can contain underscores like `Foo_component_bbb`.
 *
 * The brand validation matches the parser's actual acceptance set so it
 * doesn't reject inputs the rest of the pipeline already handles. We
 * still catch whitespace, path separators, `.`, `-`, and other non-
 * identifier garbage at the type boundary — those *are* the bugs worth
 * preventing here. The TypeScript type-level distinction from `SymbolName`
 * (different brand marker) provides the swap-prevention safety
 * regardless of how the runtime regex is shaped.
 */
const HASH_SHAPE = /^[A-Za-z0-9_]+$/;

/**
 * Context-name shape — one of:
 *
 * - The bare base marker `$` standalone (the `$()` callable's ctxName).
 *   Refusing this would block legitimate production input (the bare
 *   `$()` extractions assert `seg.ctxName === '$'`).
 * - A marker callee: `component$`, `useTask$`, `useStyles$`.
 * - A synthesised base form: `component`.
 * - The post-rewrite `Qrl`-suffixed form: `componentQrl`.
 * - A JSX attribute name with optional namespace prefix and `$` suffix:
 *   `onClick$`, `document:onScroll$`, `window:onResize$`, `bind:value$`.
 * - A hyphenated JSX attribute name: `on-cLick$`, `aria-label$`, `data-*$`,
 *   etc. JSX accepts dashed attribute names and convergence fixtures
 *   include them; refusing `-` would block real input.
 *
 * The non-`$` arm: must start with a letter or underscore; body may
 * contain alphanumerics, underscore, `:` (for namespaced JSX attrs), or
 * `-` (for hyphenated JSX attrs); optional trailing `$`.
 */
const CTX_NAME_SHAPE = /^(\$|[a-zA-Z_][a-zA-Z0-9_:-]*\$?)$/;

// ---------------------------------------------------------------------------
// Smart constructors — identifier brands
// ---------------------------------------------------------------------------

export function mkSymbolName(s: string): SymbolName {
  if (!IDENTIFIER_SHAPE.test(s)) {
    throw new Error(`mkSymbolName: invalid identifier shape: ${JSON.stringify(s)}`);
  }
  return s as SymbolName;
}

export function mkHash(s: string): Hash {
  if (!HASH_SHAPE.test(s)) {
    throw new Error(`mkHash: expected non-empty [A-Za-z0-9_]+, got: ${JSON.stringify(s)}`);
  }
  return s as Hash;
}

/**
 * `CanonicalFilename` and `DisplayName` are deliberately loose at the brand
 * level — the validity space is wider than a JS identifier. Examples of
 * legitimate values from the Qwik test fixtures: `test.tsx_renderHeader1`,
 * `[[...slug]].tsx_slug_component` (Qwik catch-all route), `404.tsx__404_component`
 * (digit-leading filename). Trying to enforce a regex here either rejects
 * real inputs or becomes permissive enough to be meaningless. Non-empty
 * is the only invariant we can rely on; the brand still keeps these
 * distinct from `SymbolName`, `Hash`, and arbitrary strings at the type
 * level.
 */
export function mkCanonicalFilename(s: string): CanonicalFilename {
  if (s.length === 0) {
    throw new Error('mkCanonicalFilename: empty string');
  }
  return s as CanonicalFilename;
}

export function mkDisplayName(s: string): DisplayName {
  if (s.length === 0) {
    throw new Error('mkDisplayName: empty string');
  }
  return s as DisplayName;
}

export function mkCtxName(s: string): CtxName {
  if (!CTX_NAME_SHAPE.test(s)) {
    throw new Error(`mkCtxName: invalid context-name shape: ${JSON.stringify(s)}`);
  }
  return s as CtxName;
}

// ---------------------------------------------------------------------------
// Smart constructors — path brands
// ---------------------------------------------------------------------------

export function mkOrigin(s: string): Origin {
  if (s.length === 0) {
    throw new Error('mkOrigin: empty string');
  }
  return s as Origin;
}

export function mkRelativePath(s: string): RelativePath {
  if (s.length === 0) {
    throw new Error('mkRelativePath: empty string');
  }
  if (s.startsWith('/')) {
    throw new Error(`mkRelativePath: leading slash forbidden: ${JSON.stringify(s)}`);
  }
  return s as RelativePath;
}

export function mkFilePath(s: string): FilePath {
  if (s.length === 0) {
    throw new Error('mkFilePath: empty string');
  }
  if (s.includes('//')) {
    throw new Error(`mkFilePath: empty path segment (//): ${JSON.stringify(s)}`);
  }
  return s as FilePath;
}

// ---------------------------------------------------------------------------
// Smart constructors — source-text brands (pass-through)
// ---------------------------------------------------------------------------

export function mkSourceText(s: string): SourceText {
  return s as SourceText;
}

export function mkBodyText(s: string): BodyText {
  return s as BodyText;
}

// ---------------------------------------------------------------------------
// Smart constructors — position brands
// ---------------------------------------------------------------------------

export function mkByteOffset(n: number): ByteOffset {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`mkByteOffset: expected non-negative integer, got: ${n}`);
  }
  return n as ByteOffset;
}

export function mkLineNumber(n: number): LineNumber {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`mkLineNumber: expected non-negative integer, got: ${n}`);
  }
  return n as LineNumber;
}

export function mkColumnNumber(n: number): ColumnNumber {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`mkColumnNumber: expected non-negative integer, got: ${n}`);
  }
  return n as ColumnNumber;
}
