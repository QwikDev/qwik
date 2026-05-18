/**
 * Compile-time assertions for brand non-interchangeability.
 *
 * These tests never run. `pnpm typecheck` is the gate: each
 * `@ts-expect-error` line asserts that the next statement *fails to
 * compile*. If TypeScript accepts the line, `@ts-expect-error` itself
 * becomes an error and typecheck fails — that is the bug we'd want to
 * catch.
 *
 * If you find yourself wanting to "fix" one of these errors, the type
 * system is doing exactly what it should. Use the right smart constructor
 * or accept the value from a properly-typed source instead.
 */

import {
  mkSymbolName,
  mkHash,
  mkCanonicalFilename,
  mkDisplayName,
  mkCtxName,
  mkOrigin,
  mkRelativePath,
  mkFilePath,
  mkByteOffset,
  mkLineNumber,
  mkColumnNumber,
  type SymbolName,
  type Hash,
  type CanonicalFilename,
  type DisplayName,
  type CtxName,
  type Origin,
  type RelativePath,
  type FilePath,
  type ByteOffset,
  type LineNumber,
  type ColumnNumber,
} from '../../../src/optimizer/types/brands.js';

// ---------------------------------------------------------------------------
// Cross-brand assignment is forbidden
// ---------------------------------------------------------------------------

const sym: SymbolName = mkSymbolName('foo');
const hash: Hash = mkHash('jMxQsjbyDss');
const canonical: CanonicalFilename = mkCanonicalFilename('test_tsx_foo_jMxQsjbyDss');
const display: DisplayName = mkDisplayName('Foo');
const ctx: CtxName = mkCtxName('component$');

// @ts-expect-error — SymbolName is not assignable to Hash
const _hashFromSym: Hash = sym;

// @ts-expect-error — Hash is not assignable to SymbolName
const _symFromHash: SymbolName = hash;

// @ts-expect-error — CanonicalFilename is not assignable to DisplayName
const _displayFromCanonical: DisplayName = canonical;

// @ts-expect-error — DisplayName is not assignable to CanonicalFilename
const _canonicalFromDisplay: CanonicalFilename = display;

// @ts-expect-error — CtxName is not assignable to SymbolName
const _symFromCtx: SymbolName = ctx;

// ---------------------------------------------------------------------------
// Plain `string` cannot satisfy a brand without a smart constructor
// ---------------------------------------------------------------------------

const bareString = 'foo';

// @ts-expect-error — plain string is not assignable to SymbolName
const _symFromBare: SymbolName = bareString;

// @ts-expect-error — plain string is not assignable to Hash
const _hashFromBare: Hash = bareString;

// ---------------------------------------------------------------------------
// Function arguments — the canonical motivating example
// ---------------------------------------------------------------------------

declare function emitSegment(name: SymbolName, h: Hash): void;

// Correct: matches signature in order
emitSegment(sym, hash);

// @ts-expect-error — arguments swapped: Hash where SymbolName expected
emitSegment(hash, sym);

// @ts-expect-error — both bare strings forbidden
emitSegment('foo', 'jMxQsjbyDss');

// ---------------------------------------------------------------------------
// Path brands cross-cut
// ---------------------------------------------------------------------------

const origin: Origin = mkOrigin('test.tsx');
const rel: RelativePath = mkRelativePath('src/foo.ts');
const file: FilePath = mkFilePath('/abs/foo.ts');

// @ts-expect-error — Origin is not assignable to RelativePath
const _relFromOrigin: RelativePath = origin;

// @ts-expect-error — FilePath is not assignable to RelativePath
const _relFromFile: RelativePath = file;

// @ts-expect-error — RelativePath is not assignable to FilePath
const _fileFromRel: FilePath = rel;

// ---------------------------------------------------------------------------
// Position brands cross-cut
// ---------------------------------------------------------------------------

const offset: ByteOffset = mkByteOffset(42);
const line: LineNumber = mkLineNumber(10);
const col: ColumnNumber = mkColumnNumber(5);

// @ts-expect-error — ByteOffset is not assignable to LineNumber
const _lineFromOffset: LineNumber = offset;

// @ts-expect-error — LineNumber is not assignable to ColumnNumber
const _colFromLine: ColumnNumber = line;

// @ts-expect-error — plain number is not assignable to ByteOffset
const _offsetFromBare: ByteOffset = 42;

declare function emitLoc(o: ByteOffset, l: LineNumber, c: ColumnNumber): void;

emitLoc(offset, line, col);

// @ts-expect-error — line + offset swapped
emitLoc(line, offset, col);

// ---------------------------------------------------------------------------
// Brand string-ness is preserved (brands ARE assignable TO their base type)
// ---------------------------------------------------------------------------
// This direction must succeed — a SymbolName must be usable wherever a
// plain string is accepted (e.g. concatenation, logging, JSON output).

const _strFromSym: string = sym;
const _strFromHash: string = hash;
const _numFromOffset: number = offset;
