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
 * For each closure node tracked in `closureNodes`, compute the union of
 * identifiers in scope at the closure's position — every enclosing
 * function/arrow scope plus the program scope, but NOT the closure's own
 * params/body.
 *
 * Mirrors SWC's `decl_stack` (transform.rs:986–991): the flat union of all
 * scopes between the closure and the module root is what
 * `compute_scoped_idents` intersects against to determine captures.
 *
 * The full lexical chain matters: intermediate **non-marker** enclosing
 * functions contribute decls too. For
 * `(fn) => { const x = …; useVisibleTask$(() => x); }` at module level,
 * both `fn` and `x` must be capturable even though the outer arrow is not
 * itself an extraction — neither the enclosing extraction's body scope nor
 * the module scope alone would surface them.
 */
export function buildClosureLexicalScopes(
  program: AstProgram,
  closureNodes: ReadonlyMap<string, AstFunction>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  // Inverse map so we can recognise closure nodes by identity during the walk.
  const nodeToSymbol = new Map<AstFunction, string>();
  for (const [sym, fn] of closureNodes) {
    nodeToSymbol.set(fn, sym);
  }

  // Stack of per-scope identifier sets. Index 0 is module scope; each
  // pushed entry corresponds to one enclosing function/arrow body.
  const scopeStack: Set<string>[] = [];

  // Pre-collect module scope eagerly: walk's enter is called for the
  // program's children (FunctionDeclaration, VariableDeclaration, …) but
  // not for the Program node itself. Push module scope upfront so it
  // sits beneath every function we visit.
  const moduleScope = new Set<string>();
  for (const stmt of program.body ?? []) {
    collectShallowDeclarationsFromStatement(stmt, moduleScope);
  }
  scopeStack.push(moduleScope);

  walk(program, {
    enter(node: AstNode) {
      if (!isFunctionLikeNode(node)) return;

      const fn = node as AstFunction;
      const sym = nodeToSymbol.get(fn);
      if (sym !== undefined) {
        // Record union of all enclosing scopes BEFORE pushing this
        // closure's own scope. The closure's params land in
        // `analyzeCaptures(..).paramNames` separately.
        const union = new Set<string>();
        for (const scope of scopeStack) {
          for (const id of scope) union.add(id);
        }
        result.set(sym, union);
      }

      // Push this function's own scope so any nested closure sees it as
      // an enclosing scope. Includes params + shallow body decls; nested
      // function bodies are explored by the walker recursively, not by
      // this collector.
      const ownScope = new Set<string>();
      for (const param of fn.params ?? []) {
        addBindingNamesFromPatternToSet(param, ownScope);
      }
      if (fn.body) {
        collectShallowDeclarationsFromBody(fn.body, ownScope);
      }
      scopeStack.push(ownScope);
    },
    leave(node: AstNode) {
      if (isFunctionLikeNode(node)) scopeStack.pop();
    },
  });

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
 * Collect declarations introduced by one statement at the same lexical
 * level (no recursion into nested function bodies). Used for both module
 * top-level and function body top-level collection.
 */
function collectShallowDeclarationsFromStatement(
  stmt: AstMaybeNode | Statement,
  ids: Set<string>,
): void {
  if (!stmt) return;
  if (stmt.type === 'VariableDeclaration') {
    const decl = stmt as VariableDeclaration;
    for (const d of decl.declarations ?? []) {
      if (d.id) addBindingNamesFromPatternToSet(d.id, ids);
    }
    return;
  }
  if (stmt.type === 'FunctionDeclaration' && stmt.id?.type === 'Identifier') {
    ids.add(stmt.id.name);
    return;
  }
  if (stmt.type === 'ClassDeclaration' && stmt.id?.type === 'Identifier') {
    ids.add(stmt.id.name);
    return;
  }
  if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
    collectShallowDeclarationsFromStatement(stmt.declaration, ids);
    return;
  }
  if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration) {
    collectShallowDeclarationsFromStatement(stmt.declaration, ids);
    return;
  }
}

function collectShallowDeclarationsFromBody(
  body: BlockStatement | FunctionBody | AstNode,
  ids: Set<string>,
): void {
  if (!body) return;
  // Expression-bodied arrow (`x => x + 1`): no own decls beyond params.
  if (body.type !== 'BlockStatement') return;
  for (const stmt of body.body ?? []) {
    collectShallowDeclarationsFromStatement(stmt, ids);
  }
}
