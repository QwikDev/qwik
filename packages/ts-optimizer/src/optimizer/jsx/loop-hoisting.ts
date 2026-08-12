import type {
  AstFunction,
  AstNode,
  CallExpression,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  VariableDeclarator,
  WhileStatement,
  DoWhileStatement,
} from '../../ast-types.js';
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
    callee.property?.type !== 'Identifier' ||
    callee.property.name !== 'map'
  ) {
    return null;
  }

  const callback = node.arguments?.[0];
  if (!callback) return null;
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
    if (paddingParam.test(p)) continue;
    result.push(p);
  }
  return result;
}

export function buildCaptureProp(
  loopVars: string[],
  preserveOrder: boolean = false
): { propName: string; propValue: string } | null {
  if (loopVars.length === 0) return null;

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
  if (!body) return { start: callback.start, end: callback.end };
  return { start: body.start, end: body.end };
}

function extractForInitVars(init: ForStatement['init']): string[] {
  if (!init) return [];
  if (init.type === 'VariableDeclaration') {
    return extractDeclaratorNames(init.declarations ?? []);
  }
  return [];
}

function extractForLeftVars(left: ForOfStatement['left'] | ForInStatement['left']): string[] {
  if (!left) return [];
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
