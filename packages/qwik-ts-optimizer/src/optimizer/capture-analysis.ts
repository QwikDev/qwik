/**
 * Capture analysis module for the Qwik optimizer.
 *
 * Detects variables that cross $() boundaries -- variables referenced
 * inside a $() closure but declared in an enclosing scope. These become
 * the `captureNames` array in segment metadata, used for _captures injection.
 */

import { getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import type {
  AstBindingPattern,
  AstFunction,
  AstMaybeNode,
  AstParamPattern,
  AstProgram,
  BlockStatement,
  FunctionBody,
  Statement,
  VariableDeclaration,
} from '../ast-types.js';
import {
  addBindingNamesFromPatternToSet,
  appendBindingNamesFromPattern,
} from './utils/binding-pattern.js';

export interface CaptureAnalysisResult {
  captureNames: string[];
  captures: boolean;
  paramNames: string[];
}

/**
 * Analyze a $() closure node to determine which variables cross the
 * serialization boundary. Excludes globals and import bindings.
 */
export function analyzeCaptures(
  closureNode: AstFunction,
  parentScopeIdentifiers: Set<string>,
  importedNames: Set<string>,
): CaptureAnalysisResult {
  const paramNames = collectParamNames(closureNode.params ?? []);
  const undeclared = getUndeclaredIdentifiersInFunction(closureNode);

  const captureNames = [...new Set(
    undeclared
      .filter((name) => parentScopeIdentifiers.has(name) && !importedNames.has(name))
      .sort()
  )];

  return {
    captureNames,
    captures: captureNames.length > 0,
    paramNames,
  };
}

/** Extract all binding names from function parameter AST nodes. */
export function collectParamNames(params: AstParamPattern[]): string[] {
  const names: string[] = [];
  for (const param of params) {
    appendBindingNamesFromPattern(param, names);
  }
  return names;
}

/**
 * Collect all identifiers declared in a container scope (function body or program).
 */
export function collectScopeIdentifiers(
  containerNode: AstProgram | BlockStatement | FunctionBody | AstFunction,
  _source: string,
  _relPath: string,
): Set<string> {
  const ids = new Set<string>();
  collectDeclarationsFromNode(containerNode, ids);
  return ids;
}

function collectDeclarationsFromNode(
  node: AstMaybeNode | Statement | FunctionBody | AstFunction,
  ids: Set<string>,
): void {
  if (!node) return;

  if (node.type === 'VariableDeclaration') {
    const declarationNode = node as VariableDeclaration;
    for (const decl of declarationNode.declarations ?? []) {
      if (decl.id) addBindingNamesFromPatternToSet(decl.id, ids);
    }
    return;
  }

  if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') {
    ids.add(node.id.name);
    return;
  }

  if (node.type === 'BlockStatement' || node.type === 'Program') {
    for (const stmt of node.body ?? []) {
      collectDeclarationsFromNode(stmt, ids);
    }
    return;
  }

  const isFunctionNode =
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration';

  if (isFunctionNode) {
    for (const param of node.params ?? []) {
      addBindingNamesFromPatternToSet(param, ids);
    }
    if (node.body) collectDeclarationsFromNode(node.body, ids);
  }
}
