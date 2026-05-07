/**
 * Variable migration analysis for the Qwik optimizer.
 *
 * Decides whether module-level declarations should be:
 * - **moved** into a segment (single-use, safe, not exported)
 * - **re-exported** as _auto_VARNAME (shared, exported, side-effects)
 * - **kept** at root (not used by any segment)
 */

import { walk } from 'oxc-walker';
import type { AstMaybeNode, AstNode, AstProgram } from '../ast-types.js';
import {
  addBindingNamesFromPatternToSet,
  collectBindingNamesFromPattern,
} from './utils/binding-pattern.js';

export interface MigrationDecision {
  action: 'move' | 'reexport' | 'keep';
  varName: string;
  targetSegment?: string;
  reason: string;
}

export interface ModuleLevelDecl {
  name: string;
  declStart: number;
  declEnd: number;
  declText: string;
  isExported: boolean;
  hasSideEffects: boolean;
  isPartOfSharedDestructuring: boolean;
  kind: string;
}

/**
 * Conservative purity check: returns true only for expressions that
 * provably have no side effects (literals, functions, simple compositions).
 */
function isInitializerSafe(node: AstMaybeNode): boolean {
  if (!node) return true;

  switch (node.type) {
    case 'Literal':
      return true;

    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return true;

    case 'Identifier':
      // Reading a binding is side-effect-free; matches SWC behavior
      return true;

    case 'TemplateLiteral':
      return (node.expressions ?? []).every((expr) => isInitializerSafe(expr));

    case 'ObjectExpression':
      for (const prop of node.properties ?? []) {
        if (prop.type === 'SpreadElement') return false;
        if (prop.type === 'Property') {
          if (prop.computed) return false;
          if (!isInitializerSafe(prop.value)) return false;
        }
      }
      return true;

    case 'ArrayExpression':
      for (const elem of node.elements ?? []) {
        if (!elem) continue;
        if (elem.type === 'SpreadElement') return false;
        if (!isInitializerSafe(elem)) return false;
      }
      return true;

    case 'UnaryExpression':
      return isInitializerSafe(node.argument);

    case 'BinaryExpression':
    case 'LogicalExpression':
      return isInitializerSafe(node.left) && isInitializerSafe(node.right);

    case 'ConditionalExpression':
      return isInitializerSafe(node.test) && isInitializerSafe(node.consequent) && isInitializerSafe(node.alternate);

    case 'MemberExpression':
      // Could trigger getters, but matches SWC migration behavior
      return !node.computed && isInitializerSafe(node.object);

    case 'MetaProperty':
      return true;

    default:
      return false;
  }
}

/** Add all binding names from a pattern into a Set. */
function addBindingNamesToSet(pattern: AstMaybeNode, target: Set<string>): void {
  addBindingNamesFromPatternToSet(pattern, target);
}

function countBindings(node: AstMaybeNode): number {
  return collectBindingNamesFromPattern(node).length;
}

/**
 * Unwrap export wrappers to get the inner declaration and export status.
 */
function unwrapExport(stmt: AstProgram['body'][number]): { declaration: AstNode; isExported: boolean } {
  if (
    (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') &&
    stmt.declaration
  ) {
    return { declaration: stmt.declaration, isExported: true };
  }
  return { declaration: stmt, isExported: false };
}

export function collectModuleLevelDecls(
  program: AstProgram,
  source: string,
): ModuleLevelDecl[] {
  const decls: ModuleLevelDecl[] = [];

  for (const stmt of program.body ?? []) {
    const { declaration, isExported } = unwrapExport(stmt);
    const declStart = stmt.start;
    const declEnd = stmt.end;
    const declText = source.slice(declStart, declEnd);

    if (declaration.type === 'VariableDeclaration') {
      const kind = declaration.kind;
      for (const declarator of declaration.declarations ?? []) {
        const id = declarator.id;
        if (!id) continue;

        const hasSideEffects = !isInitializerSafe(declarator.init);
        const isDestructuring = id.type === 'ObjectPattern' || id.type === 'ArrayPattern';
        const isShared = isDestructuring && countBindings(id) > 1;

        const names = collectBindingNamesFromPattern(id);

        for (const name of names) {
          decls.push({
            name, declStart, declEnd, declText, isExported, hasSideEffects,
            isPartOfSharedDestructuring: isShared,
            kind,
          });
        }
      }
    } else if (declaration.type === 'FunctionDeclaration') {
      const name = declaration.id?.name;
      if (name) {
        decls.push({
          name, declStart, declEnd, declText, isExported,
          hasSideEffects: false,
          isPartOfSharedDestructuring: false,
          kind: 'function',
        });
      }
    } else if (declaration.type === 'ClassDeclaration') {
      const name = declaration.id?.name;
      if (name) {
        decls.push({
          name, declStart, declEnd, declText, isExported,
          hasSideEffects: false,
          isPartOfSharedDestructuring: false,
          kind: 'class',
        });
      }
    } else if (declaration.type === 'TSEnumDeclaration') {
      const name = declaration.id?.name;
      if (name) {
        decls.push({
          name, declStart, declEnd, declText, isExported,
          hasSideEffects: false,
          isPartOfSharedDestructuring: false,
          kind: 'const', // enums behave like const for migration
        });
      }
    }
  }

  // Second pass: handle `export { name }` specifiers declared separately from their binding
  for (const stmt of program.body ?? []) {
    if (stmt.type === 'ExportNamedDeclaration' && !stmt.declaration && stmt.specifiers) {
      for (const spec of stmt.specifiers) {
        const localName = spec.local?.type === 'Identifier' ? spec.local.name : spec.local?.value;
        if (!localName) continue;
        const decl = decls.find(d => d.name === localName);
        if (decl) decl.isExported = true;
      }
    }
  }

  return decls;
}

/**
 * Extract declared names (params, variable bindings, class/function names,
 * catch params) from a single AST node into the target set.
 */
function addDeclaredNamesFromNode(node: AstNode, target: Set<string>): void {
  const type = node.type;

  if (type === 'ArrowFunctionExpression' && node.params) {
    for (const param of node.params) {
      addBindingNamesToSet(param, target);
    }
  }

  if (type === 'FunctionExpression' || type === 'FunctionDeclaration') {
    if (node.id?.name) target.add(node.id.name);
    for (const param of node.params ?? []) {
      addBindingNamesToSet(param, target);
    }
  }

  if (type === 'VariableDeclaration') {
    for (const decl of node.declarations ?? []) {
      if (decl.id) addBindingNamesToSet(decl.id, target);
    }
  }

  if (type === 'ClassDeclaration' && node.id?.name) {
    target.add(node.id.name);
  }

  if (type === 'CatchClause' && node.param) {
    addBindingNamesToSet(node.param, target);
  }
}

const DECLARATION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
  'VariableDeclaration',
  'ClassDeclaration',
  'CatchClause',
]);

/**
 * Batch version of collectLocalDeclarations: collects locals for all
 * extractions in a single AST walk instead of O(N) separate walks.
 */
function collectAllLocalDeclarations(
  program: AstProgram,
  extractions: Array<{ symbolName: string; argStart: number; argEnd: number }>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const ext of extractions) {
    result.set(ext.symbolName, new Set());
  }

  if (extractions.length === 0) return result;

  walk(program, {
    enter(node: AstNode) {
      if (!DECLARATION_TYPES.has(node.type)) return;

      const nodeStart = node.start;
      const nodeEnd = node.end;

      for (const ext of extractions) {
        if (nodeStart < ext.argStart || nodeEnd > ext.argEnd) continue;
        addDeclaredNamesFromNode(node, result.get(ext.symbolName)!);
      }
    },
  });

  return result;
}

/**
 * Positions of top-level declaration-site identifiers. SWC's
 * `build_main_module_usage_set` skips these so they don't count as root usage.
 */
function collectRootDeclPositions(program: AstProgram): Set<number> {
  const positions = new Set<number>();

  for (const stmt of program.body ?? []) {
    const { declaration } = unwrapExport(stmt);

    if (declaration.type === 'VariableDeclaration') {
      for (const decl of declaration.declarations ?? []) {
        if (decl.id) collectBindingPositions(decl.id, positions);
      }
    } else if (declaration.type === 'FunctionDeclaration' && declaration.id) {
      positions.add(declaration.id.start);
    } else if (declaration.type === 'ClassDeclaration' && declaration.id) {
      positions.add(declaration.id.start);
    }
  }

  return positions;
}

function collectBindingPositions(node: AstMaybeNode, positions: Set<number>): void {
  if (!node) return;

  switch (node.type) {
    case 'Identifier':
      positions.add(node.start);
      break;

    case 'ObjectPattern':
      for (const prop of node.properties ?? []) {
        if (prop.type === 'RestElement') {
          collectBindingPositions(prop.argument, positions);
        } else {
          collectBindingPositions(prop.value, positions);
        }
      }
      break;

    case 'ArrayPattern':
      for (const elem of node.elements ?? []) {
        collectBindingPositions(elem, positions);
      }
      break;

    case 'RestElement':
      collectBindingPositions(node.argument, positions);
      break;

    case 'AssignmentPattern':
      collectBindingPositions(node.left, positions);
      break;

    default:
      break;
  }
}

/**
 * Attribute every identifier reference to either a segment or root scope.
 * Filters out locally-declared names within segments and declaration-site
 * identifiers at root level.
 */
export function computeSegmentUsage(
  program: AstProgram,
  extractions: Array<{ symbolName: string; argStart: number; argEnd: number }>,
): { segmentUsage: Map<string, Set<string>>; rootUsage: Set<string> } {
  const segmentUsage = new Map<string, Set<string>>();
  const rootUsage = new Set<string>();

  for (const ext of extractions) {
    segmentUsage.set(ext.symbolName, new Set());
  }

  const extractionLocals = collectAllLocalDeclarations(program, extractions);
  const rootDeclPositions = collectRootDeclPositions(program);

  walk(program, {
    enter(node: AstNode) {
      // JSXIdentifier matters too: <Component> references module-level bindings
      if (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') return;

      const pos = node.start;
      const name = node.name;

      // When nested extractions overlap (e.g., $() inside component$()),
      // attribute to the innermost (smallest) range.
      let inSegment = false;
      let innermostExt: (typeof extractions)[0] | null = null;
      let smallestSize = Infinity;
      for (const ext of extractions) {
        if (pos >= ext.argStart && pos < ext.argEnd) {
          const size = ext.argEnd - ext.argStart;
          if (size < smallestSize) {
            smallestSize = size;
            innermostExt = ext;
          }
          inSegment = true;
        }
      }

      if (innermostExt) {
        const locals = extractionLocals.get(innermostExt.symbolName)!;
        if (!locals.has(name)) {
          segmentUsage.get(innermostExt.symbolName)!.add(name);
        }
      }

      if (!inSegment && !rootDeclPositions.has(pos)) {
        rootUsage.add(name);
      }
    },
  });

  return { segmentUsage, rootUsage };
}

/**
 * Reasons returned in `MigrationDecision.reason`. Centralised so the same
 * MIG code never appears as a free-floating string in two places.
 */
const MIG_REASON = {
  M01: 'single-use safe variable (MIG-01)',
  M02: 'used by multiple segments (MIG-02)',
  M03: 'exported variable used by segment (MIG-03)',
  M04: 'declaration has side effects (MIG-04)',
  M05: 'part of shared destructuring pattern (MIG-05)',
  M05A: 'all bindings of shared destructure flow to same single segment (MIG-05a)',
  KEEP_EXPORTED: 'exported but not used by any segment',
  KEEP_UNUSED: 'not used by any segment',
  REEXPORT_DUAL_USE: 'used by both root code and segment(s)',
} as const;

/** Names of the segments that reference `name`. */
function usingSegmentsOf(name: string, segmentUsage: Map<string, Set<string>>): string[] {
  const result: string[] = [];
  for (const [segName, usedNames] of segmentUsage) {
    if (usedNames.has(name)) result.push(segName);
  }
  return result;
}

/**
 * Decision tree for each module-level declaration (order matters):
 * 1. exported + used by segment -> reexport
 * 2. exported + unused by segments -> keep
 * 3. used by root + segment -> reexport
 * 4. used by multiple segments -> reexport
 * 5. has side effects -> reexport
 * 6. shared destructuring -> reexport
 * 7. used by exactly one segment -> move
 * 8. unused by any segment -> keep
 *
 * Post-pass MIG-05a: when every binding in a shared-destructure declaration
 * is `reexport`-ed solely because of MIG-05 *and* they all flow to the same
 * single segment with no root/multi-segment/export/side-effect interference,
 * the whole destructure can be moved together into that segment instead.
 */
export function analyzeMigration(
  decls: ModuleLevelDecl[],
  segmentUsage: Map<string, Set<string>>,
  rootUsage: Set<string>,
): MigrationDecision[] {
  const decisions = decls.map(decl => decideMigration(decl, segmentUsage, rootUsage));
  promoteSharedDestructureGroups(decls, decisions, segmentUsage, rootUsage);
  return decisions;
}

function decideMigration(
  decl: ModuleLevelDecl,
  segmentUsage: Map<string, Set<string>>,
  rootUsage: Set<string>,
): MigrationDecision {
  const usingSegments = usingSegmentsOf(decl.name, segmentUsage);
  const usedByAnySegment = usingSegments.length > 0;
  const usedByRoot = rootUsage.has(decl.name);

  if (decl.isExported && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.M03 };
  }
  if (decl.isExported) {
    return { action: 'keep', varName: decl.name, reason: MIG_REASON.KEEP_EXPORTED };
  }
  if (usedByRoot && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.REEXPORT_DUAL_USE };
  }
  if (usingSegments.length > 1) {
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.M02 };
  }
  if (decl.hasSideEffects && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.M04 };
  }
  if (decl.isPartOfSharedDestructuring && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.M05 };
  }
  if (usingSegments.length === 1) {
    return { action: 'move', varName: decl.name, targetSegment: usingSegments[0], reason: MIG_REASON.M01 };
  }
  return { action: 'keep', varName: decl.name, reason: MIG_REASON.KEEP_UNUSED };
}

/**
 * MIG-05a post-pass. When every binding in a shared-destructure declaration
 * flows to the same single segment with no root/multi-segment/export/
 * side-effect interference, promote them all from `reexport` to `move`
 * targeting that segment. Mutates `decisions` in place; no-op when the
 * preconditions don't hold.
 *
 * Preconditions per binding:
 * - not exported, no side effects, not used by root code
 * - used by exactly one segment
 * - all sibling bindings target the same segment
 *
 * Single-binding "shared" decls only appear in synthetic test data — real
 * shared destructures always have >=2 sibling bindings.
 */
function promoteSharedDestructureGroups(
  decls: ModuleLevelDecl[],
  decisions: MigrationDecision[],
  segmentUsage: Map<string, Set<string>>,
  rootUsage: Set<string>,
): void {
  const groupsByDeclSpan = new Map<string, number[]>();
  for (let i = 0; i < decls.length; i++) {
    if (!decls[i].isPartOfSharedDestructuring) continue;
    const key = `${decls[i].declStart}:${decls[i].declEnd}`;
    let group = groupsByDeclSpan.get(key);
    if (!group) { group = []; groupsByDeclSpan.set(key, group); }
    group.push(i);
  }

  for (const indices of groupsByDeclSpan.values()) {
    if (indices.length < 2) continue;
    const target = unifiedSingleSegmentTarget(indices, decls, segmentUsage, rootUsage);
    if (!target) continue;

    for (const i of indices) {
      decisions[i] = {
        action: 'move',
        varName: decls[i].name,
        targetSegment: target,
        reason: MIG_REASON.M05A,
      };
    }
  }
}

/**
 * Returns the single segment all siblings flow to, or null if any sibling
 * fails the MIG-05a preconditions.
 */
function unifiedSingleSegmentTarget(
  indices: number[],
  decls: ModuleLevelDecl[],
  segmentUsage: Map<string, Set<string>>,
  rootUsage: Set<string>,
): string | null {
  let target: string | null = null;

  for (const i of indices) {
    const d = decls[i];
    if (d.isExported || d.hasSideEffects || rootUsage.has(d.name)) return null;

    const using = usingSegmentsOf(d.name, segmentUsage);
    if (using.length !== 1) return null;

    if (target === null) target = using[0];
    else if (target !== using[0]) return null;
  }

  return target;
}
