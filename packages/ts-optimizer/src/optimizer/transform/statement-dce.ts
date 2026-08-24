/**
 * Statement-level dead-code elimination mirroring SWC's simplify pass on emitted modules: unused
 * pure declarations, unused function/class declarations, and empty try statements are removed from
 * block bodies. Runs to a fixpoint on one parse: removed statements join a dead-range set, and
 * reference counting simply skips dead ranges — no reparse between passes.
 */

import MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';
import { forEachAstChild } from '../ast/guards.js';
import { isNonReferenceIdentifier } from '../analysis/variable-migration.js';

interface RangedNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
}

function isRecordNode(value: unknown): value is Record<string, unknown> & RangedNode {
  return typeof value === 'object' && value !== null && 'type' in value;
}

export function extractBinaryOperandIdentifiers(node: AstNode): string[] {
  const names: string[] = [];
  const visit = (current: AstNode | null | undefined): boolean => {
    if (!current) {
      return false;
    }
    if (current.type === 'Identifier') {
      names.push(current.name);
      return true;
    }
    if (current.type === 'Literal') {
      return true;
    }
    if (current.type === 'BinaryExpression') {
      return visit(current.left) && visit(current.right);
    } else if (current.type === 'ParenthesizedExpression') {
      return visit(current.expression);
    }
    return false;
  };
  return visit(node) ? names : [];
}

/** Names referenced anywhere except declaration-name positions; dead ranges don't count. */
function collectReferencedNames(program: AstProgram, dead: readonly RangedNode[]): Set<string> {
  const referenced = new Set<string>();
  walk(program, {
    enter(node, parent) {
      const n = node as AstNode;
      const p = parent as AstNode | null;
      if (n.type !== 'Identifier' && n.type !== 'JSXIdentifier') {
        return;
      }
      if (dead.some((d) => n.start >= d.start && n.end <= d.end)) {
        return;
      }
      if (isNonReferenceIdentifier(n, p)) {
        return;
      }
      if (p) {
        // Declaration-name positions are bindings, not references.
        if (
          (p.type === 'FunctionDeclaration' ||
            p.type === 'ClassDeclaration' ||
            p.type === 'VariableDeclarator') &&
          (p as unknown as { id?: unknown }).id === n
        ) {
          return;
        }
      }
      referenced.add((n as { name: string }).name);
    },
  });
  return referenced;
}

function isPureInit(init: unknown): boolean {
  if (init == null) {
    return true;
  }
  if (!isRecordNode(init)) {
    return false;
  }
  switch (init.type) {
    case 'Literal':
    case 'Identifier':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return true;
    case 'TemplateLiteral':
      return (init.expressions as unknown[] | undefined)?.length === 0;
    default:
      return false;
  }
}

function isRemovableVarDecl(stmt: Record<string, unknown>, referenced: Set<string>): boolean {
  const decls = stmt.declarations as Array<Record<string, unknown>> | undefined;
  if (!decls || decls.length === 0) {
    return false;
  }
  for (const decl of decls) {
    const id = decl.id as Record<string, unknown> | undefined;
    if (!id || id.type !== 'Identifier') {
      return false;
    }
    if (referenced.has(id.name as string)) {
      return false;
    }
    if (!isPureInit(decl.init)) {
      return false;
    }
  }
  return true;
}

function classHasSideEffects(stmt: Record<string, unknown>): boolean {
  const superClass = stmt.superClass as Record<string, unknown> | undefined | null;
  if (superClass && superClass.type !== 'Identifier') {
    return true;
  }
  const body = stmt.body as Record<string, unknown> | undefined;
  const members = (body?.body as Array<Record<string, unknown>> | undefined) ?? [];
  for (const member of members) {
    if (member.type === 'StaticBlock') {
      return true;
    }
    if (member.type === 'PropertyDefinition' && member.static && !isPureInit(member.value)) {
      return true;
    }
  }
  return false;
}

function isRemovableStatement(stmt: unknown, referenced: Set<string>): stmt is RangedNode {
  if (!isRecordNode(stmt)) {
    return false;
  }
  switch (stmt.type) {
    case 'VariableDeclaration':
      return isRemovableVarDecl(stmt, referenced);
    case 'FunctionDeclaration': {
      const id = stmt.id as Record<string, unknown> | undefined;
      return !!id && !referenced.has(id.name as string);
    }
    case 'ClassDeclaration': {
      const id = stmt.id as Record<string, unknown> | undefined;
      if (!id || referenced.has(id.name as string)) {
        return false;
      }
      return !classHasSideEffects(stmt);
    }
    case 'TryStatement': {
      const block = stmt.block as Record<string, unknown> | undefined;
      const blockEmpty = ((block?.body as unknown[] | undefined) ?? []).length === 0;
      const finalizer = stmt.finalizer as Record<string, unknown> | undefined | null;
      const finalizerEmpty =
        !finalizer || ((finalizer.body as unknown[] | undefined) ?? []).length === 0;
      return blockEmpty && finalizerEmpty;
    }
    default:
      return false;
  }
}

/** Statements that always complete abruptly, so nothing after them in the same block can run. */
function alwaysExits(stmt: Record<string, unknown>): boolean {
  return (
    stmt.type === 'ReturnStatement' ||
    stmt.type === 'ThrowStatement' ||
    stmt.type === 'BreakStatement' ||
    stmt.type === 'ContinueStatement'
  );
}

/** Hoisted bindings stay observable from before the exit, so they survive it. */
function isHoistedDeclaration(stmt: Record<string, unknown>): boolean {
  return (
    stmt.type === 'FunctionDeclaration' ||
    (stmt.type === 'VariableDeclaration' && stmt.kind === 'var')
  );
}

function collectBlockBodies(program: AstProgram): unknown[][] {
  const bodies: unknown[][] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (!isRecordNode(node)) {
      return;
    }
    if ((node.type === 'BlockStatement' || node.type === 'Program') && Array.isArray(node.body)) {
      bodies.push(node.body as unknown[]);
    }
    forEachAstChild(node as AstNode, (child) => visit(child));
  };
  visit(program);
  return bodies;
}

export function applyStatementDCE(
  code: string,
  filename: string,
  preParsedProgram?: AstProgram
): string {
  let program: AstProgram;
  if (preParsedProgram) {
    program = preParsedProgram;
  } else {
    try {
      program = parseWithRawTransfer(filename, code).program;
    } catch {
      return code;
    }
  }

  const bodies = collectBlockBodies(program);
  const dead: RangedNode[] = [];
  const isDead = (stmt: RangedNode): boolean =>
    dead.some((d) => stmt.start >= d.start && stmt.end <= d.end);

  // Fixpoint on the single parse: each pass recounts references while
  // skipping statements already marked dead, so one removal can free another.
  let changed = true;
  while (changed) {
    changed = false;
    const referenced = collectReferencedNames(program, dead);
    for (const body of bodies) {
      let exited = false;
      for (const stmt of body) {
        if (!isRecordNode(stmt) || isDead(stmt)) {
          continue;
        }
        if (exited && !isHoistedDeclaration(stmt)) {
          dead.push(stmt);
          changed = true;
          continue;
        }
        if (isRemovableStatement(stmt, referenced)) {
          dead.push(stmt);
          changed = true;
          continue;
        }
        if (alwaysExits(stmt)) {
          exited = true;
        }
      }
    }
  }

  const referenced = collectReferencedNames(program, dead);
  const preservedInitializers: Array<{ stmt: RangedNode; text: string }> = [];
  for (const body of bodies) {
    for (const stmt of body) {
      if (!isRecordNode(stmt) || stmt.type !== 'VariableDeclaration' || isDead(stmt)) {
        continue;
      }
      const declarations = stmt.declarations as Array<Record<string, unknown>> | undefined;
      if (declarations?.length !== 1) {
        continue;
      }
      const declarator = declarations[0];
      const id = declarator.id as Record<string, unknown> | undefined;
      const init = declarator.init;
      if (id?.type === 'Identifier' && isRecordNode(init) && init.type === 'CallExpression') {
        const callee = init.callee as Record<string, unknown> | undefined;
        const args = init.arguments as Array<Record<string, unknown>> | undefined;
        const arg = args?.[0];
        const param = (callee?.params as Array<Record<string, unknown>> | undefined)?.[0];
        if (
          isRecordNode(callee) &&
          callee.type === 'FunctionExpression' &&
          param?.type === 'Identifier' &&
          param.name === id.name &&
          args?.length === 1 &&
          isRecordNode(arg) &&
          arg.type === 'LogicalExpression' &&
          arg.operator === '||' &&
          (arg.left as Record<string, unknown> | undefined)?.type === 'Identifier' &&
          (arg.left as Record<string, unknown>).name === id.name &&
          (arg.right as Record<string, unknown> | undefined)?.type === 'ObjectExpression' &&
          !collectReferencedNames(program, [...dead, stmt]).has(id.name as string)
        ) {
          const pureComment =
            code.slice(stmt.start, init.start).match(/\/\*\s*[@#]__PURE__\s*\*\/\s*$/)?.[0] ?? '';
          preservedInitializers.push({
            stmt,
            text: `${pureComment}(${code.slice(init.start, callee.end)})${code.slice(callee.end, arg.start)}{}${code.slice(arg.end, init.end)};`,
          });
          continue;
        }
      }
      if (body === program.body) {
        continue;
      }
      if (
        id?.type === 'Identifier' &&
        !referenced.has(id.name as string) &&
        !isPureInit(init) &&
        isRecordNode(init)
      ) {
        const binaryNames =
          init.type === 'BinaryExpression'
            ? extractBinaryOperandIdentifiers(init as unknown as AstNode)
            : [];
        preservedInitializers.push({
          stmt,
          text: `${binaryNames.length ? binaryNames.join(', ') : code.slice(init.start, init.end)};`,
        });
      }
    }
  }

  if (dead.length === 0 && preservedInitializers.length === 0) {
    return code;
  }
  const s = new MagicString(code);
  for (const { stmt, text } of preservedInitializers) {
    s.overwrite(stmt.start, stmt.end, text);
  }
  for (const stmt of dead) {
    let end = stmt.end;
    if (end < code.length && code[end] === '\n') {
      end++;
    }
    s.remove(stmt.start, end);
  }
  return s.toString();
}
