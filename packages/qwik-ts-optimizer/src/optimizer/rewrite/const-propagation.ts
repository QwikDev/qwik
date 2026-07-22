/**
 * Const literal propagation and inlining utilities.
 */

import { forEachAstChild } from '../ast/guards.js';
import { applyReplacements, isReplaceableIdentifierPosition } from '../edit/range-replace.js';
import { isShorthandPropertyValue } from '../prepare/flatten-destructures.js';
import { createTransformSession } from '../edit/transform-session.js';
import {
  type AstCompatNode,
  type AstFunction,
  type AstNode,
  type Expression,
  type VariableDeclarator,
} from '../../ast-types.js';

function collectConstLiteralValues(
  root: AstNode | null | undefined,
  source: string,
  offset: number,
  captureSet: Set<string>,
  result: Map<string, string>,
): void {
  function walkNode(node: AstNode | null | undefined): void {
    if (!node) return;

    if (node.type !== 'VariableDeclaration' || node.kind !== 'const') {
      forEachAstChild(node, (child) => walkNode(child));
      return;
    }

    for (const decl of node.declarations) {
      if (decl.id.type !== 'Identifier' || !captureSet.has(decl.id.name) || !decl.init) continue;
      const init = decl.init;
      if (!isLiteralNode(init)) continue;
      const literalStart = init.start - offset;
      const literalEnd = init.end - offset;
      if (literalStart >= 0 && literalEnd <= source.length) {
        result.set(decl.id.name, source.slice(literalStart, literalEnd));
      }
    }

    forEachAstChild(node, (child) => walkNode(child));
  }

  walkNode(root);
}

export function resolveConstLiterals(parentBody: string, captureNames: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (captureNames.length === 0) return result;

  const session = createTransformSession(parentBody);
  if (!session) return result;

  collectConstLiteralValues(
    session.program,
    parentBody,
    session.offset,
    new Set(captureNames),
    result,
  );
  return result;
}

/**
 * Walks an already-parsed closure node directly. `init.start`/`init.end` on
 * each node are source-absolute offsets into `source`, not body-relative.
 */
export function resolveConstLiteralsInClosure(
  closureNode: AstFunction,
  source: string,
  captureNames: string[],
): Map<string, string> {
  const result = new Map<string, string>();
  if (captureNames.length === 0) return result;
  if (!closureNode.body) return result;

  collectConstLiteralValues(closureNode.body, source, 0, new Set(captureNames), result);
  return result;
}

/**
 * AST-based (not textual) so property names sharing a captured identifier's
 * name are not replaced.
 */
export function inlineConstCaptures(body: string, constValues: Map<string, string>): string {
  const session = createTransformSession(body);
  if (!session) return body;

  const offset = session.offset;
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  function walkNode(node: AstNode | null | undefined, parentKey?: string, parentNode?: AstNode): void {
    if (!node) return;

    if (node.type === 'Identifier' && constValues.has(node.name)) {
      if (isReplaceableIdentifierPosition(parentKey, parentNode)) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          replacement: constValues.get(node.name)!,
        });
      }
    }

    forEachAstChild(node, (child, key, parent) => {
      walkNode(child, key, parent);
    });
  }

  walkNode(session.program);

  return applyReplacements(body, replacements);
}

interface ConstDecl {
  name: string;
  initText: string;
  initNode: Expression;
  stmtStart: number;
  stmtEnd: number;
  isLiteral: boolean;
  isSideEffectFree: boolean;
  initRefersTo: string[];
}

interface IdentRef {
  name: string;
  start: number;
  end: number;
  insideDeclOf: string | null;
  shorthandKey: string | null;
}

function isSimpleSideEffectFree(node: AstNode | null | undefined): boolean {
  if (!node) return false;
  switch (node.type) {
    case 'Identifier':
      return !node.name.startsWith('_');
    case 'Literal':
      return true;
    case 'MemberExpression':
      return isSimpleSideEffectFree(node.object);
    default:
      return false;
  }
}

function isLiteralNode(node: AstNode): boolean {
  return node.type === 'Literal';
}

function collectIdentifiers(node: AstNode): string[] {
  const ids: string[] = [];
  function walk(n: AstNode | null | undefined): void {
    if (!n) return;
    if (n.type === 'Identifier') { ids.push(n.name); return; }
    forEachAstChild(n, (child) => walk(child));
  }
  walk(node);
  return ids;
}

function memberRootName(member: AstNode): string | null {
  let obj: AstNode | null | undefined = member.type === 'MemberExpression' ? member.object : member;
  while (obj?.type === 'MemberExpression') obj = obj.object;
  return obj?.type === 'Identifier' ? obj.name : null;
}

/**
 * Inlining a member read of a mutated object is unsound: `const i = ctx.n`
 * before `ctx.n++` must not fold into `return ctx.n` after it.
 */
function readsMutatedObject(node: AstNode, mutatedObjects: ReadonlySet<string>): boolean {
  if (mutatedObjects.size === 0) return false;
  let found = false;
  function walk(n: AstNode | null | undefined): void {
    if (!n || found) return;
    if (n.type === 'MemberExpression') {
      const root = memberRootName(n);
      if (root && mutatedObjects.has(root)) { found = true; return; }
    }
    forEachAstChild(n, (child) => walk(child));
  }
  walk(node);
  return found;
}

export function propagateConstLiteralsInBody(body: string): string {
  const session = createTransformSession(body);
  if (!session) return body;

  const offset = session.offset;

  const constDecls = new Map<string, ConstDecl>();
  const identRefs: IdentRef[] = [];
  const mutableVars = new Set<string>();
  const mutatedObjects = new Set<string>();

  let currentDeclName: string | null = null;

  function walkCollect(node: AstNode | null | undefined, parentKey?: string, parentNode?: AstNode): void {
    if (!node) return;

    if (node.type === 'VariableDeclaration' && (node.kind === 'let' || node.kind === 'var')) {
      for (const decl of node.declarations) {
        if (decl.id.type === 'Identifier') mutableVars.add(decl.id.name);
      }
    }

    if (node.type === 'UpdateExpression' && node.argument?.type === 'MemberExpression') {
      const root = memberRootName(node.argument);
      if (root) mutatedObjects.add(root);
    }
    if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression') {
      const root = memberRootName(node.left);
      if (root) mutatedObjects.add(root);
    }

    if (node.type === 'VariableDeclaration' && node.kind === 'const' &&
        node.declarations.length === 1) {
      const decl = node.declarations[0];
      if (decl.id.type === 'Identifier' && decl.init) {
        const init = decl.init;
        const initStart = init.start - offset;
        const initEnd = init.end - offset;
        const stmtStart = node.start - offset;
        const stmtEnd = node.end - offset;

        if (initStart >= 0 && initEnd <= body.length && stmtStart >= 0) {
          constDecls.set(decl.id.name, {
            name: decl.id.name,
            initText: body.slice(initStart, initEnd),
            initNode: init,
            stmtStart,
            stmtEnd,
            isLiteral: isLiteralNode(init),
            isSideEffectFree: isSimpleSideEffectFree(init),
            initRefersTo: collectIdentifiers(init),
          });

          collectReferencesInInitializer(init, decl, decl.id.name);
          return;
        }
      }
    }

    if (node.type === 'Identifier' && isReplaceableIdentifierPosition(parentKey, parentNode)) {
      const refStart = node.start - offset;
      const refEnd = node.end - offset;
      if (refStart >= 0 && refEnd <= body.length) {
        identRefs.push({
          name: node.name,
          start: refStart,
          end: refEnd,
          insideDeclOf: currentDeclName,
          shorthandKey: isShorthandPropertyValue(node, parentNode ?? null) ? node.name : null,
        });
      }
    }

    forEachAstChild(node, (child, key, parent) => {
      walkCollect(child, key, parent);
    });
  }

  function collectReferencesInInitializer(init: AstNode, declNode: AstNode, declName: string): void {
    const savedDeclName = currentDeclName;
    currentDeclName = declName;
    walkCollect(init, 'init', declNode);
    currentDeclName = savedDeclName;
  }

  walkCollect(session.program);

  if (constDecls.size === 0) return body;

  const resolvedValues = new Map<string, string>();

  function resolveValue(name: string, visited: Set<string>): string | null {
    if (resolvedValues.has(name)) return resolvedValues.get(name)!;
    if (visited.has(name)) return null;
    visited.add(name);

    const decl = constDecls.get(name);
    if (!decl) return null;

    if (decl.isLiteral) {
      resolvedValues.set(name, decl.initText);
      return decl.initText;
    }

    if (decl.initNode?.type === 'Identifier' && decl.initRefersTo.length === 1) {
      const target = decl.initRefersTo[0];
      const resolved = resolveValue(target, visited);
      if (resolved !== null) {
        resolvedValues.set(name, resolved);
        return resolved;
      }
    }

    return null;
  }

  for (const name of constDecls.keys()) {
    resolveValue(name, new Set());
  }

  const toRemove = new Set<string>();

  for (const [name] of resolvedValues) {
    toRemove.add(name);
  }

  // External ref counts depend on which consts are removed, so count in two passes.
  function countExternalRefs(removedSet: Set<string>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const ref of identRefs) {
      if (!constDecls.has(ref.name)) continue;
      if (ref.insideDeclOf !== null && removedSet.has(ref.insideDeclOf)) continue;
      counts.set(ref.name, (counts.get(ref.name) ?? 0) + 1);
    }
    return counts;
  }

  let externalRefCounts = countExternalRefs(toRemove);

  for (const [name, decl] of constDecls) {
    if (resolvedValues.has(name)) continue;
    if (!decl.isSideEffectFree) continue;
    if (decl.isLiteral) continue;

    const referencesMutable = decl.initRefersTo.some(id => mutableVars.has(id));
    if (referencesMutable) continue;

    if (readsMutatedObject(decl.initNode, mutatedObjects)) continue;

    const refs = externalRefCounts.get(name) ?? 0;
    if (refs <= 1) {
      toRemove.add(name);
    }
  }

  externalRefCounts = countExternalRefs(toRemove);

  const toInline = new Map<string, string>();

  for (const [name, value] of resolvedValues) {
    const refs = externalRefCounts.get(name) ?? 0;
    if (refs > 0) {
      toInline.set(name, value);
    }
  }

  for (const [name, decl] of constDecls) {
    if (resolvedValues.has(name)) continue;
    if (!toRemove.has(name)) continue;
    const refs = externalRefCounts.get(name) ?? 0;
    if (refs === 1) {
      let initText = decl.initText;
      const refsInInit = identRefs.filter(r => r.insideDeclOf === name && resolvedValues.has(r.name));
      if (refsInInit.length > 0) {
        // Ref positions are body-relative; initText starts at the decl's init position.
        const initOffset = decl.initNode.start - offset;
        const initReplacements = refsInInit
          .map(r => ({
            start: r.start - initOffset,
            end: r.end - initOffset,
            replacement: resolvedValues.get(r.name)!,
          }))
          .filter(rep => rep.start >= 0 && rep.end <= initText.length);
        initText = applyReplacements(initText, initReplacements);
      }
      toInline.set(name, initText);
    }
  }

  if (toInline.size === 0 && toRemove.size === 0) return body;

  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  for (const ref of identRefs) {
    if (!toInline.has(ref.name)) continue;
    if (ref.insideDeclOf !== null && toRemove.has(ref.insideDeclOf)) continue;
    const value = toInline.get(ref.name)!;
    // Re-emit the key when inlining into a shorthand `{ x }`, else the object is invalid.
    const replacement = ref.shorthandKey !== null ? `${ref.shorthandKey}: ${value}` : value;
    edits.push({
      start: ref.start,
      end: ref.end,
      replacement,
    });
  }

  for (const name of toRemove) {
    const decl = constDecls.get(name)!;
    let start = decl.stmtStart;
    let end = decl.stmtEnd;
    while (end < body.length && (body[end] === ';' || body[end] === ' ' || body[end] === '\t')) end++;
    if (end < body.length && body[end] === '\n') end++;
    while (start > 0 && (body[start - 1] === ' ' || body[start - 1] === '\t')) start--;
    edits.push({
      start,
      end,
      replacement: '',
    });
  }

  return applyReplacements(body, edits);
}
