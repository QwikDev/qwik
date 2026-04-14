/**
 * Const literal propagation and inlining utilities.
 *
 * Resolves const literal values from parent bodies, inlines them into
 * capture references, propagates cascading const literals, and removes
 * dead const declarations.
 *
 * Uses a virtual resolution graph: parse ONCE, build a model of all const
 * declarations and identifier references, resolve cascading chains in memory,
 * then apply all edits in a single reverse-sorted pass.
 */

import { parseSync } from 'oxc-parser';
import { forEachAstChild } from '../utils/ast.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../ast-types.js';

// Walker functions traverse arbitrary OXC AST node shapes (including runtime-only
// types like StringLiteral, StaticMemberExpression) not in @oxc-project/types.
// Walker parameters use `any` since the strict Node union doesn't cover these.

export function resolveConstLiterals(parentBody: string, captureNames: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (captureNames.length === 0) return result;

  const wrapperPrefix = 'const __rl__ = ';
  const wrappedSource = wrapperPrefix + parentBody;
  const parseResult = parseSync('__rl__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parseResult.program || parseResult.errors?.length) return result;

  const offset = wrapperPrefix.length;
  const captureSet = new Set(captureNames);

  function walkNode(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type !== 'VariableDeclaration' || node.kind !== 'const') {
      forEachAstChild(node, (child) => walkNode(child));
      return;
    }

    for (const decl of node.declarations ?? []) {
      if (decl.id?.type !== 'Identifier' || !captureSet.has(decl.id.name) || !decl.init) continue;
      const init = decl.init;
      if (!isLiteralNode(init)) continue;
      const literalStart = init.start - offset;
      const literalEnd = init.end - offset;
      if (literalStart >= 0 && literalEnd <= parentBody.length) {
        result.set(decl.id.name, parentBody.slice(literalStart, literalEnd));
      }
    }

    forEachAstChild(node, (child) => walkNode(child));
  }

  walkNode(parseResult.program);
  return result;
}

/**
 * Replace captured identifier references in a body text with their inlined
 * literal values. Uses AST-based replacement to avoid replacing property names.
 */
export function inlineConstCaptures(body: string, constValues: Map<string, string>): string {
  const wrapperPrefix = 'const __ic__ = ';
  const wrappedSource = wrapperPrefix + body;
  const parseResult = parseSync('__ic__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parseResult.program || parseResult.errors?.length) return body;

  const offset = wrapperPrefix.length;
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  function walkNode(node: any, parentKey?: string, parentNode?: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Identifier' && constValues.has(node.name)) {
      const isDeclId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
      const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
      const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;

      if (!isDeclId && !isPropertyKey && !isMemberProp) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          value: constValues.get(node.name)!,
        });
      }
    }

    forEachAstChild(node, (child, key, parent) => {
      walkNode(child, key, parent);
    });
  }

  walkNode(parseResult.program);

  replacements.sort((a, b) => b.start - a.start);
  let result = body;
  for (const r of replacements) {
    result = result.slice(0, r.start) + r.value + result.slice(r.end);
  }
  return result;
}

// ── Virtual resolution graph types ──

interface ConstDecl {
  name: string;
  initText: string;
  initNode: any;
  stmtStart: number;
  stmtEnd: number;
  isLiteral: boolean;
  isSideEffectFree: boolean;
  /** Names of other consts referenced in this decl's init expression */
  initRefersTo: string[];
}

interface IdentRef {
  name: string;
  start: number;
  end: number;
  /** Which const declaration this ref lives inside (null if not inside any) */
  insideDeclOf: string | null;
}

// ── Helpers ──

/** Check if a ref is a "real" reference (not a decl id, property key, or non-computed member prop). */
function isRealRef(parentKey: string | undefined, parentNode: any): boolean {
  if (parentKey === 'id' && parentNode?.type === 'VariableDeclarator') return false;
  if (parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty')) return false;
  if (parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed) return false;
  return true;
}

/**
 * Check if an AST init expression is side-effect-free (safe to inline).
 * Only allows simple member access chains and identifiers.
 */
function isSimpleSideEffectFree(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  switch (node.type) {
    case 'Identifier':
      return !node.name.startsWith('_');
    case 'StringLiteral':
    case 'Literal':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
      return true;
    case 'MemberExpression':
    case 'StaticMemberExpression':
      return isSimpleSideEffectFree(node.object);
    case 'ComputedMemberExpression':
      return isSimpleSideEffectFree(node.object) && isSimpleSideEffectFree(node.property);
    default:
      return false;
  }
}

function isLiteralNode(node: any): boolean {
  return node.type === 'StringLiteral' || node.type === 'Literal' ||
    node.type === 'NumericLiteral' || node.type === 'BooleanLiteral' ||
    node.type === 'NullLiteral';
}

/** Collect all identifier names referenced in a subtree. */
function collectIdentifiers(node: any): string[] {
  const ids: string[] = [];
  function walk(n: any): void {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Identifier') { ids.push(n.name); return; }
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      const val = n[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') walk(item);
          }
        } else if (typeof val.type === 'string') {
          walk(val);
        }
      }
    }
  }
  walk(node);
  return ids;
}

// ── Main: virtual graph propagation ──

/**
 * Inline `const X = <literal>` within a body, propagate cascading const
 * literals, inline single-use side-effect-free non-literals, and remove
 * dead declarations. All in a single parse + single edit pass.
 */
export function propagateConstLiteralsInBody(body: string): string {
  const wrapperPrefix = 'const __pb__ = ';
  const wrappedSource = wrapperPrefix + body;
  const parseResult = parseSync('__pb__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parseResult.program || parseResult.errors?.length) return body;

  const offset = wrapperPrefix.length;

  const constDecls = new Map<string, ConstDecl>();
  const identRefs: IdentRef[] = [];
  const mutableVars = new Set<string>();

  let currentDeclName: string | null = null;

  function walkCollect(node: any, parentKey?: string, parentNode?: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'VariableDeclaration' && (node.kind === 'let' || node.kind === 'var')) {
      for (const decl of node.declarations ?? []) {
        if (decl.id?.type === 'Identifier') mutableVars.add(decl.id.name);
      }
    }

    if (node.type === 'VariableDeclaration' && node.kind === 'const' &&
        node.declarations?.length === 1) {
      const decl = node.declarations[0];
      if (decl.id?.type === 'Identifier' && decl.init) {
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

          const savedDeclName = currentDeclName;
          currentDeclName = decl.id.name;
          forEachAstChild(init, (child, key, parent) => {
            walkCollect(child, key, parent);
          });
          currentDeclName = savedDeclName;
          return;
        }
      }
    }

    if (node.type === 'Identifier' && isRealRef(parentKey, parentNode)) {
      const refStart = node.start - offset;
      const refEnd = node.end - offset;
      if (refStart >= 0 && refEnd <= body.length) {
        identRefs.push({
          name: node.name,
          start: refStart,
          end: refEnd,
          insideDeclOf: currentDeclName,
        });
      }
    }

    forEachAstChild(node, (child, key, parent) => {
      walkCollect(child, key, parent);
    });
  }

  walkCollect(parseResult.program);

  if (constDecls.size === 0) return body;

  // Resolve cascading literal chains: if const B = A and A is a literal const,
  // then B resolves to A's value.
  const resolvedValues = new Map<string, string>();

  function resolveValue(name: string, visited: Set<string>): string | null {
    if (resolvedValues.has(name)) return resolvedValues.get(name)!;
    if (visited.has(name)) return null; // circular
    visited.add(name);

    const decl = constDecls.get(name);
    if (!decl) return null;

    if (decl.isLiteral) {
      resolvedValues.set(name, decl.initText);
      return decl.initText;
    }

    // Check if this is an identifier-only init pointing to another const
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

  // Try to resolve all const decls
  for (const name of constDecls.keys()) {
    resolveValue(name, new Set());
  }

  const toRemove = new Set<string>();

  for (const [name] of resolvedValues) {
    toRemove.add(name);
  }

  // Two-pass: first with literal removals only, then add non-literal removals,
  // because external ref counts depend on which consts are removed.
  function countExternalRefs(removedSet: Set<string>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const ref of identRefs) {
      if (!constDecls.has(ref.name)) continue;
      // Skip refs inside decls that are being removed
      if (ref.insideDeclOf !== null && removedSet.has(ref.insideDeclOf)) continue;
      counts.set(ref.name, (counts.get(ref.name) ?? 0) + 1);
    }
    return counts;
  }

  let externalRefCounts = countExternalRefs(toRemove);

  // Now handle non-literal candidates
  for (const [name, decl] of constDecls) {
    if (resolvedValues.has(name)) continue; // already handled as literal
    if (!decl.isSideEffectFree) continue;
    if (decl.isLiteral) continue; // literals already handled

    // Check that no identifier in the init is a mutable variable
    const referencesMutable = decl.initRefersTo.some(id => mutableVars.has(id));
    if (referencesMutable) continue;

    const refs = externalRefCounts.get(name) ?? 0;
    if (refs <= 1) {
      // Will be removed (and inlined if refs === 1)
      toRemove.add(name);
    }
  }

  // Recount external refs with the full removal set
  externalRefCounts = countExternalRefs(toRemove);

  const toInline = new Map<string, string>();

  for (const [name, value] of resolvedValues) {
    const refs = externalRefCounts.get(name) ?? 0;
    if (refs > 0) {
      toInline.set(name, value);
    }
  }

  // Non-literal single-use consts: resolve any literal refs within init text
  // before inlining (e.g. `FOO[key]` becomes `FOO['A']` when key is literal).
  for (const [name, decl] of constDecls) {
    if (resolvedValues.has(name)) continue;
    if (!toRemove.has(name)) continue;
    const refs = externalRefCounts.get(name) ?? 0;
    if (refs === 1) {
      // Check if the init text references any resolved literal consts
      let initText = decl.initText;
      const refsInInit = identRefs.filter(r => r.insideDeclOf === name && resolvedValues.has(r.name));
      if (refsInInit.length > 0) {
        // Apply literal substitutions within the init text
        // Ref positions are relative to body, but initText starts at decl's init position
        const initOffset = decl.initNode.start - offset;
        const initReplacements = refsInInit
          .map(r => ({
            start: r.start - initOffset,
            end: r.end - initOffset,
            value: resolvedValues.get(r.name)!,
          }))
          .sort((a, b) => b.start - a.start);
        for (const rep of initReplacements) {
          if (rep.start >= 0 && rep.end <= initText.length) {
            initText = initText.slice(0, rep.start) + rep.value + initText.slice(rep.end);
          }
        }
      }
      toInline.set(name, initText);
    }
  }

  if (toInline.size === 0 && toRemove.size === 0) return body;

  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  for (const ref of identRefs) {
    if (!toInline.has(ref.name)) continue;
    if (ref.insideDeclOf !== null && toRemove.has(ref.insideDeclOf)) continue;
    edits.push({
      start: ref.start,
      end: ref.end,
      replacement: toInline.get(ref.name)!,
    });
  }

  for (const name of toRemove) {
    const decl = constDecls.get(name)!;
    let start = decl.stmtStart;
    let end = decl.stmtEnd;
    // Consume trailing semicolon and whitespace/newline
    while (end < body.length && (body[end] === ';' || body[end] === ' ' || body[end] === '\t')) end++;
    if (end < body.length && body[end] === '\n') end++;
    // Consume leading whitespace
    while (start > 0 && (body[start - 1] === ' ' || body[start - 1] === '\t')) start--;
    edits.push({
      start,
      end,
      replacement: '',
    });
  }

  edits.sort((a, b) => b.start - a.start || (b.end - b.start) - (a.end - a.start));

  let result = body;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }

  return result;
}
