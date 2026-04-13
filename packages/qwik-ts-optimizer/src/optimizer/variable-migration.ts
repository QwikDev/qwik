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

    case 'Identifier':
      // Identifier references (e.g., `const { a } = source` where source is
      // an import) are safe — reading a binding has no side effects.
      // Property access during destructuring could trigger getters, but for
      // migration purposes this matches SWC's behavior.
      return true;

    case 'TemplateLiteral':
      // Safe if all expressions are safe (identifier refs, literals, etc.)
      return (node.expressions ?? []).every((expr: any) => isInitializerSafe(expr));

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

    case 'BinaryExpression':
    case 'LogicalExpression':
      // `a + b`, `a && b` etc. are safe if both sides are safe
      return isInitializerSafe(node.left) && isInitializerSafe(node.right);

    case 'ConditionalExpression':
      // `a ? b : c` is safe if all parts are safe
      return isInitializerSafe(node.test) && isInitializerSafe(node.consequent) && isInitializerSafe(node.alternate);

    case 'MemberExpression':
      // Property access on safe objects (e.g., `obj.field`, `import.meta.env.X`)
      // Could trigger getters, but matches SWC migration behavior
      return !node.computed && isInitializerSafe(node.object);

    case 'MetaProperty':
      // `import.meta` is safe
      return true;

    default:
      // CallExpression, NewExpression, etc. — conservatively treat as side-effecting
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
    } else if (declaration.type === 'TSEnumDeclaration') {
      const name = declaration.id?.name;
      if (name) {
        decls.push({
          name,
          declStart: stmt.start,
          declEnd: stmt.end,
          declText: source.slice(stmt.start, stmt.end),
          isExported,
          hasSideEffects: false, // enum declarations are safe
          isPartOfSharedDestructuring: false,
          kind: 'const', // enums behave like const for migration purposes
        });
      }
    }
  }

  // Second pass: mark decls as exported when they appear in `export { name }` specifiers
  // (separate from their declaration statement)
  for (const stmt of program.body ?? []) {
    if (stmt.type === 'ExportNamedDeclaration' && !stmt.declaration && stmt.specifiers) {
      for (const spec of stmt.specifiers) {
        const localName = spec.local?.type === 'Identifier' ? spec.local.name : spec.local?.value;
        if (localName) {
          const decl = decls.find(d => d.name === localName);
          if (decl) decl.isExported = true;
        }
      }
    }
  }

  return decls;
}

// ---------------------------------------------------------------------------
// Local declaration collection for scope-aware filtering
// ---------------------------------------------------------------------------

/**
 * Collect all identifiers that are declaration sites within a given AST range.
 * This mirrors SWC's `collect_local_declarations_from_expr` which collects:
 * - Arrow/function params
 * - Variable declarations (var, let, const) in any block scope
 * - Function/class declaration names
 * - Catch clause params
 * - For/for-in/for-of loop variables
 *
 * These locally-declared names should not be treated as external dependencies
 * of the segment (they shadow outer-scope names).
 */
export function collectLocalDeclarations(program: any, start: number, end: number): Set<string> {
  const locals = new Set<string>();

  walk(program, {
    enter(node: any) {
      // Only process nodes within the extraction range
      if (node.start < start || node.end > end) return;

      // Arrow function parameters
      if (node.type === 'ArrowFunctionExpression' && node.params) {
        for (const param of node.params) {
          const names: string[] = [];
          collectBindingNames(param, names);
          for (const n of names) locals.add(n);
        }
      }

      // Function expression/declaration parameters and name
      if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') {
        if (node.id?.name) locals.add(node.id.name);
        for (const param of node.params ?? []) {
          const names: string[] = [];
          collectBindingNames(param, names);
          for (const n of names) locals.add(n);
        }
      }

      // Variable declarations
      if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations ?? []) {
          if (decl.id) {
            const names: string[] = [];
            collectBindingNames(decl.id, names);
            for (const n of names) locals.add(n);
          }
        }
      }

      // Class declarations
      if (node.type === 'ClassDeclaration' && node.id?.name) {
        locals.add(node.id.name);
      }

      // Catch clause parameters
      if (node.type === 'CatchClause' && node.param) {
        const names: string[] = [];
        collectBindingNames(node.param, names);
        for (const n of names) locals.add(n);
      }
    },
  });

  return locals;
}

/**
 * Collect local declarations for ALL extractions in a single AST walk.
 * This replaces calling collectLocalDeclarations once per extraction,
 * which walked the entire AST N times (O(N*AST_size)).
 *
 * Returns a Map from symbolName -> Set<string> of locally-declared names.
 */
export function collectAllLocalDeclarations(
  program: any,
  extractions: Array<{ symbolName: string; argStart: number; argEnd: number }>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const ext of extractions) {
    result.set(ext.symbolName, new Set());
  }

  if (extractions.length === 0) return result;

  walk(program, {
    enter(node: any) {
      // Only process declaration-bearing node types
      const type = node.type;
      if (
        type !== 'ArrowFunctionExpression' &&
        type !== 'FunctionExpression' &&
        type !== 'FunctionDeclaration' &&
        type !== 'VariableDeclaration' &&
        type !== 'ClassDeclaration' &&
        type !== 'CatchClause'
      ) return;

      const nodeStart = node.start;
      const nodeEnd = node.end;

      // Find which extractions this node falls within
      for (const ext of extractions) {
        if (nodeStart < ext.argStart || nodeEnd > ext.argEnd) continue;

        const locals = result.get(ext.symbolName)!;

        if (type === 'ArrowFunctionExpression' && node.params) {
          for (const param of node.params) {
            const names: string[] = [];
            collectBindingNames(param, names);
            for (const n of names) locals.add(n);
          }
        }

        if (type === 'FunctionExpression' || type === 'FunctionDeclaration') {
          if (node.id?.name) locals.add(node.id.name);
          for (const param of node.params ?? []) {
            const names: string[] = [];
            collectBindingNames(param, names);
            for (const n of names) locals.add(n);
          }
        }

        if (type === 'VariableDeclaration') {
          for (const decl of node.declarations ?? []) {
            if (decl.id) {
              const names: string[] = [];
              collectBindingNames(decl.id, names);
              for (const n of names) locals.add(n);
            }
          }
        }

        if (type === 'ClassDeclaration' && node.id?.name) {
          locals.add(node.id.name);
        }

        if (type === 'CatchClause' && node.param) {
          const names: string[] = [];
          collectBindingNames(node.param, names);
          for (const n of names) locals.add(n);
        }
      }
    },
  });

  return result;
}

/**
 * Collect the set of identifier positions that are declaration-site bindings
 * at the top level of the module. SWC's `build_main_module_usage_set` explicitly
 * skips `Stmt::Decl` items — identifiers that are the binding name of a
 * VariableDeclaration, FunctionDeclaration, or ClassDeclaration at root scope
 * should not count as "root usage".
 */
function collectRootDeclPositions(program: any): Set<number> {
  const positions = new Set<number>();

  for (const stmt of program.body ?? []) {
    let declaration = stmt;

    // Handle export wrappers
    if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      declaration = stmt.declaration;
    } else if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration) {
      declaration = stmt.declaration;
    }

    if (declaration.type === 'VariableDeclaration') {
      for (const decl of declaration.declarations ?? []) {
        if (decl.id) {
          collectBindingPositions(decl.id, positions);
        }
      }
    } else if (declaration.type === 'FunctionDeclaration' && declaration.id) {
      positions.add(declaration.id.start);
    } else if (declaration.type === 'ClassDeclaration' && declaration.id) {
      positions.add(declaration.id.start);
    }
  }

  return positions;
}

/**
 * Collect the start positions of all binding name identifiers from a pattern.
 */
function collectBindingPositions(node: any, positions: Set<number>): void {
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

// ---------------------------------------------------------------------------
// computeSegmentUsage
// ---------------------------------------------------------------------------

/**
 * Walk the AST collecting all Identifier references. For each identifier,
 * determine if it falls within any extraction's arg range (argStart..argEnd).
 * If so, attribute it to that segment. If outside ALL ranges, attribute to root.
 *
 * Filters out:
 * - Locally-declared identifiers within each extraction (params, local vars, catch params)
 * - Declaration-site identifiers at the root level (binding names of top-level declarations)
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

  // Pre-compute local declarations for ALL extractions in a single AST walk
  const extractionLocals = collectAllLocalDeclarations(program, extractions);

  // Pre-compute declaration-site positions at root level
  const rootDeclPositions = collectRootDeclPositions(program);

  walk(program, {
    enter(node: any) {
      // Include both Identifier and JSXIdentifier nodes.
      // JSX tags like <Hola> create JSXIdentifier nodes that reference
      // module-level declarations and need to be tracked for migration.
      if (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') return;

      const pos = node.start;
      const name = node.name;

      // Check if this identifier falls within any extraction range.
      // When nested extractions overlap (e.g., $() inside component$()),
      // prefer the innermost (smallest) range so identifiers are attributed
      // to the most specific segment.
      let inSegment = false;
      let bestExt: (typeof extractions)[0] | null = null;
      let bestSize = Infinity;
      for (const ext of extractions) {
        if (pos >= ext.argStart && pos < ext.argEnd) {
          const size = ext.argEnd - ext.argStart;
          if (size < bestSize) {
            bestSize = size;
            bestExt = ext;
          }
          inSegment = true;
        }
      }
      if (bestExt) {
        const locals = extractionLocals.get(bestExt.symbolName)!;
        if (!locals.has(name)) {
          segmentUsage.get(bestExt.symbolName)!.add(name);
        }
      }

      if (!inSegment) {
        // Skip declaration-site identifiers at root level
        if (!rootDeclPositions.has(pos)) {
          rootUsage.add(name);
        }
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
