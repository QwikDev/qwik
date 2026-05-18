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
 * any consumer signature. Propagation lands in OSS-384 / OSS-385 / OSS-386
 * per the OSS-381 rollout plan.
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
 * Qwik's 11-character hash form, per the documented SipHash-1-3 →
 * base64url-with-`-`/`_`-rewritten-to-`0` scheme in OPTIMIZER.md
 * ("Symbol naming and hashing"). The character set is the alphanumeric
 * subset of base64url after the safety rewrite — no `-`, no `_`, no `+`,
 * no `/`, no padding.
 */
const QWIK_HASH_SHAPE = /^[A-Za-z0-9]{11}$/;

/**
 * Context-name shape: a marker callee (`component$`, `useTask$`,
 * `useStyles$`), a synthesised base form (`component`), the post-rewrite
 * `Qrl`-suffixed form (`componentQrl`), or a JSX attribute name with
 * optional namespace prefix and `$` suffix (`onClick$`,
 * `document:onScroll$`, `window:onResize$`, `bind:value$`).
 *
 * Must start with a letter or underscore; body may contain alphanumerics,
 * underscore, or `:` (for namespaced JSX attrs); optional trailing `$`.
 */
const CTX_NAME_SHAPE = /^[a-zA-Z_][a-zA-Z0-9_:]*\$?$/;

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
  if (!QWIK_HASH_SHAPE.test(s)) {
    throw new Error(`mkHash: expected 11-char base64url-safe hash, got: ${JSON.stringify(s)}`);
  }
  return s as Hash;
}

export function mkCanonicalFilename(s: string): CanonicalFilename {
  if (!IDENTIFIER_SHAPE.test(s)) {
    throw new Error(`mkCanonicalFilename: invalid identifier shape: ${JSON.stringify(s)}`);
  }
  return s as CanonicalFilename;
}

export function mkDisplayName(s: string): DisplayName {
  if (!IDENTIFIER_SHAPE.test(s)) {
    throw new Error(`mkDisplayName: invalid identifier shape: ${JSON.stringify(s)}`);
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
