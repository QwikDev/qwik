import MagicString from 'magic-string';
import type { AstFunction, AstProgram } from '../../ast-types.js';
import { parseWithRawTransfer } from './parse.js';

interface TransformSessionOptions {
  wrapperPrefix?: string;
  wrapperSuffix?: string;
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

export function createTransformSession(
  filename: string,
  sourceText: string,
  options: TransformSessionOptions = {},
): TransformSession | null {
  const wrapperPrefix = options.wrapperPrefix ?? '';
  const wrapperSuffix = options.wrapperSuffix ?? '';
  const wrappedSource = wrapperPrefix + sourceText + wrapperSuffix;
  const parseResult = parseWithRawTransfer(filename, wrappedSource);

  if (!parseResult.program || parseResult.errors?.length) {
    return null;
  }

  return {
    sourceText,
    wrappedSource,
    wrapperPrefix,
    wrapperSuffix,
    offset: wrapperPrefix.length,
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
  filename: string,
  sourceText: string,
  options: TransformSessionOptions = {},
): FunctionTransformSession | null {
  const session = createTransformSession(filename, sourceText, options);
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
