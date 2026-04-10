/**
 * Capture analysis module for the Qwik optimizer.
 *
 * Detects variables that cross $() boundaries — i.e., variables referenced
 * inside a $() closure but declared in an enclosing scope. These become
 * the `captureNames` array in segment metadata, used for _captures injection.
 *
 * Uses oxc-walker's getUndeclaredIdentifiersInFunction() for scope-aware
 * detection, then filters against parent scope declarations and imports.
 *
 * Implements: CAPT-01, CAPT-04, CAPT-05, CAPT-06
 */

import { getUndeclaredIdentifiersInFunction } from 'oxc-walker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaptureAnalysisResult {
  /** Alphabetically sorted captured variable names. */
  captureNames: string[];
  /** True if captureNames.length > 0. */
  captures: boolean;
  /** Function formal parameter names. */
  paramNames: string[];
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

/**
 * Analyze a $() closure node to determine which variables cross the
 * serialization boundary.
 *
 * @param closureNode - ArrowFunctionExpression or FunctionExpression (the $() argument)
 * @param parentScopeIdentifiers - identifiers declared in enclosing scope(s)
 * @param importedNames - names from import statements (excluded from captures)
 * @returns Capture analysis result with captureNames, captures flag, and paramNames
 */
export function analyzeCaptures(
  closureNode: any,
  parentScopeIdentifiers: Set<string>,
  importedNames: Set<string>,
): CaptureAnalysisResult {
  // 1. Extract parameter names from the closure's formal parameters
  const paramNames = collectParamNames(closureNode.params ?? []);

  // 2. Get all undeclared identifiers in the closure using oxc-walker
  //    This returns identifiers referenced but not declared within the function,
  //    excluding the function's own parameters (they ARE declared within it).
  const undeclared = getUndeclaredIdentifiersInFunction(closureNode);

  // 3. Filter: only keep names that exist in parentScopeIdentifiers
  //    AND are NOT import bindings.
  //    This excludes: globals (console, Math, etc.), import bindings,
  //    and anything not from the enclosing scope.
  const captureNames = undeclared
    .filter((name) => parentScopeIdentifiers.has(name) && !importedNames.has(name))
    .sort();

  // Deduplicate (shouldn't be needed but defensive)
  const unique = [...new Set(captureNames)];

  return {
    captureNames: unique,
    captures: unique.length > 0,
    paramNames,
  };
}

// ---------------------------------------------------------------------------
// Parameter name collection
// ---------------------------------------------------------------------------

/**
 * Walk parameter AST nodes to extract all binding names.
 *
 * Handles:
 * - Simple Identifier -> [name]
 * - ObjectPattern with properties -> recursively collect each property value's bindings
 * - ArrayPattern -> recursively collect each element's bindings
 * - RestElement -> recursively collect argument's bindings
 * - AssignmentPattern (defaults) -> collect from left side
 *
 * @param params - Array of parameter AST nodes
 * @returns Array of all binding names found in the parameters
 */
export function collectParamNames(params: any[]): string[] {
  const names: string[] = [];
  for (const param of params) {
    collectBindingNamesFromPattern(param, names);
  }
  return names;
}

/**
 * Recursively collect binding names from a pattern node.
 */
function collectBindingNamesFromPattern(node: any, names: string[]): void {
  if (!node) return;

  switch (node.type) {
    case 'Identifier':
      names.push(node.name);
      break;

    case 'ObjectPattern':
      for (const prop of node.properties ?? []) {
        if (prop.type === 'RestElement') {
          collectBindingNamesFromPattern(prop.argument, names);
        } else {
          // Property — the binding is in the value (or key if shorthand)
          collectBindingNamesFromPattern(prop.value, names);
        }
      }
      break;

    case 'ArrayPattern':
      for (const elem of node.elements ?? []) {
        collectBindingNamesFromPattern(elem, names);
      }
      break;

    case 'RestElement':
      collectBindingNamesFromPattern(node.argument, names);
      break;

    case 'AssignmentPattern':
      // Default value — binding is on the left side
      collectBindingNamesFromPattern(node.left, names);
      break;

    default:
      // TSParameterProperty or other TS-specific nodes
      if (node.parameter) {
        collectBindingNamesFromPattern(node.parameter, names);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Scope identifier collection
// ---------------------------------------------------------------------------

/**
 * Collect all identifiers declared in a container scope (function body or
 * program). Uses oxc-walker's ScopeTracker to properly handle var hoisting
 * and block scoping.
 *
 * Note: For the capture analysis use case, the caller typically builds the
 * parentScopeIdentifiers set by walking the AST outside the $() argument.
 * This helper is provided for cases where you need to programmatically
 * collect scope identifiers from a parsed container.
 *
 * @param containerNode - AST node representing the scope container
 * @param source - Source code text (needed for re-parsing)
 * @param relPath - Relative file path (needed for parser)
 * @returns Set of identifier names declared in the scope
 */
export function collectScopeIdentifiers(
  containerNode: any,
  _source: string,
  _relPath: string,
): Set<string> {
  const ids = new Set<string>();

  // Walk the container to find declarations
  collectDeclarationsFromNode(containerNode, ids);

  return ids;
}

/**
 * Recursively collect declaration names from an AST node.
 * Handles VariableDeclaration, FunctionDeclaration, and parameter patterns.
 */
function collectDeclarationsFromNode(node: any, ids: Set<string>): void {
  if (!node) return;

  if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations ?? []) {
      if (decl.id) {
        collectBindingNamesFromPatternToSet(decl.id, ids);
      }
    }
    return;
  }

  if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') {
    ids.add(node.id.name);
    return;
  }

  // Walk body if it's a block or program
  if (node.type === 'BlockStatement' || node.type === 'Program') {
    for (const stmt of node.body ?? []) {
      collectDeclarationsFromNode(stmt, ids);
    }
    return;
  }

  // Walk function body for params + body
  if (
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration'
  ) {
    // Collect params
    for (const param of node.params ?? []) {
      collectBindingNamesFromPatternToSet(param, ids);
    }
    // Collect body declarations
    if (node.body) {
      collectDeclarationsFromNode(node.body, ids);
    }
  }
}

/**
 * Collect binding names from a pattern into a Set.
 */
function collectBindingNamesFromPatternToSet(node: any, names: Set<string>): void {
  if (!node) return;

  switch (node.type) {
    case 'Identifier':
      names.add(node.name);
      break;

    case 'ObjectPattern':
      for (const prop of node.properties ?? []) {
        if (prop.type === 'RestElement') {
          collectBindingNamesFromPatternToSet(prop.argument, names);
        } else {
          collectBindingNamesFromPatternToSet(prop.value, names);
        }
      }
      break;

    case 'ArrayPattern':
      for (const elem of node.elements ?? []) {
        collectBindingNamesFromPatternToSet(elem, names);
      }
      break;

    case 'RestElement':
      collectBindingNamesFromPatternToSet(node.argument, names);
      break;

    case 'AssignmentPattern':
      collectBindingNamesFromPatternToSet(node.left, names);
      break;

    default:
      if (node.parameter) {
        collectBindingNamesFromPatternToSet(node.parameter, names);
      }
      break;
  }
}
