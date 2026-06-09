/**
 * Loop hoisting module for the Qwik optimizer.
 *
 * Detects event handlers inside loops, hoists .w([captures]) above the loop,
 * injects q:p/q:ps props for iteration variable access, and generates
 * positional parameter padding.
 */

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
} from '../ast-types.js';
import { numberedPaddingParam } from './transform/post-process.js';

export interface LoopContext {
  type: 'map' | 'for-i' | 'for-of' | 'for-in' | 'while' | 'do-while';
  iterVars: string[];
  loopNode: AstNode;
  loopBodyStart: number;
  loopBodyEnd: number;
}

/**
 * Detect if an AST node represents a loop construct.
 */
export function detectLoopContext(
  node: AstNode,
  _source: string,
): LoopContext | null {
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
  node:
    | ForStatement
    | ForOfStatement
    | ForInStatement
    | WhileStatement
    | DoWhileStatement,
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

/**
 * Generate positional parameter padding for loop variable parameters.
 * The first 2 positions are always padding: ["_", "_1"] for event and context params.
 */
export function generateParamPadding(loopVarNames: string[]): string[] {
  return ['_', '_1', ...loopVarNames];
}

/**
 * The lexical-capture params an event handler receives positionally — its
 * params after the `_, _1` (event, element) prefix, excluding numbered
 * padding (`_2`, `_3`, … from loop-iter promotion). These are the names the
 * owning element delivers via its `q:p`/`q:ps` prop. Returns `[]` when the
 * handler has no `_, _1` prefix (i.e. no positional capture delivery).
 */
export function eventHandlerQpParams(paramNames: readonly string[]): string[] {
  if (paramNames.length < 2 || paramNames[0] !== '_' || paramNames[1] !== '_1') {
    return [];
  }
  const result: string[] = [];
  for (let i = 2; i < paramNames.length; i++) {
    const p = paramNames[i];
    if (numberedPaddingParam.test(p)) continue;
    result.push(p);
  }
  return result;
}

/**
 * Build the q:p or q:ps prop for loop iteration variables.
 *
 * Single var uses q:p; multiple vars use q:ps with alphabetical sorting.
 */
export function buildCaptureProp(
  loopVars: string[],
  preserveOrder: boolean = false,
): { propName: string; propValue: string } | null {
  if (loopVars.length === 0) return null;

  if (loopVars.length === 1) {
    return { propName: 'q:p', propValue: loopVars[0] };
  }

  const sorted = preserveOrder ? loopVars : [...loopVars].sort();
  return { propName: 'q:ps', propValue: '[' + sorted.join(', ') + ']' };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
