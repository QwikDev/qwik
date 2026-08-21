/**
 * Branded primitive types for the optimizer. Each brand has exactly one smart constructor
 * (`mk<Brand>`); an invalid value is a defect, so the constructor throws rather than returning a
 * recoverable error.
 */

export type SymbolName = string & { readonly __brand: 'SymbolName' };
export type Hash = string & { readonly __brand: 'Hash' };
export type CanonicalFilename = string & { readonly __brand: 'CanonicalFilename' };
export type DisplayName = string & { readonly __brand: 'DisplayName' };
export type CtxName = string & { readonly __brand: 'CtxName' };

export type Origin = string & { readonly __brand: 'Origin' };
export type RelativePath = string & { readonly __brand: 'RelativePath' };
export type FilePath = string & { readonly __brand: 'FilePath' };

export type SourceText = string & { readonly __brand: 'SourceText' };
export type BodyText = string & { readonly __brand: 'BodyText' };

export type ByteOffset = number & { readonly __brand: 'ByteOffset' };
export type LineNumber = number & { readonly __brand: 'LineNumber' };
export type ColumnNumber = number & { readonly __brand: 'ColumnNumber' };

const IDENTIFIER_SHAPE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Accepts any non-empty alphanumeric-or-underscore string. Underscores are allowed because the
 * inlinedQrl fallback can use a whole symbol name (e.g. `Foo_component_bbb`) as the hash slot;
 * whitespace, path separators, `.`, and `-` are still rejected, and the distinct brand keeps this
 * apart from `SymbolName`.
 */
const HASH_SHAPE = /^[A-Za-z0-9_]+$/;

/**
 * Context-name shape. Accepts the bare `$` marker, marker callees (`component$`), post-rewrite
 * `Qrl` forms (`componentQrl`), and JSX attribute names whose namespace (`:`) and hyphen (`-`)
 * characters would otherwise be rejected.
 */
const CTX_NAME_SHAPE = /^(\$|[a-zA-Z_][a-zA-Z0-9_:-]*\$?)$/;

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
 * Loose by design: canonical filenames and display names span more than a JS identifier
 * (`[[...slug]].tsx_slug_component`, `404.tsx__404_component`), so non-empty is the only invariant
 * enforceable without rejecting real input. The brand still keeps them distinct from `SymbolName`
 * and `Hash`.
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

export function mkOrigin(s: string): Origin {
  if (s.length === 0) {
    throw new Error('mkOrigin: empty string');
  }
  return s as Origin;
}

// `TransformModule.path` must preserve the consumer's `input.path` namespace
// so a bundler-supplied absolute path round-trips as an absolute output path
// (the bundler's `resolveId` hook depends on it). Empty-string is the only
// invariant enforceable here.
export function mkRelativePath(s: string): RelativePath {
  if (s.length === 0) {
    throw new Error('mkRelativePath: empty string');
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

export function mkSourceText(s: string): SourceText {
  return s as SourceText;
}

export function mkBodyText(s: string): BodyText {
  return s as BodyText;
}

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
