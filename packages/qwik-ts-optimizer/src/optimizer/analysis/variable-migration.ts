/**
 * Variable migration analysis for the Qwik optimizer.
 *
 * Decides whether module-level declarations should be:
 * - **moved** into a segment (single-use, safe, not exported)
 * - **re-exported** as _auto_VARNAME (shared, exported, side-effects)
 * - **kept** at root (not used by any segment)
 */

import { walk } from 'oxc-walker';
import type { AstMaybeNode, AstNode, AstProgram } from '../../ast-types.js';
import {
  addBindingNamesFromPatternToSet,
  collectBindingNamesFromPattern,
  type BindingPatternLike,
} from '../ast/binding-pattern.js';

export interface MigrationDecision {
  readonly action: 'move' | 'reexport' | 'keep';
  readonly varName: string;
  readonly targetSegment?: string;
  readonly reason: string;
}

export interface ModuleLevelDecl {
  readonly name: string;
  readonly declStart: number;
  readonly declEnd: number;
  readonly declText: string;
  // `isExported` is set conservatively to `false` during the initial decl
  // walk, then flipped to `true` in a follow-up pass that scans
  // `ExportNamedDeclaration` re-export specifiers at module scope
  // (`variable-migration.ts:216`). Left mutable for that two-pass shape.
  isExported: boolean;
  readonly hasSideEffects: boolean;
  readonly isPartOfSharedDestructuring: boolean;
  readonly kind: string;
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

    case 'CallExpression': {
      // Marker calls (`component$`, `useTask$`, `sync$`, etc., or the bare `$`)
      // are pure from the migration policy's perspective: the parent rewrite
      // replaces them with `componentQrl(qrl(...))` or equivalent, which
      // doesn't observably mutate. Treating them as safe lets MIG-01 fire for
      // single-segment marker decls (e.g. mutual-recursion components) instead
      // of getting trapped in MIG-04.
      //
      // Detection mirrors the structural rule in `marker-detection.ts`:
      // any callee whose source-level identifier name ends in `$`. Renamed
      // marker imports (`import { component$ as cmp }`) would not match and
      // remain conservatively side-effecty — that's fine, since the
      // misclassification only loses a `move` optimization (reexport is still
      // correct output).
      if (node.callee?.type === 'Identifier') {
        const name = node.callee.name;
        if (name === '$' || name.endsWith('$')) return true;
      }
      return false;
    }

    default:
      return false;
  }
}

/** Add all binding names from a pattern into a Set. */
function addBindingNamesToSet(
  pattern: BindingPatternLike | null | undefined,
  target: Set<string>,
): void {
  addBindingNamesFromPatternToSet(pattern, target);
}

function countBindings(node: BindingPatternLike | null | undefined): number {
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
 * catch params) from a single AST node into the target set. Shared with the
 * canonical gather walk's segment-usage projection (`module-gather-walk.ts`).
 */
export function addDeclaredNamesFromNode(node: AstNode, target: Set<string>): void {
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

export const DECLARATION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
  'VariableDeclaration',
  'ClassDeclaration',
  'CatchClause',
]);

/**
 * True when an Identifier node is not a binding reference: a non-computed
 * member property (`obj.x`), a non-shorthand non-computed object-property
 * key (`{ x: v }`), or a non-computed class-member key. SWC's usage
 * collector is reference-semantic and never counts these; counting them
 * fabricates phantom usage for any module-level decl whose name collides
 * with a property name (e.g. a root `startViewTransition` helper vs
 * `document.startViewTransition`), which wrongly demotes a single-segment
 * MOVE to a dual-use REEXPORT. Shared with the canonical gather walk's
 * segment-usage projection.
 */
export function isNonReferenceIdentifier(
  node: AstNode,
  parent: AstNode | null | undefined,
): boolean {
  if (!parent) return false;
  if (parent.type === 'MemberExpression') {
    return !parent.computed && parent.property === node;
  }
  if (parent.type === 'Property') {
    return !parent.computed && !parent.shorthand && parent.key === node;
  }
  if (parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') {
    return !parent.computed && parent.key === node;
  }
  return false;
}

/**
 * Positions of top-level declaration-site identifiers. SWC's
 * `build_main_module_usage_set` skips these so they don't count as root usage.
 * Shared with the canonical gather walk's segment-usage projection.
 */
export function collectRootDeclPositions(program: AstProgram): Set<number> {
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

function collectBindingPositions(
  node: BindingPatternLike | null | undefined,
  positions: Set<number>,
): void {
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

    case 'TSParameterProperty':
      collectBindingPositions(node.parameter, positions);
      break;

    default: {
      const _exhaustive: never = node;
      throw new Error(`unhandled binding-pattern node: ${(_exhaustive as { type?: string }).type}`);
    }
  }
}

/**
 * Attribute every identifier reference to either a segment or root scope.
 * Filters out locally-declared names within segments and declaration-site
 * identifiers at root level.
 *
 * Implementation note: a previous design ran two `walk(program, ...)` passes
 * back-to-back (first to collect per-extraction locals, then to classify
 * identifiers). The two are merged into a single walk here, but identifier
 * classification cannot happen inline during `enter`: in DFS order an
 * identifier reference can be visited *before* its hoisted declaration
 * (e.g. `function f() { g(); function g() {} }` — the `g` Identifier is
 * entered before the `function g` FunctionDeclaration). To keep semantic
 * equivalence with the two-pass version, identifier visits are buffered
 * during the walk and classified in a post-walk linear pass once the
 * locals map is fully populated.
 *
 * Production routes through the canonical gather walk's segment-usage
 * projection (`module-gather-walk.ts`); this standalone form is retained
 * as the differential oracle for that projection.
 */
export function computeSegmentUsage(
  program: AstProgram,
  extractions: Array<{ symbolName: string; argStart: number; argEnd: number }>,
): { segmentUsage: Map<string, Set<string>>; rootUsage: Set<string> } {
  const segmentUsage = new Map<string, Set<string>>();
  const rootUsage = new Set<string>();
  const extractionLocals = new Map<string, Set<string>>();

  for (const ext of extractions) {
    segmentUsage.set(ext.symbolName, new Set());
    extractionLocals.set(ext.symbolName, new Set());
  }

  const rootDeclPositions = collectRootDeclPositions(program);
  const identifierVisits: Array<{ pos: number; name: string }> = [];

  walk(program, {
    enter(node: AstNode, parent) {
      if (DECLARATION_TYPES.has(node.type) && extractions.length > 0) {
        const nodeStart = node.start;
        const nodeEnd = node.end;
        for (const ext of extractions) {
          if (nodeStart < ext.argStart || nodeEnd > ext.argEnd) continue;
          addDeclaredNamesFromNode(node, extractionLocals.get(ext.symbolName)!);
        }
      }
      // JSXIdentifier matters too: <Component> references module-level bindings
      if (
        (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
        !isNonReferenceIdentifier(node, parent as AstNode | null)
      ) {
        identifierVisits.push({ pos: node.start, name: node.name });
      }
    },
  });

  for (const { pos, name } of identifierVisits) {
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
  }

  return { segmentUsage, rootUsage };
}

/**
 * Reasons returned in `MigrationDecision.reason`. Centralised so the same
 * MIG code never appears as a free-floating string in two places. Keys
 * follow `<ACTION>_<DISCRIMINATOR>` so the action taken is visible at the
 * call site; reason strings keep the `(MIG-XX)` suffix as a grep target
 * back to the Rust SWC reference.
 */
const MIG_REASON = {
  MOVE_SINGLE_SEGMENT: 'single-use safe variable (MIG-01)',
  MOVE_SHARED_DESTRUCTURE_UNIFIED: 'all bindings of shared destructure flow to same single segment (MIG-05a)',
  REEXPORT_EXPORTED: 'exported variable used by segment (MIG-03)',
  REEXPORT_DUAL_USE: 'used by both root code and segment(s)',
  REEXPORT_MULTI_SEGMENT: 'used by multiple segments (MIG-02)',
  REEXPORT_SIDE_EFFECTS: 'declaration has side effects (MIG-04)',
  REEXPORT_SHARED_DESTRUCTURE: 'part of shared destructuring pattern (MIG-05)',
  REEXPORT_MOVED_DECL_DEP: 'still referenced by a declaration migrating into a segment (MIG-06)',
  KEEP_EXPORTED: 'exported but not used by any segment',
  KEEP_UNUSED: 'not used by any segment',
} as const;

/**
 * Identifier names referenced within a module-level declaration's byte
 * range. Walks only the decl's enclosing top-level statement; the range
 * filter stays because the decl range can be narrower than the statement
 * (one declarator of a multi-declarator declaration).
 *
 * `referencesOnly` skips property-position identifiers (`obj.x`,
 * `{ x: v }` keys) via {@link isNonReferenceIdentifier} — use it when the
 * result feeds binding-level decisions. The default (false) preserves the
 * historical name-harvest semantics `wireMigration` relies on for import
 * wiring.
 */
export function collectDeclIdentifiers(
  program: AstProgram,
  decl: Pick<ModuleLevelDecl, 'declStart' | 'declEnd'>,
  referencesOnly = false,
): Set<string> {
  const names = new Set<string>();
  const enclosingStmt = (program.body ?? []).find(
    (stmt) => stmt.start <= decl.declStart && stmt.end >= decl.declEnd,
  );
  walk(enclosingStmt ?? program, {
    enter(node: AstNode, parent) {
      if (
        node.type === 'Identifier' &&
        node.start >= decl.declStart &&
        node.end <= decl.declEnd &&
        !(referencesOnly && isNonReferenceIdentifier(node, parent as AstNode | null))
      ) {
        names.add(node.name);
      }
    },
  });
  return names;
}

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
 *
 * Post-pass MIG-06: a `move`d declaration's body can still reference other
 * module-level declarations after it leaves the parent. Any such dependency
 * that would otherwise stay un-exported (`keep`) — or would move to a
 * *different* segment — flips to `reexport` so the migrated body can import
 * it from the parent. Mirrors SWC's `precompute_and_declare_auto_exports`
 * plus the `used_by_incompatible_root` arm of its migratable-vars safety
 * filter.
 */
export function analyzeMigration(
  decls: ModuleLevelDecl[],
  segmentUsage: Map<string, Set<string>>,
  rootUsage: Set<string>,
  program?: AstProgram,
): MigrationDecision[] {
  const decisions = decls.map(decl => decideMigration(decl, segmentUsage, rootUsage));
  promoteSharedDestructureGroups(decls, decisions, segmentUsage, rootUsage);
  if (program) reexportMovedDeclDependencies(decls, decisions, program);
  return decisions;
}

/**
 * MIG-06 post-pass — see {@link analyzeMigration}. Mutates `decisions` in
 * place, in two stages mirroring SWC's order (safety filter to fixpoint,
 * then auto-export declaration):
 *
 * 1. Demote to fixpoint: a `move` whose decl is referenced by another
 *    `move` targeting a *different* segment cannot leave the parent —
 *    demote it to `reexport`. Iterated because each demotion can strand a
 *    previously-compatible mover.
 * 2. Flip orphaned keeps: any `keep` dependency of a surviving `move` flips
 *    to `reexport` so the migrated body can import it from the parent.
 */
function reexportMovedDeclDependencies(
  decls: ModuleLevelDecl[],
  decisions: MigrationDecision[],
  program: AstProgram,
): void {
  const indexByName = new Map<string, number>();
  for (let i = 0; i < decls.length; i++) indexByName.set(decls[i].name, i);

  const depsOfMover = new Map<number, Set<string>>();
  const moverDeps = (i: number): Set<string> => {
    let deps = depsOfMover.get(i);
    if (!deps) {
      deps = collectDeclIdentifiers(program, decls[i], true);
      depsOfMover.set(i, deps);
    }
    return deps;
  };

  const flipToReexport = (depIdx: number): void => {
    decisions[depIdx] = {
      action: 'reexport',
      varName: decls[depIdx].name,
      reason: MIG_REASON.REEXPORT_MOVED_DECL_DEP,
    };
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      if (decision.action !== 'move') continue;
      for (const dep of moverDeps(i)) {
        if (dep === decision.varName) continue;
        const depIdx = indexByName.get(dep);
        if (depIdx === undefined || decls[depIdx].isExported) continue;
        const depDecision = decisions[depIdx];
        if (
          depDecision.action === 'move' &&
          depDecision.targetSegment !== decision.targetSegment
        ) {
          flipToReexport(depIdx);
          changed = true;
        }
      }
    }
  }

  for (let i = 0; i < decisions.length; i++) {
    const decision = decisions[i];
    if (decision.action !== 'move') continue;
    for (const dep of moverDeps(i)) {
      if (dep === decision.varName) continue;
      const depIdx = indexByName.get(dep);
      if (depIdx === undefined || decls[depIdx].isExported) continue;
      if (decisions[depIdx].action === 'keep') flipToReexport(depIdx);
    }
  }
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
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.REEXPORT_EXPORTED };
  }
  if (decl.isExported) {
    return { action: 'keep', varName: decl.name, reason: MIG_REASON.KEEP_EXPORTED };
  }
  if (usedByRoot && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.REEXPORT_DUAL_USE };
  }
  if (usingSegments.length > 1) {
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.REEXPORT_MULTI_SEGMENT };
  }
  if (decl.hasSideEffects && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.REEXPORT_SIDE_EFFECTS };
  }
  if (decl.isPartOfSharedDestructuring && usedByAnySegment) {
    return { action: 'reexport', varName: decl.name, reason: MIG_REASON.REEXPORT_SHARED_DESTRUCTURE };
  }
  if (usingSegments.length === 1) {
    return { action: 'move', varName: decl.name, targetSegment: usingSegments[0], reason: MIG_REASON.MOVE_SINGLE_SEGMENT };
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
        reason: MIG_REASON.MOVE_SHARED_DESTRUCTURE_UNIFIED,
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
