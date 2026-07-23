import MagicString from 'magic-string';
import type { AstFunction, AstProgram } from '../../ast-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';

/**
 * Every session wraps the body identically (and parses under one filename) so the parse memo can
 * key on the wrapped source and share a parse across consecutive helpers operating on the same
 * text.
 */
const WRAPPER_PREFIX = 'const __seg__ = ';
const SESSION_FILENAME = '__session__.tsx';

/**
 * Parse memo keyed by the exact wrapped source string, so a text change between helpers produces a
 * different key and staleness is impossible. Sharing a parsed AST is safe: raw-transfer parses
 * materialize plain JS objects (no buffer aliasing) and consumers read without mutating; each
 * session gets its own MagicString.
 */
const PARSE_MEMO_CAP = 16;
const parseMemo = new Map<string, ReturnType<typeof parseWithRawTransfer>>();

function memoizedParse(wrappedSource: string): ReturnType<typeof parseWithRawTransfer> {
  const hit = parseMemo.get(wrappedSource);
  if (hit !== undefined) {
    // Re-insert (LRU): move the hot entry to the newest slot so it survives eviction.
    parseMemo.delete(wrappedSource);
    parseMemo.set(wrappedSource, hit);
    return hit;
  }
  const parsed = parseWithRawTransfer(SESSION_FILENAME, wrappedSource);
  if (parseMemo.size >= PARSE_MEMO_CAP) {
    const oldest = parseMemo.keys().next().value;
    if (oldest !== undefined) parseMemo.delete(oldest);
  }
  parseMemo.set(wrappedSource, parsed);
  return parsed;
}

export interface TransformSession {
  sourceText: string;
  wrappedSource: string;
  wrapperPrefix: string;
  wrapperSuffix: string;
  offset: number;
  program: AstProgram;
  edits: MagicString;
  toSource(): string;
}

export interface FunctionTransformSession extends TransformSession {
  fn: AstFunction;
}

interface TransformSessionOptions {
  /**
   * Proceed with the recovered AST when the parse reports recoverable errors. Analysis call sites
   * whose inputs legitimately contain recoverable shapes (e.g. `() => await api()` in non-async
   * position) opt in; edit-applying sites stay strict and bail to their unchanged-text fallback.
   */
  tolerateErrors?: boolean;
}

export function createTransformSession(
  sourceText: string,
  options: TransformSessionOptions = {}
): TransformSession | null {
  const wrappedSource = WRAPPER_PREFIX + sourceText;
  const parseResult = memoizedParse(wrappedSource);

  if (!parseResult.program) return null;
  if (!options.tolerateErrors && parseResult.errors?.length) {
    return null;
  }

  // Lazy so read-only sessions don't pay MagicString's full-source walk.
  let edits: MagicString | undefined;
  return {
    sourceText,
    wrappedSource,
    wrapperPrefix: WRAPPER_PREFIX,
    wrapperSuffix: '',
    offset: WRAPPER_PREFIX.length,
    program: parseResult.program,
    get edits(): MagicString {
      if (edits === undefined) edits = new MagicString(wrappedSource);
      return edits;
    },
    toSource() {
      if (edits === undefined) return this.sourceText;
      const transformed = edits.toString();
      return transformed.slice(
        this.wrapperPrefix.length,
        transformed.length - this.wrapperSuffix.length
      );
    },
  };
}

export function createFunctionTransformSession(
  sourceText: string,
  options: TransformSessionOptions = {}
): FunctionTransformSession | null {
  const session = createTransformSession(sourceText, options);
  if (!session) return null;

  const decl = session.program.body[0];
  if (!decl || decl.type !== 'VariableDeclaration') return null;
  const init = decl.declarations?.[0]?.init;
  if (!init) return null;
  if (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') {
    return null;
  }
  if (!init.body) return null;

  // Object.assign (not spread): spreading would invoke the lazy `edits`
  // getter, forcing the MagicString and freezing it as a data property.
  return Object.assign(session, { fn: init });
}

export function insertFunctionBodyPrologue(
  session: TransformSession,
  fn: AstFunction,
  line: string
): void {
  if (!fn.body) return;
  if (fn.body.type === 'BlockStatement') {
    session.edits.appendLeft(fn.body.start + 1, `\n${line}`);
    return;
  }

  const expressionText = session.wrappedSource.slice(fn.body.start, fn.body.end);
  session.edits.overwrite(fn.body.start, fn.body.end, `{\n${line}\nreturn ${expressionText};\n}`);
}

export function replaceFunctionParams(
  session: TransformSession,
  fn: AstFunction,
  paramNames: string[]
): boolean {
  if (!fn.body) return false;
  const paramList = paramNames.join(', ');
  if (fn.params.length > 0) {
    const firstParam = fn.params[0]!;
    const lastParam = fn.params[fn.params.length - 1]!;
    const hasParens =
      session.wrappedSource[firstParam.start - 1] === '(' &&
      session.wrappedSource[lastParam.end] === ')';
    session.edits.overwrite(
      firstParam.start,
      lastParam.end,
      hasParens ? paramList : `(${paramList})`
    );
    return true;
  }

  const prefix = session.wrappedSource.slice(fn.start, fn.body.start);
  const openParen = prefix.lastIndexOf('(');
  const closeParen = prefix.lastIndexOf(')');
  if (openParen === -1 || closeParen === -1 || closeParen < openParen) {
    return false;
  }

  const insertStart = fn.start + openParen + 1;
  const insertEnd = fn.start + closeParen;
  if (insertStart === insertEnd) {
    session.edits.appendLeft(insertStart, paramList);
  } else {
    session.edits.overwrite(insertStart, insertEnd, paramList);
  }
  return true;
}
