
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

export function analyzeCaptures(
  closureNode: AstFunction,
  parentScopeIdentifiers: Set<string>,
  freeIdentifiers: readonly string[],
): CaptureAnalysisResult {
  const paramNames = collectParamNames(closureNode.params ?? []);
  const undeclared = freeIdentifiers;

  // Parent-scope membership wins even when a same-name import exists: same-scope
  // import + decl is illegal, so the name must be an inner-scope shadow whose
  // value crosses the boundary — excluding it would drop a real capture.
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

export function excludeNestedExtractionCaptures(
  closureNode: AstFunction,
  captureNames: readonly string[],
  childRanges: ReadonlyArray<readonly [number, number]>,
  moduleScopeNames: ReadonlySet<string>,
): string[] {
  if (captureNames.length === 0 || childRanges.length === 0) {
    return [...captureNames];
  }
  const moduleLevelCaptures = new Set(
    captureNames.filter((n) => moduleScopeNames.has(n)),
  );
  if (moduleLevelCaptures.size === 0) return [...captureNames];

  const usedOutsideAnyChild = new Set<string>();
  walk(closureNode, {
    enter(node: AstNode) {
      if (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') return;
      const name = node.name;
      if (!moduleLevelCaptures.has(name) || usedOutsideAnyChild.has(name)) return;
      if (!childRanges.some(([s, e]) => node.start >= s && node.start < e)) {
        usedOutsideAnyChild.add(name);
      }
    },
  });
  return captureNames.filter(
    (n) => !moduleLevelCaptures.has(n) || usedOutsideAnyChild.has(n),
  );
}

function collectParamNames(params: AstParamPattern[]): string[] {
  const names: string[] = [];
  for (const param of params) {
    appendBindingNamesFromPattern(param, names);
  }
  return names;
}

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
 * tracked closure, the flat union of every enclosing scope plus the module
 * scope. The per-closure union is deferred until after the walk so enclosing
 * declarations that textually follow the closure (hoisted names, later
 * `const`s) are still included.
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
      // Snapshot enclosing scopes by reference; they keep filling, union taken post-walk.
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
 * Add the binding names a single node declares to its enclosing function scope.
 * Non-recursive: the caller's walk provides traversal, so a function/class
 * declaration name lands in the enclosing scope while its params/body are a
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
