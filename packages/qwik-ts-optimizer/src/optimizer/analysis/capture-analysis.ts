/**
 * Capture analysis module for the Qwik optimizer.
 *
 * Detects variables that cross $() boundaries -- variables referenced
 * inside a $() closure but declared in an enclosing scope. These become
 * the `captureNames` array in segment metadata, used for _captures injection.
 */

import { walk } from 'oxc-walker';
import type {
  AstFunction,
  AstMaybeNode,
  AstNode,
  AstParamPattern,
  AstProgram,
  BlockStatement,
  FunctionBody,
  Statement,
  VariableDeclaration,
} from '../../ast-types.js';
import {
  addBindingNamesFromPatternToSet,
  appendBindingNamesFromPattern,
} from '../ast/binding-pattern.js';

export interface CaptureAnalysisResult {
  captureNames: string[];
  captures: boolean;
  paramNames: string[];
}

/**
 * Analyze a $() closure node to determine which variables cross the
 * serialization boundary. Excludes globals; includes parent-scope
 * bindings even when a same-name top-level import exists (the inner
 * binding shadows the import).
 *
 * `freeIdentifiers` is the closure's slice of the module-wide
 * free-identifier map (`computeClosureFreeIdentifiers`) — the caller
 * computes that map once per module instead of re-walking per closure.
 */
export function analyzeCaptures(
  closureNode: AstFunction,
  parentScopeIdentifiers: Set<string>,
  freeIdentifiers: readonly string[],
): CaptureAnalysisResult {
  const paramNames = collectParamNames(closureNode.params ?? []);
  const undeclared = freeIdentifiers;

  // Parent-scope membership wins unconditionally. Same-scope import +
  // decl is illegal in JS, so a name appearing in both
  // `parentScopeIdentifiers` and the module's import set must be a
  // legitimate inner-scope shadow — the closure resolves to that inner
  // binding and the value crosses the segment boundary. Excluding
  // shadowed names would drop real inner-scope captures.
  const captureNames = [...new Set(
    undeclared
      .filter((name) => parentScopeIdentifiers.has(name))
      .sort()
  )];

  return {
    captureNames,
    captures: captureNames.length > 0,
    paramNames,
  };
}

/** Extract all binding names from function parameter AST nodes. */
function collectParamNames(params: AstParamPattern[]): string[] {
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

/**
 * Differential oracle for the gather walk's lexical-scope projection: for each
 * tracked closure, the flat union of every enclosing function/arrow scope plus
 * the module scope (not the closure's own params/body) — the set capture
 * analysis intersects against. Production routes through `module-gather-walk.ts`.
 *
 * A single walk accumulates each scope's declarations on enter; the per-closure
 * union is deferred until after the walk, so enclosing declarations that
 * textually follow the closure (hoisted names, later `const`s) are included.
 */
export function buildClosureLexicalScopes(
  program: AstProgram,
  closureNodes: ReadonlyMap<string, AstFunction>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  const nodeToSymbol = new Map<AstFunction, string>();
  for (const [sym, fn] of closureNodes) {
    nodeToSymbol.set(fn, sym);
  }

  // Index 0 is module scope; each pushed set is one enclosing function scope.
  const scopeStack: Set<string>[] = [new Set()];
  const pending: Array<{ sym: string; scopes: Set<string>[] }> = [];

  walk(program, {
    enter(node: AstNode) {
      addScopeDeclarations(node, scopeStack[scopeStack.length - 1]);
      if (!isFunctionLikeNode(node)) return;

      const fn = node as AstFunction;
      const sym = nodeToSymbol.get(fn);
      // Snapshot the enclosing scope sets by reference — they keep filling
      // after this closure; the union is taken once the walk completes.
      if (sym !== undefined) pending.push({ sym, scopes: [...scopeStack] });

      const ownScope = new Set<string>();
      for (const param of fn.params ?? []) {
        addBindingNamesFromPatternToSet(param, ownScope);
      }
      scopeStack.push(ownScope);
    },
    leave(node: AstNode) {
      if (isFunctionLikeNode(node)) scopeStack.pop();
    },
  });

  for (const { sym, scopes } of pending) {
    const union = new Set<string>();
    for (const scope of scopes) for (const id of scope) union.add(id);
    result.set(sym, union);
  }
  return result;
}

function isFunctionLikeNode(node: AstNode): boolean {
  return (
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

/**
 * Add the binding names a single node contributes to its enclosing function
 * scope. Non-recursive: the caller's walk provides traversal, so block/loop
 * bodies are reached without a nested walk. Function/class *declaration* names
 * belong to the enclosing scope; a nested function's params and body are a
 * separate scope the walk visits under its own frame.
 */
export function addScopeDeclarations(node: AstNode, ids: Set<string>): void {
  switch (node.type) {
    case 'VariableDeclaration':
      for (const d of node.declarations ?? []) {
        if (d.id) addBindingNamesFromPatternToSet(d.id, ids);
      }
      return;
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      if (node.id?.type === 'Identifier') ids.add(node.id.name);
      return;
    case 'CatchClause':
      if (node.param) addBindingNamesFromPatternToSet(node.param, ids);
      return;
  }
}
