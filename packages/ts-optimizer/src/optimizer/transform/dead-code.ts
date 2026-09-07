/**
 * Constant-branch folding on the AST: `if (true/false)` statements, `cond ? a : b`,
 * `!true`/`!false`, and `true && x` / `false || x` / `false && x` shapes collapse via range edits
 * against the original text — one parse, one MagicString write, no textual pattern matching. Dead
 * branches are marked and never walked, so cascades (`else if` chains, nested folds) resolve in a
 * single pass.
 */

import MagicString from 'magic-string';
import type { AstMaybeNode, AstNode, AstProgram } from '../../ast-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';
import { forEachAstChild } from '../ast/guards.js';

/**
 * Every fold below bottoms out at a boolean literal (directly, parenthesised, or under `!`), so a
 * module without one has nothing to fold. Enumerating the _shapes_ instead would silently skip the
 * pass whenever a new one appeared — that is how constant-test ternaries went unfolded.
 */
const booleanLiteral = /\b(?:true|false)\b/;

export function hasSegmentDcePatterns(code: string): boolean {
  return booleanLiteral.test(code);
}

/** Resolve an expression to a compile-time boolean when possible. */
function resolveBoolValue(node: AstMaybeNode): boolean | undefined {
  if (node == null) {
    return undefined;
  }
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'boolean' ? node.value : undefined;
    case 'ParenthesizedExpression':
      return resolveBoolValue(node.expression);
    case 'UnaryExpression': {
      if (node.operator !== '!') {
        return undefined;
      }
      const inner = resolveBoolValue(node.argument);
      return inner === undefined ? undefined : !inner;
    }
    default:
      return undefined;
  }
}

/** Top-level lexical declarations make a block unsafe to unwrap into statement position. */
function blockHasLexicalDecls(block: AstNode): boolean {
  if (block.type !== 'BlockStatement') {
    return false;
  }
  for (const stmt of block.body ?? []) {
    if (
      stmt.type === 'VariableDeclaration' ||
      stmt.type === 'FunctionDeclaration' ||
      stmt.type === 'ClassDeclaration'
    ) {
      return true;
    }
  }
  return false;
}

export function applySegmentDCE(
  code: string,
  filename = 'dce.tsx',
  preParsedProgram?: AstProgram
): string {
  let program;
  if (preParsedProgram) {
    program = preParsedProgram;
  } else {
    try {
      program = parseWithRawTransfer(filename, code).program;
    } catch {
      return code;
    }
  }

  const s = new MagicString(code);
  let changed = false;

  /**
   * Where a fold's edits land, given the if's position: `elseFrom` covers the parent's `else`
   * keyword when this if is an else-if arm; `inStatementList` allows unwrapping a kept block (only
   * safe directly inside a Program/BlockStatement body).
   */
  interface FoldContext {
    elseFrom?: number;
    inStatementList: boolean;
  }
  const EXPR_CTX: FoldContext = { inStatementList: false };

  function foldIf(node: AstNode & { type: 'IfStatement' }, ctx: FoldContext, value: boolean): void {
    changed = true;
    const kept = value ? node.consequent : (node.alternate ?? null);
    if (kept === null) {
      // Dropping an else-if arm must consume the parent's `else` keyword too.
      s.remove(ctx.elseFrom ?? node.start, node.end);
      return;
    }
    s.remove(node.start, kept.start);
    if (kept.end < node.end) {
      s.remove(kept.end, node.end);
    }
    if (
      ctx.inStatementList &&
      ctx.elseFrom === undefined &&
      kept.type === 'BlockStatement' &&
      !blockHasLexicalDecls(kept)
    ) {
      // Unwrap `{ ... }` into statement position (rust parity).
      s.remove(kept.start, kept.start + 1);
      s.remove(kept.end - 1, kept.end);
    }
    walk(kept, { inStatementList: ctx.inStatementList, elseFrom: ctx.elseFrom });
  }

  function walk(node: AstMaybeNode, ctx: FoldContext): void {
    if (node == null) {
      return;
    }

    if (node.type === 'IfStatement') {
      const value = resolveBoolValue(node.test);
      if (value !== undefined) {
        foldIf(node, ctx, value);
        return;
      }
      walk(node.test, EXPR_CTX);
      walk(node.consequent, { inStatementList: false });
      // An else-if arm folds together with our `else` keyword.
      walk(node.alternate, { inStatementList: false, elseFrom: node.consequent.end });
      return;
    }

    if (node.type === 'ConditionalExpression') {
      const value = resolveBoolValue(node.test);
      if (value !== undefined) {
        changed = true;
        const kept = value ? node.consequent : node.alternate;
        const keptText = code.slice(kept.start, kept.end);
        // An object or function branch would reparse as a block or declaration
        // once the ternary around it is gone.
        const needsParens = /^[{(]?\s*$|^[{]|^function\b|^class\b/.test(keptText);
        s.overwrite(node.start, node.end, needsParens ? `(${keptText})` : keptText);
        walk(kept, EXPR_CTX);
        return;
      }
      walk(node.test, EXPR_CTX);
      walk(node.consequent, EXPR_CTX);
      walk(node.alternate, EXPR_CTX);
      return;
    }

    if (node.type === 'LogicalExpression') {
      const left = resolveBoolValue(node.left);
      if (node.operator === '&&' && left === true) {
        changed = true;
        s.remove(node.start, node.right.start);
        walk(node.right, EXPR_CTX);
        return;
      }
      if (node.operator === '&&' && left === false) {
        changed = true;
        s.overwrite(node.start, node.end, 'false');
        return;
      }
      if (node.operator === '||' && left === false) {
        changed = true;
        s.remove(node.start, node.right.start);
        walk(node.right, EXPR_CTX);
        return;
      }
      walk(node.left, EXPR_CTX);
      walk(node.right, EXPR_CTX);
      return;
    }

    if (node.type === 'UnaryExpression' && node.operator === '!') {
      const value = resolveBoolValue(node);
      if (value !== undefined) {
        changed = true;
        s.overwrite(node.start, node.end, String(value));
        return;
      }
    }

    if (node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'StaticBlock') {
      for (const stmt of node.body ?? []) {
        walk(stmt, { inStatementList: true });
      }
      return;
    }

    forEachAstChild(node, (child) => walk(child, EXPR_CTX));
  }

  walk(program as unknown as AstNode, { inStatementList: true });

  if (!changed) {
    return code;
  }
  return s.toString();
}
