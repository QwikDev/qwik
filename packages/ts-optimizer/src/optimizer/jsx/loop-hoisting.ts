import type {
  AstFunction,
  AstNode,
  CallExpression,
  MemberExpression,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  VariableDeclarator,
  WhileStatement,
  DoWhileStatement,
} from '../../ast-types.js';
import MagicString from 'magic-string';
import { isReferenceIdentifier, walk } from 'oxc-walker';
import { parseWithRawTransfer } from '../ast/parse.js';
import { collectBindingNamesFromPattern } from '../ast/binding-pattern.js';
import { paddingParam } from '../segment/post-process.js';

export interface LoopContext {
  type: 'map' | 'for-i' | 'for-of' | 'for-in' | 'while' | 'do-while';
  iterVars: string[];
  loopNode: AstNode;
  loopBodyStart: number;
  loopBodyEnd: number;
}

export function detectLoopContext(node: AstNode, _source: string): LoopContext | null {
  switch (node.type) {
    case 'CallExpression':
      return detectMapCall(node);

    case 'ForStatement':
      return buildLoopContext('for-i', extractForInitVars(node.init), node);

    case 'ForOfStatement':
      return buildLoopContext('for-of', extractForLeftVars(node.left), node);

    case 'ForInStatement':
      return buildLoopContext('for-in', extractForLeftVars(node.left), node);

    case 'WhileStatement':
      return buildLoopContext('while', [], node);

    case 'DoWhileStatement':
      return buildLoopContext('do-while', [], node);

    default:
      return null;
  }
}

function detectMapCall(node: CallExpression): LoopContext | null {
  const callee = node.callee;
  if (
    callee?.type !== 'MemberExpression' ||
    node.optional ||
    hasOptionalReceiver(callee) ||
    callee.property?.type !== 'Identifier' ||
    callee.property.name !== 'map'
  ) {
    return null;
  }

  const callback = node.arguments?.[0];
  if (!callback) {
    return null;
  }
  if (
    callback.type !== 'ArrowFunctionExpression' &&
    callback.type !== 'FunctionExpression' &&
    callback.type !== 'FunctionDeclaration'
  ) {
    return null;
  }

  const iterVars = extractCallbackParams(callback);
  const bodyRange = getCallbackBodyRange(callback);

  return {
    type: 'map',
    iterVars,
    loopNode: node,
    loopBodyStart: bodyRange.start,
    loopBodyEnd: bodyRange.end,
  };
}

function hasOptionalReceiver(member: MemberExpression): boolean {
  let current = member;
  while (current.object.type === 'MemberExpression') {
    if (current.optional) {
      return true;
    }
    current = current.object;
  }
  return current.optional || current.object.type === 'ChainExpression';
}

function buildLoopContext(
  type: LoopContext['type'],
  iterVars: string[],
  node: ForStatement | ForOfStatement | ForInStatement | WhileStatement | DoWhileStatement
): LoopContext {
  const body = node.body;
  return {
    type,
    iterVars,
    loopNode: node,
    loopBodyStart: body?.start ?? node.start,
    loopBodyEnd: body?.end ?? node.end,
  };
}

export function generateParamPadding(
  loopVarNames: string[],
  originalParams: readonly string[] = []
): string[] {
  // Author-written (event, element) params survive promotion (matches Rust's
  // `(ev, _1, store)` shape); only missing positions get padding.
  const eventParam = originalParams[0] && originalParams[0] !== '_' ? originalParams[0] : '_';
  const elementParam = originalParams[1] && originalParams[1] !== '_1' ? originalParams[1] : '_1';
  return [eventParam, elementParam, ...loopVarNames];
}

/**
 * The lexical-capture params an event handler receives positionally — its params after the `_, _1`
 * (event, element) prefix, excluding padding (`_2`, `_3`, … and bare `_`). Returns `[]` when
 * there's no `_, _1` prefix.
 *
 * A bare `_` at index ≥2 is never a lifted param — only an author-written placeholder — so it's
 * excluded defensively (with the `_, _1` prefix present it would also be a duplicate-param
 * SyntaxError in module code).
 */
export function eventHandlerQpParams(paramNames: readonly string[]): string[] {
  // Only capture promotion creates handlers with a third-or-later param —
  // authors write at most (event, element) — so position filters suffice.
  if (paramNames.length < 3) {
    return [];
  }
  const result: string[] = [];
  for (let i = 2; i < paramNames.length; i++) {
    const p = paramNames[i];
    if (paddingParam.test(p)) {
      continue;
    }
    result.push(p);
  }
  return result;
}

export function buildCaptureProp(
  loopVars: string[],
  preserveOrder: boolean = false
): { propName: string; propValue: string } | null {
  if (loopVars.length === 0) {
    return null;
  }

  if (loopVars.length === 1) {
    return { propName: 'q:p', propValue: loopVars[0] };
  }

  const sorted = preserveOrder ? loopVars : [...loopVars].sort();
  return { propName: 'q:ps', propValue: '[' + sorted.join(', ') + ']' };
}

function extractCallbackParams(callback: AstFunction): string[] {
  const params = callback.params ?? [];
  const names: string[] = [];
  for (const param of params) {
    if (param.type === 'Identifier') {
      names.push(param.name);
    } else if (param.type === 'AssignmentPattern' && param.left?.type === 'Identifier') {
      names.push(param.left.name);
    }
  }
  return names;
}

function getCallbackBodyRange(callback: AstFunction): { start: number; end: number } {
  const body = callback.body;
  if (!body) {
    return { start: callback.start, end: callback.end };
  }
  return { start: body.start, end: body.end };
}

function extractForInitVars(init: ForStatement['init']): string[] {
  if (!init) {
    return [];
  }
  if (init.type === 'VariableDeclaration') {
    return extractDeclaratorNames(init.declarations ?? []);
  }
  return [];
}

function extractForLeftVars(left: ForOfStatement['left'] | ForInStatement['left']): string[] {
  if (!left) {
    return [];
  }
  if (left.type === 'VariableDeclaration') {
    return extractDeclaratorNames(left.declarations ?? []);
  }
  if (left.type === 'Identifier') {
    return [left.name];
  }
  return [];
}

function extractDeclaratorNames(declarators: VariableDeclarator[]): string[] {
  const names: string[] = [];
  for (const decl of declarators) {
    if (decl.id?.type === 'Identifier') {
      names.push(decl.id.name);
    }
  }
  return names;
}

/** A loop handler's `.w([…])` binding, with the lexical captures it closes over. */
export interface LoopWDecl {
  decl: string;
  symbolName: string;
  captureNames: readonly string[];
}

function isFunctionNode(node: AstNode): node is AstFunction {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

/** The body of a function or loop statement, else `undefined`. */
function scopeBodyOf(node: AstNode): AstNode | null | undefined {
  switch (node.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'FunctionDeclaration':
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
      return node.body;
    default:
      return undefined;
  }
}

/** AST nodes from `root` down to the innermost node whose range contains `pos`. */
function pathToPosition(root: AstNode, pos: number): AstNode[] {
  const path: AstNode[] = [root];
  let node: AstNode | undefined = root;
  while (node) {
    let next: AstNode | undefined;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || !value || typeof value !== 'object') {
        continue;
      }
      for (const candidate of Array.isArray(value) ? value : [value]) {
        if (
          candidate &&
          typeof candidate.type === 'string' &&
          typeof candidate.start === 'number' &&
          candidate.start <= pos &&
          pos < candidate.end
        ) {
          next = candidate as AstNode;
          break;
        }
      }
      if (next) {
        break;
      }
    }
    if (next) {
      path.push(next);
    }
    node = next;
  }
  return path;
}

function declarationNames(stmt: AstNode | null | undefined): string[] {
  if (!stmt) {
    return [];
  }
  if (stmt.type === 'VariableDeclaration') {
    return stmt.declarations.flatMap((d) => collectBindingNamesFromPattern(d.id));
  }
  if ((stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') && stmt.id) {
    return [stmt.id.name];
  }
  return [];
}

/** Whether `node` introduces a binding for one of `names`; block declarations cover the whole block. */
function declaresAny(node: AstNode, names: ReadonlySet<string>): boolean {
  const hit = (bindings: string[]) => bindings.some((name) => names.has(name));
  switch (node.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'FunctionDeclaration':
      return node.params.some((param) => hit(collectBindingNamesFromPattern(param)));
    case 'BlockStatement':
      return node.body.some((stmt) => hit(declarationNames(stmt)));
    case 'ForStatement':
      return node.init?.type === 'VariableDeclaration' && hit(declarationNames(node.init));
    case 'ForInStatement':
    case 'ForOfStatement':
      return node.left.type === 'VariableDeclaration' && hit(declarationNames(node.left));
    default:
      return false;
  }
}

/** Start of the first value or JSX tag reference to `name`; strings and property keys don't count. */
function findReferenceStart(root: AstNode, name: string): number | undefined {
  let referenceStart: number | undefined;
  walk(root, {
    enter(node: AstNode, parent) {
      if (
        referenceStart === undefined &&
        (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
        node.name === name &&
        isReferenceIdentifier(node, parent)
      ) {
        referenceStart = node.start;
      }
    },
  });
  return referenceStart;
}

/** First statement that may read `name`, directly or via a hoisted function. */
function firstUseStatement(statements: readonly AstNode[], name: string): AstNode | undefined {
  const usedNames = new Set([name]);
  const usesAny = (statement: AstNode) =>
    [...usedNames].some((usedName) => findReferenceStart(statement, usedName) !== undefined);
  let hasNewUser = true;
  while (hasNewUser) {
    hasNewUser = false;
    for (const statement of statements) {
      const functionName =
        statement.type === 'FunctionDeclaration' ? statement.id?.name : undefined;
      if (functionName && !usedNames.has(functionName) && usesAny(statement)) {
        usedNames.add(functionName);
        hasNewUser = true;
      }
    }
  }
  return (
    statements.find(
      (statement) => statement.type !== 'FunctionDeclaration' && usesAny(statement)
    ) ?? statements.find(usesAny)
  );
}

function lastDeclarationOf(
  statements: readonly AstNode[],
  names: ReadonlySet<string>
): AstNode | undefined {
  for (let i = statements.length - 1; i >= 0; i--) {
    if (declarationNames(statements[i]).some((name) => names.has(name))) {
      return statements[i];
    }
  }
  return undefined;
}

function unplacedBindingError(symbolNames: readonly string[], reason: string): Error {
  return new Error(
    `Qwik optimizer: cannot place loop handler binding ${symbolNames.join(', ')}: ${reason}`
  );
}

/**
 * Places each loop handler's `.w([…])` binding in the innermost scope that declares one of its
 * captures, right before the statement that uses it. When every capture is component-scoped that is
 * the component body; when a capture comes from an outer loop (`items.map((item) => …)` nested in
 * `facets.map((facet) => …)` capturing `facet`), the binding goes inside the outer loop callback.
 * Either scope is turned into a block body if it was expression-bodied. Mirrors the Rust optimizer.
 * Statement boundaries come from a parse — text scanning breaks on `;` inside type annotations.
 */
export function insertLoopWDecls(body: string, decls: readonly LoopWDecl[]): string {
  const wrapperPrefixText = 'const __w__ = ';
  const offset = wrapperPrefixText.length;
  const parsed = parseWithRawTransfer('__w__.tsx', wrapperPrefixText + body + ';');
  const init = parsed.program?.body?.[0];
  const root = init?.type === 'VariableDeclaration' ? init.declarations?.[0]?.init : undefined;
  if (!root || !isFunctionNode(root) || !root.body) {
    throw unplacedBindingError(
      decls.map((d) => d.symbolName),
      'the body is not a function'
    );
  }

  const s = new MagicString(body);
  // Expression-bodied callbacks to rewrite as `{ <decls> return <expr>; }`, keyed by node start.
  const expressionBodies = new Map<number, { node: AstNode; body: AstNode; decls: string[] }>();

  for (const { decl, symbolName, captureNames } of decls) {
    const usePos = findReferenceStart(root, symbolName);
    if (usePos === undefined) {
      throw unplacedBindingError([symbolName], 'the body never uses it');
    }
    const path = pathToPosition(root, usePos);
    const names = new Set(captureNames);
    let scopeIdx = 0;
    for (let i = path.length - 2; i > 0; i--) {
      if (declaresAny(path[i], names)) {
        scopeIdx = i;
        break;
      }
    }
    let scope = path[scopeIdx];
    let child = path[scopeIdx + 1];
    const scopeBody = scopeBodyOf(scope);
    if (scopeBody) {
      if (scopeBody.type !== 'BlockStatement') {
        if (scope.type === 'ArrowFunctionExpression') {
          const entry = expressionBodies.get(scope.start) ?? {
            node: scope,
            body: scopeBody,
            decls: [],
          };
          entry.decls.push(decl);
          expressionBodies.set(scope.start, entry);
          continue;
        }
        // `for (…) stmt;` — wrap the single statement in a block.
        s.appendLeft(scopeBody.start - offset, `{\n        ${decl}\n        `);
        s.appendRight(scopeBody.end - offset, '\n    }');
        continue;
      }
      scope = scopeBody;
      child = path[path.indexOf(scopeBody) + 1];
    }
    if (scope.type !== 'BlockStatement') {
      throw unplacedBindingError([symbolName], `${scope.type} has no statement list`);
    }
    if (!scope.body.some((statement) => statement === child)) {
      throw unplacedBindingError([symbolName], 'its use is outside the scope statements');
    }
    // Before the first use so it sees reassignments, never above a capture's declaration.
    const useStatement = firstUseStatement(scope.body, symbolName) ?? child;
    const captureDeclaration = lastDeclarationOf(scope.body, names);
    if (captureDeclaration && captureDeclaration.start > useStatement.start) {
      s.appendLeft(captureDeclaration.end - offset, `\n        ${decl}`);
    } else {
      s.appendLeft(useStatement.start - offset, `${decl}\n        `);
    }
  }

  for (const { node, body: exprNode, decls: bodyDecls } of expressionBodies.values()) {
    // The parsed body boundary (a parenthesised body is a ParenthesizedExpression, so its parens are
    // kept): comments after `=>` stay ahead of the new block and can't swallow `return`.
    const exprStart = exprNode.start - offset;
    const indent = '\n        ';
    s.appendRight(exprStart, `{${indent}${bodyDecls.join(indent)}${indent}return `);
    s.appendLeft(node.end - offset, ';\n    }');
  }

  return s.toString();
}
