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
function isInitializerSafe(node: AstNode | null | undefined): boolean {
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
 * Collect all locally-declared names within a given AST range.
 * These shadow outer-scope names and should not count as segment dependencies.
 */
export function collectLocalDeclarations(program: AstProgram, start: number, end: number): Set<string> {
  const locals = new Set<string>();

  walk(program, {
    enter(node: AstNode) {
      if (node.start < start || node.end > end) return;
      addDeclaredNamesFromNode(node, locals);
    },
  });

  return locals;
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
export function collectAllLocalDeclarations(
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
 * Decision tree for each module-level declaration (order matters):
 * 1. exported + used by segment -> reexport
 * 2. exported + unused by segments -> keep
 * 3. used by root + segment -> reexport
 * 4. used by multiple segments -> reexport
 * 5. has side effects -> reexport
 * 6. shared destructuring -> reexport
 * 7. used by exactly one segment -> move
 * 8. unused by any segment -> keep
 */
export function analyzeMigration(
  decls: ModuleLevelDecl[],
  segmentUsage: Map<string, Set<string>>,
  rootUsage: Set<string>,
): MigrationDecision[] {
  return decls.map(decl => decideMigration(decl, segmentUsage, rootUsage));
}

function decideMigration(
  decl: ModuleLevelDecl,
  segmentUsage: Map<string, Set<string>>,
  rootUsage: Set<string>,
): MigrationDecision {
  const usingSegments: string[] = [];
  for (const [segName, usedNames] of segmentUsage) {
    if (usedNames.has(decl.name)) usingSegments.push(segName);
  }

  const usedByAnySegment = usingSegments.length > 0;
  const usedByRoot = rootUsage.has(decl.name);

  if (decl.isExported && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: 'exported variable used by segment (MIG-03)' };
  }
  if (decl.isExported) {
    return { action: 'keep', varName: decl.name, reason: 'exported but not used by any segment' };
  }
  if (usedByRoot && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: 'used by both root code and segment(s)' };
  }
  if (usingSegments.length > 1) {
    return { action: 'reexport', varName: decl.name, reason: 'used by multiple segments (MIG-02)' };
  }
  if (decl.hasSideEffects && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: 'declaration has side effects (MIG-04)' };
  }
  if (decl.isPartOfSharedDestructuring && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: 'part of shared destructuring pattern (MIG-05)' };
  }
  if (usingSegments.length === 1) {
    return { action: 'move', varName: decl.name, targetSegment: usingSegments[0], reason: 'single-use safe variable (MIG-01)' };
  }
  return { action: 'keep', varName: decl.name, reason: 'not used by any segment' };
}
