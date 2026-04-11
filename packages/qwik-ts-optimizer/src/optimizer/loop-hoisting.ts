/**
 * Loop hoisting module for the Qwik optimizer.
 *
 * Detects event handlers inside loops, hoists .w([captures]) above the loop,
 * injects q:p/q:ps props for iteration variable access, and generates
 * positional parameter padding.
 *
 * Implements: LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05
 *
 * Key patterns from snapshot corpus:
 * - .w([captures]) hoisted before loop (captures from outer scope)
 * - q:p carries single loop iteration variable
 * - q:ps carries multiple loop variables sorted alphabetically
 * - Segment signature: (_, _1, loopVar) with padding for event + context params
 * - Flags bit 2 (value 4) set when q:p/q:ps present
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Loop detection
// ---------------------------------------------------------------------------

/**
 * Detect if an AST node represents a loop construct.
 *
 * Supported loop types:
 * - .map(callback) — CallExpression where callee is MemberExpression with property `map`
 * - for (let i = 0; ...) — ForStatement
 * - for (const item of ...) — ForOfStatement
 * - for (const key in ...) — ForInStatement
 * - while (...) — WhileStatement
 * - do { ... } while (...) — DoWhileStatement
 */
export function detectLoopContext(
  node: any,
  source: string,
): LoopContext | null {
  switch (node.type) {
    case 'CallExpression': {
      // Check for .map() call
      const callee = node.callee;
      if (
        callee?.type === 'MemberExpression' &&
        callee.property?.type === 'Identifier' &&
        callee.property.name === 'map'
      ) {
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
      return null;
    }

    case 'ForStatement': {
      const iterVars = extractForInitVars(node.init);
      const body = node.body;
      return {
        type: 'for-i',
        iterVars,
        loopNode: node,
        loopBodyStart: body?.start ?? node.start,
        loopBodyEnd: body?.end ?? node.end,
      };
    }

    case 'ForOfStatement': {
      const iterVars = extractForLeftVars(node.left);
      const body = node.body;
      return {
        type: 'for-of',
        iterVars,
        loopNode: node,
        loopBodyStart: body?.start ?? node.start,
        loopBodyEnd: body?.end ?? node.end,
      };
    }

    case 'ForInStatement': {
      const iterVars = extractForLeftVars(node.left);
      const body = node.body;
      return {
        type: 'for-in',
        iterVars,
        loopNode: node,
        loopBodyStart: body?.start ?? node.start,
        loopBodyEnd: body?.end ?? node.end,
      };
    }

    case 'WhileStatement': {
      const body = node.body;
      return {
        type: 'while',
        iterVars: [],
        loopNode: node,
        loopBodyStart: body?.start ?? node.start,
        loopBodyEnd: body?.end ?? node.end,
      };
    }

    case 'DoWhileStatement': {
      const body = node.body;
      return {
        type: 'do-while',
        iterVars: [],
        loopNode: node,
        loopBodyStart: body?.start ?? node.start,
        loopBodyEnd: body?.end ?? node.end,
      };
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// .w() hoisting
// ---------------------------------------------------------------------------

/**
 * Plan the hoisting of .w([captures]) above a loop.
 *
 * If captureNames is empty, returns null (no hoisting needed).
 * Otherwise returns a HoistingPlan describing the declaration to insert.
 */
export function hoistEventCaptures(
  qrlRefName: string,
  originalQrlRef: string,
  captureNames: string[],
): HoistingPlan | null {
  if (captureNames.length === 0) return null;

  const captureList = captureNames.join(', ');
  const hoistedDecl = `const ${qrlRefName} = ${originalQrlRef}.w([${captureList}])`;

  return {
    hoistedDecl,
    hoistInsertOffset: 0, // Caller determines actual offset
    qrlRefName,
    originalQrlRef,
  };
}

// ---------------------------------------------------------------------------
// findEnclosingLoop
// ---------------------------------------------------------------------------

/**
 * Walk up the ancestor chain to find if a node is inside a loop.
 * Returns the nearest enclosing loop context, or null if not in a loop.
 *
 * The ancestors array should include the node itself as the last element
 * (or not -- we walk from end to start looking for loop nodes).
 */
export function findEnclosingLoop(
  node: any,
  ancestors: any[],
): LoopContext | null {
  // Walk ancestors from nearest to farthest (reverse order)
  // Skip the node itself (last element) if it's in the ancestors
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    // Skip the node itself
    if (ancestor === node) continue;

    // Check if this ancestor is a loop
    // For .map() calls, we need a dummy source since we only need type + iterVars
    const ctx = detectLoopContext(ancestor, '');
    if (ctx) return ctx;
  }

  return null;
}

// ---------------------------------------------------------------------------
// q:p / q:ps injection
// ---------------------------------------------------------------------------

/**
 * Generate positional parameter padding for loop variable parameters.
 *
 * The first 2 positions are always padding: ["_", "_1"] for event param
 * and context param. Remaining positions are for loop variable names.
 *
 * @param loopVarNames - The loop variable names to include
 * @returns Array of parameter names including padding
 */
export function generateParamPadding(loopVarNames: string[]): string[] {
  return ['_', '_1', ...loopVarNames];
}

/**
 * Build the q:p or q:ps prop for loop iteration variables.
 *
 * Single var: { propName: "q:p", propValue: varName }
 * Multiple vars: { propName: "q:ps", propValue: "[sorted(vars).join(', ')]" }
 * Sorts alphabetically for q:ps per RESEARCH.md Pattern 7.
 */
export function buildQpProp(
  loopVars: string[],
  /** If true, preserve the input order (declaration order from capture analysis) */
  preserveOrder: boolean = false,
): { propName: string; propValue: string } | null {
  if (loopVars.length === 0) return null;

  if (loopVars.length === 1) {
    return { propName: 'q:p', propValue: loopVars[0] };
  }

  const vars = preserveOrder ? loopVars : [...loopVars].sort();
  return { propName: 'q:ps', propValue: '[' + vars.join(', ') + ']' };
}

// ---------------------------------------------------------------------------
// Full analysis
// ---------------------------------------------------------------------------

/**
 * Analyze an event handler inside a loop to produce the full hoisting plan.
 *
 * Determines which loop variables the handler references, builds q:p/q:ps,
 * generates param padding, computes flags with loop bit, and plans .w() hoisting.
 *
 * @param qrlRefName - The QRL reference variable name
 * @param originalQrlRef - The original q_ prefixed QRL name
 * @param captureNames - Non-loop captures (from outer scope)
 * @param loopVarNames - Loop iteration variables referenced by the handler
 * @param loopCtx - The enclosing loop context
 * @returns LoopHoistResult with all hoisting info
 */
export function analyzeLoopHandler(
  qrlRefName: string,
  originalQrlRef: string,
  captureNames: string[],
  loopVarNames: string[],
  loopCtx: LoopContext,
): LoopHoistResult {
  // Build .w() hoisting plan for non-loop captures
  const hoistPlan = hoistEventCaptures(qrlRefName, originalQrlRef, captureNames);

  // Build q:p/q:ps prop
  const qpProp = buildQpProp(loopVarNames);

  // Generate param padding
  const paramNames = generateParamPadding(loopVarNames);

  // Flags: bit 2 (4) for loop context
  const flags = 4;

  return {
    hoistedDecl: hoistPlan?.hoistedDecl ?? null,
    hoistOffset: loopCtx.loopNode.start,
    qpProp,
    paramNames,
    flags,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract parameter names from a callback function (arrow or regular).
 */
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

/**
 * Get the body range of a callback function.
 */
function getCallbackBodyRange(callback: any): { start: number; end: number } {
  const body = callback.body;
  if (!body) return { start: callback.start, end: callback.end };
  return { start: body.start, end: body.end };
}

/**
 * Extract variable names from a for-statement init clause.
 */
function extractForInitVars(init: any): string[] {
  if (!init) return [];
  if (init.type === 'VariableDeclaration') {
    return extractDeclaratorNames(init.declarations ?? []);
  }
  return [];
}

/**
 * Extract variable names from a for-of/for-in left clause.
 */
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

/**
 * Extract identifier names from variable declarators.
 */
function extractDeclaratorNames(declarators: any[]): string[] {
  const names: string[] = [];
  for (const decl of declarators) {
    if (decl.id?.type === 'Identifier') {
      names.push(decl.id.name);
    }
  }
  return names;
}
