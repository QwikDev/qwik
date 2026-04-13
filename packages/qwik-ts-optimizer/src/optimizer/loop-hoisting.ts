/**
 * Loop hoisting module for the Qwik optimizer.
 *
 * Detects event handlers inside loops, hoists .w([captures]) above the loop,
 * injects q:p/q:ps props for iteration variable access, and generates
 * positional parameter padding.
 */

export interface LoopContext {
  type: 'map' | 'for-i' | 'for-of' | 'for-in' | 'while' | 'do-while';
  iterVars: string[];
  loopNode: any;
  loopBodyStart: number;
  loopBodyEnd: number;
}

export interface HoistingPlan {
  hoistedDecl: string;
  hoistInsertOffset: number;
  qrlRefName: string;
  originalQrlRef: string;
}

export interface LoopHoistResult {
  hoistedDecl: string | null;
  hoistOffset: number;
  qpProp: { propName: string; propValue: string } | null;
  paramNames: string[];
  flags: number;
}

/**
 * Detect if an AST node represents a loop construct.
 */
export function detectLoopContext(
  node: any,
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

function detectMapCall(node: any): LoopContext | null {
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
  node: any,
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
 * Plan the hoisting of .w([captures]) above a loop.
 * Returns null if captureNames is empty (no hoisting needed).
 */
export function hoistEventCaptures(
  qrlRefName: string,
  originalQrlRef: string,
  captureNames: string[],
): HoistingPlan | null {
  if (captureNames.length === 0) return null;

  const captureList = captureNames.join(', ');
  return {
    hoistedDecl: `const ${qrlRefName} = ${originalQrlRef}.w([${captureList}])`,
    hoistInsertOffset: 0, // Caller determines actual offset
    qrlRefName,
    originalQrlRef,
  };
}

/**
 * Walk up the ancestor chain to find the nearest enclosing loop.
 * Returns null if not inside a loop.
 */
export function findEnclosingLoop(
  node: any,
  ancestors: any[],
): LoopContext | null {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    if (ancestor === node) continue;

    const ctx = detectLoopContext(ancestor, '');
    if (ctx) return ctx;
  }

  return null;
}

/**
 * Generate positional parameter padding for loop variable parameters.
 * The first 2 positions are always padding: ["_", "_1"] for event and context params.
 */
export function generateParamPadding(loopVarNames: string[]): string[] {
  return ['_', '_1', ...loopVarNames];
}

/**
 * Build the q:p or q:ps prop for loop iteration variables.
 *
 * Single var uses q:p; multiple vars use q:ps with alphabetical sorting.
 */
export function buildQpProp(
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

/**
 * Analyze an event handler inside a loop to produce the full hoisting plan.
 */
export function analyzeLoopHandler(
  qrlRefName: string,
  originalQrlRef: string,
  captureNames: string[],
  loopVarNames: string[],
  loopCtx: LoopContext,
): LoopHoistResult {
  const hoistPlan = hoistEventCaptures(qrlRefName, originalQrlRef, captureNames);
  const qpProp = buildQpProp(loopVarNames);
  const paramNames = generateParamPadding(loopVarNames);

  return {
    hoistedDecl: hoistPlan?.hoistedDecl ?? null,
    hoistOffset: loopCtx.loopNode.start,
    qpProp,
    paramNames,
    flags: 4, // bit 2: loop context
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractCallbackParams(callback: any): string[] {
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

function getCallbackBodyRange(callback: any): { start: number; end: number } {
  const body = callback.body;
  if (!body) return { start: callback.start, end: callback.end };
  return { start: body.start, end: body.end };
}

function extractForInitVars(init: any): string[] {
  if (!init) return [];
  if (init.type === 'VariableDeclaration') {
    return extractDeclaratorNames(init.declarations ?? []);
  }
  return [];
}

function extractForLeftVars(left: any): string[] {
  if (!left) return [];
  if (left.type === 'VariableDeclaration') {
    return extractDeclaratorNames(left.declarations ?? []);
  }
  if (left.type === 'Identifier') {
    return [left.name];
  }
  return [];
}

function extractDeclaratorNames(declarators: any[]): string[] {
  const names: string[] = [];
  for (const decl of declarators) {
    if (decl.id?.type === 'Identifier') {
      names.push(decl.id.name);
    }
  }
  return names;
}
