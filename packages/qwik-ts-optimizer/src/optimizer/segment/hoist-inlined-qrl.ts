/**
 * A capture-position `inlinedQrl` (a QRL used inside another QRL's captures
 * array) is not a lazy boundary, so its body is kept inline but still needs a
 * stable top-level binding: `inlinedQrl(() => {…}, "name", […])` becomes
 * `const _inlined_name = () => {…}` + `inlinedQrl(_inlined_name, "name", […])`.
 */

import { walk } from 'oxc-walker';
import MagicString from 'magic-string';
import type { AstNode, AstProgram } from '../../ast-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';

interface HoistCandidate {
  // `arg*` is the function-body range (lifted to `bindingName`); `call*` is the
  // whole `inlinedQrl(...)` call range (classifies leaf vs nested candidates).
  readonly argStart: number;
  readonly argEnd: number;
  readonly callStart: number;
  readonly callEnd: number;
  readonly bindingName: string;
}

export function hoistInlinedQrlBodies(code: string): string {
  if (!code.includes('inlinedQrl(')) return code;

  let current = code;
  // Each pass hoists only candidates whose body holds no other candidate
  // (leaf-first), so every pass edits disjoint ranges and nested chains still
  // resolve; the cap is a runaway guard, real inputs converge in one or two.
  for (let pass = 0; pass < 16; pass++) {
    const next = hoistOnePass(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function hoistOnePass(code: string): string {
  let program: AstProgram;
  try {
    program = parseWithRawTransfer('segment.tsx', code).program;
  } catch {
    return code;
  }

  const candidates: HoistCandidate[] = [];
  walk(program, {
    enter(node: AstNode) {
      const candidate = asHoistCandidate(node);
      if (candidate) candidates.push(candidate);
    },
  });
  if (candidates.length === 0) return code;

  // Defer non-leaves: once a leaf's body is replaced by its identifier, the
  // enclosing candidate becomes a leaf on the next pass.
  const leaves = candidates.filter(
    (c) =>
      !candidates.some(
        (o) => o !== c && o.callStart >= c.argStart && o.callEnd <= c.argEnd,
      ),
  );
  if (leaves.length === 0) return code;
  leaves.sort((a, b) => a.argStart - b.argStart);

  const s = new MagicString(code);
  const decls: string[] = [];
  for (const leaf of leaves) {
    decls.push(`const ${leaf.bindingName} = ${code.slice(leaf.argStart, leaf.argEnd)};`);
    s.overwrite(leaf.argStart, leaf.argEnd, leaf.bindingName);
  }
  s.appendLeft(lastImportEnd(program), '\n' + decls.join('\n'));
  return s.toString();
}

function asHoistCandidate(node: AstNode): HoistCandidate | null {
  if (node.type !== 'CallExpression') return null;
  if (node.callee.type !== 'Identifier' || node.callee.name !== 'inlinedQrl') return null;
  // A function-expression first arg is an un-hoisted body; an identifier is
  // already lifted.
  const fnArg = node.arguments[0];
  if (
    !fnArg ||
    (fnArg.type !== 'ArrowFunctionExpression' && fnArg.type !== 'FunctionExpression')
  ) {
    return null;
  }
  const nameArg = node.arguments[1];
  if (!nameArg || nameArg.type !== 'Literal' || typeof nameArg.value !== 'string') return null;
  return {
    argStart: fnArg.start,
    argEnd: fnArg.end,
    callStart: node.start,
    callEnd: node.end,
    bindingName: `_inlined_${nameArg.value}`,
  };
}

function lastImportEnd(program: AstProgram): number {
  let end = 0;
  for (const stmt of program.body) {
    if (stmt.type === 'ImportDeclaration') end = stmt.end;
  }
  return end;
}
