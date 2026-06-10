import MagicString from 'magic-string';
import type { AstFunction, AstProgram } from '../../ast-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';

/**
 * Canonical wrapper for body-text edit sessions. Every session wraps the
 * body identically (and parses under one filename) so the parse memo
 * below can recognize repeated parses: consecutive helpers in a body
 * pipeline that operate on the same text version share one parse instead
 * of each paying for its own.
 */
const WRAPPER_PREFIX = 'const __seg__ = ';
const SESSION_FILENAME = '__session__.tsx';

/**
 * Last-N parse memo, keyed by the exact wrapped source string — a text
 * change between helpers produces a different key, so staleness is
 * impossible by construction. Sharing is safe because eager raw-transfer
 * parses materialize plain JS objects (no buffer aliasing) and session
 * consumers read the AST without mutating it; each session still gets
 * its own MagicString. Cap of 4 covers interleaved parent/segment body
 * pipelines without growing with module count.
 */
const PARSE_MEMO_CAP = 4;
const parseMemo = new Map<string, ReturnType<typeof parseWithRawTransfer>>();

function memoizedParse(wrappedSource: string): ReturnType<typeof parseWithRawTransfer> {
  const hit = parseMemo.get(wrappedSource);
  if (hit !== undefined) {
    // Refresh recency so chains longer than the cap keep their hot entry.
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
   * Proceed with the recovered AST when the parse reports recoverable
   * errors (`program` present, `errors` non-empty). Call sites that
   * historically parsed directly without an error check — and whose
   * inputs legitimately contain recoverable shapes like `() => await
   * api()` in non-async position — opt in; edit-applying sites stay
   * strict and bail to their unchanged-text fallback.
   */
  tolerateErrors?: boolean;
}

export function createTransformSession(
  sourceText: string,
  options: TransformSessionOptions = {},
): TransformSession | null {
  const wrappedSource = WRAPPER_PREFIX + sourceText;
  const parseResult = memoizedParse(wrappedSource);

  if (!parseResult.program) return null;
  if (!options.tolerateErrors && parseResult.errors?.length) {
    return null;
  }

  return {
    sourceText,
    wrappedSource,
    wrapperPrefix: WRAPPER_PREFIX,
    wrapperSuffix: '',
    offset: WRAPPER_PREFIX.length,
    program: parseResult.program,
    edits: new MagicString(wrappedSource),
    toSource() {
      const transformed = this.edits.toString();
      return transformed.slice(
        this.wrapperPrefix.length,
        transformed.length - this.wrapperSuffix.length,
      );
    },
  };
}

export function createFunctionTransformSession(
  sourceText: string,
  options: TransformSessionOptions = {},
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

  return {
    ...session,
    fn: init,
  };
}

export function insertFunctionBodyPrologue(
  session: TransformSession,
  fn: AstFunction,
  line: string,
): void {
  if (!fn.body) return;
  if (fn.body.type === 'BlockStatement') {
    session.edits.appendLeft(fn.body.start + 1, `\n${line}`);
    return;
  }

  const expressionText = session.wrappedSource.slice(fn.body.start, fn.body.end);
  session.edits.overwrite(
    fn.body.start,
    fn.body.end,
    `{\n${line}\nreturn ${expressionText};\n}`,
  );
}

export function replaceFunctionParams(
  session: TransformSession,
  fn: AstFunction,
  paramNames: string[],
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
      hasParens ? paramList : `(${paramList})`,
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
