/**
 * Variable migration analysis module for the Qwik optimizer.
 *
 * Decides whether module-level declarations should be:
 * - **moved** into a segment (single-use, safe, not exported)
 * - **re-exported** as _auto_VARNAME (shared, exported, side-effects)
 * - **kept** at root (not used by any segment)
 *
 * This feeds into Plan 03 where the decisions are applied to codegen.
 *
 * Implements: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05
 */

import { walk } from 'oxc-walker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationDecision {
  action: 'move' | 'reexport' | 'keep';
  varName: string;
  targetSegment?: string; // symbolName of the segment (only for 'move')
  reason: string;
}

export interface ModuleLevelDecl {
  name: string;
  /** Start position of the full declaration statement in source */
  declStart: number;
  /** End position of the full declaration statement in source */
  declEnd: number;
  /** The declaration text (e.g., `const helperFn = (msg) => console.log(msg)`) */
  declText: string;
  /** Whether the declaration has `export` keyword */
  isExported: boolean;
  /** Whether the initializer may have side effects */
  hasSideEffects: boolean;
  /** Whether this name comes from a destructuring pattern with other bindings */
  isPartOfSharedDestructuring: boolean;
  /** The kind of declaration: var, let, const, function, class */
  kind: string;
}

// ---------------------------------------------------------------------------
// Side-effect detection
// ---------------------------------------------------------------------------

/**
 * Determine if an initializer expression is safe (no side effects).
 *
 * Conservative: only literals, arrow/function expressions, and
 * object/array literals with all-safe values are considered safe.
 * Everything else is treated as potentially having side effects.
 */
function isInitializerSafe(node: any): boolean {
  if (!node) return true; // no initializer = safe (e.g., `let x;`)

  switch (node.type) {
    case 'Literal':
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'BigIntLiteral':
    case 'RegExpLiteral':
      return true;

    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return true;

    case 'TemplateLiteral':
      // Safe only if no expressions (pure template with only quasis)
      return (node.expressions?.length ?? 0) === 0;

    case 'ObjectExpression':
      // Safe if ALL property values are safe
      for (const prop of node.properties ?? []) {
        if (prop.type === 'SpreadElement') return false;
        if (prop.type === 'Property') {
          // Computed keys can have side effects
          if (prop.computed) return false;
          if (!isInitializerSafe(prop.value)) return false;
        }
      }
      return true;

    case 'ArrayExpression':
      // Safe if ALL elements are safe
      for (const elem of node.elements ?? []) {
        if (!elem) continue; // holes are safe
        if (elem.type === 'SpreadElement') return false;
        if (!isInitializerSafe(elem)) return false;
      }
      return true;

    case 'UnaryExpression':
      // `-1`, `!false`, `+0` etc. are safe if argument is safe
      return isInitializerSafe(node.argument);

    default:
      // CallExpression, NewExpression, MemberExpression, Identifier,
      // BinaryExpression, etc. — conservatively treat as side-effecting
      return false;
  }
}

// ---------------------------------------------------------------------------
// Binding name collection from patterns
// ---------------------------------------------------------------------------

/**
 * Collect all binding names from a pattern node.
 */
function collectBindingNames(node: any, names: string[]): void {
  if (!node) return;

  switch (node.type) {
    case 'Identifier':
      names.push(node.name);
      break;

    case 'ObjectPattern':
      for (const prop of node.properties ?? []) {
        if (prop.type === 'RestElement') {
          collectBindingNames(prop.argument, names);
        } else {
          collectBindingNames(prop.value, names);
        }
      }
      break;

    case 'ArrayPattern':
      for (const elem of node.elements ?? []) {
        collectBindingNames(elem, names);
      }
      break;

    case 'RestElement':
      collectBindingNames(node.argument, names);
      break;

    case 'AssignmentPattern':
      collectBindingNames(node.left, names);
      break;

    default:
      break;
  }
}

/**
 * Count the number of distinct bindings in a pattern.
 */
function countBindings(node: any): number {
  const names: string[] = [];
  collectBindingNames(node, names);
  return names.length;
}

// ---------------------------------------------------------------------------
// collectModuleLevelDecls
// ---------------------------------------------------------------------------

/**
 * Walk program.body top-level statements to collect VariableDeclaration,
 * FunctionDeclaration, and ClassDeclaration nodes.
 */
export function collectModuleLevelDecls(
  program: any,
  source: string,
): ModuleLevelDecl[] {
  const decls: ModuleLevelDecl[] = [];

  for (const stmt of program.body ?? []) {
    let declaration = stmt;
    let isExported = false;

    // Handle export wrappers
    if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      declaration = stmt.declaration;
      isExported = true;
    } else if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration) {
      declaration = stmt.declaration;
      isExported = true;
    }

    if (declaration.type === 'VariableDeclaration') {
      const kind = declaration.kind; // var, let, const
      for (const declarator of declaration.declarations ?? []) {
        const id = declarator.id;
        if (!id) continue;

        const initNode = declarator.init;
        const hasSideEffects = !isInitializerSafe(initNode);

        // Check for destructuring with multiple bindings
        const isDestructuring =
          id.type === 'ObjectPattern' || id.type === 'ArrayPattern';
        const bindingCount = isDestructuring ? countBindings(id) : 1;
        const isShared = isDestructuring && bindingCount > 1;

        // Collect all binding names from this declarator
        const names: string[] = [];
        collectBindingNames(id, names);

        // Use the full statement range for declStart/declEnd
        const declStart = stmt.start;
        const declEnd = stmt.end;
        const declText = source.slice(declStart, declEnd);

        for (const name of names) {
          decls.push({
            name,
            declStart,
            declEnd,
            declText,
            isExported,
            hasSideEffects,
            isPartOfSharedDestructuring: isShared,
            kind,
          });
        }
      }
    } else if (declaration.type === 'FunctionDeclaration') {
      const name = declaration.id?.name;
      if (name) {
        decls.push({
          name,
          declStart: stmt.start,
          declEnd: stmt.end,
          declText: source.slice(stmt.start, stmt.end),
          isExported,
          hasSideEffects: false, // function declarations are safe
          isPartOfSharedDestructuring: false,
          kind: 'function',
        });
      }
    } else if (declaration.type === 'ClassDeclaration') {
      const name = declaration.id?.name;
      if (name) {
        decls.push({
          name,
          declStart: stmt.start,
          declEnd: stmt.end,
          declText: source.slice(stmt.start, stmt.end),
          isExported,
          hasSideEffects: false, // class declarations are safe
          isPartOfSharedDestructuring: false,
          kind: 'class',
        });
      }
    }
  }

  return decls;
}

// ---------------------------------------------------------------------------
// computeSegmentUsage
// ---------------------------------------------------------------------------

/**
 * Walk the AST collecting all Identifier references. For each identifier,
 * determine if it falls within any extraction's arg range (argStart..argEnd).
 * If so, attribute it to that segment. If outside ALL ranges, attribute to root.
 */
export function computeSegmentUsage(
  program: any,
  extractions: Array<{ symbolName: string; argStart: number; argEnd: number }>,
): { segmentUsage: Map<string, Set<string>>; rootUsage: Set<string> } {
  const segmentUsage = new Map<string, Set<string>>();
  const rootUsage = new Set<string>();

  // Initialize segment maps
  for (const ext of extractions) {
    segmentUsage.set(ext.symbolName, new Set());
  }

  walk(program, {
    enter(node: any) {
      if (node.type !== 'Identifier') return;

      const pos = node.start;
      const name = node.name;

      // Check if this identifier falls within any extraction range
      let inSegment = false;
      for (const ext of extractions) {
        if (pos >= ext.argStart && pos < ext.argEnd) {
          segmentUsage.get(ext.symbolName)!.add(name);
          inSegment = true;
          break;
        }
      }

      if (!inSegment) {
        rootUsage.add(name);
      }
    },
  });

  return { segmentUsage, rootUsage };
}

// ---------------------------------------------------------------------------
// analyzeMigration
// ---------------------------------------------------------------------------

/**
 * Apply the migration decision tree from RESEARCH.md Pattern 6.
 *
 * Decision tree:
 * a. If exported AND used by any segment -> reexport (MIG-03)
 * b. If exported AND NOT used by any segment -> keep
 * c. If used by root code -> reexport
 * d. If used by more than one segment -> reexport (MIG-02)
 * e. If hasSideEffects -> reexport (MIG-04)
 * f. If isPartOfSharedDestructuring -> reexport (MIG-05)
 * g. If used by exactly one segment -> move with targetSegment (MIG-01)
 * h. If not used by any segment -> keep
 */
export function analyzeMigration(
  decls: ModuleLevelDecl[],
  segmentUsage: Map<string, Set<string>>,
  rootUsage: Set<string>,
): MigrationDecision[] {
  const decisions: MigrationDecision[] = [];

  for (const decl of decls) {
    // Find which segments use this variable
    const usingSegments: string[] = [];
    for (const [segName, usedNames] of segmentUsage) {
      if (usedNames.has(decl.name)) {
        usingSegments.push(segName);
      }
    }

    const usedByAnySegment = usingSegments.length > 0;
    const usedByRoot = rootUsage.has(decl.name);

    // a. Exported AND used by segment -> reexport
    if (decl.isExported && usedByAnySegment) {
      decisions.push({
        action: 'reexport',
        varName: decl.name,
        reason: 'exported variable used by segment (MIG-03)',
      });
      continue;
    }

    // b. Exported AND NOT used by any segment -> keep
    if (decl.isExported && !usedByAnySegment) {
      decisions.push({
        action: 'keep',
        varName: decl.name,
        reason: 'exported but not used by any segment',
      });
      continue;
    }

    // c. Used by root code -> reexport
    if (usedByRoot && usedByAnySegment) {
      decisions.push({
        action: 'reexport',
        varName: decl.name,
        reason: 'used by both root code and segment(s)',
      });
      continue;
    }

    // d. Used by more than one segment -> reexport
    if (usingSegments.length > 1) {
      decisions.push({
        action: 'reexport',
        varName: decl.name,
        reason: 'used by multiple segments (MIG-02)',
      });
      continue;
    }

    // e. Has side effects -> reexport
    if (decl.hasSideEffects && usedByAnySegment) {
      decisions.push({
        action: 'reexport',
        varName: decl.name,
        reason: 'declaration has side effects (MIG-04)',
      });
      continue;
    }

    // f. Part of shared destructuring -> reexport
    if (decl.isPartOfSharedDestructuring && usedByAnySegment) {
      decisions.push({
        action: 'reexport',
        varName: decl.name,
        reason: 'part of shared destructuring pattern (MIG-05)',
      });
      continue;
    }

    // g. Used by exactly one segment -> move
    if (usingSegments.length === 1) {
      decisions.push({
        action: 'move',
        varName: decl.name,
        targetSegment: usingSegments[0],
        reason: 'single-use safe variable (MIG-01)',
      });
      continue;
    }

    // h. Not used by any segment -> keep
    decisions.push({
      action: 'keep',
      varName: decl.name,
      reason: 'not used by any segment',
    });
  }

  return decisions;
}
