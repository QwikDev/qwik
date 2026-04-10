/**
 * Signal analysis module for the Qwik optimizer.
 *
 * Detects signal/store expressions in JSX props and generates appropriate
 * wrapping (_wrapProp) or hoisted function signal (_fnSignal) representations.
 *
 * Implements: SIG-01, SIG-02, SIG-03, SIG-04, SIG-05
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalExprResult =
  | { type: 'none' }
  | { type: 'wrapProp'; code: string }
  | { type: 'fnSignal'; deps: string[]; hoistedFn: string; hoistedStr: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect `x.value` MemberExpression pattern (signal value access).
 */
export function isSignalValueAccess(node: any): boolean {
  return (
    node != null &&
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'value'
  );
}

/**
 * Detect `props.field` or `store.field` patterns where the object is a local
 * variable (not imported). Only matches single-level member access.
 *
 * Excludes `.value` access (that's signal, not store field).
 */
export function isStoreFieldAccess(
  node: any,
  importedNames: Set<string>,
): boolean {
  if (node == null || node.type !== 'MemberExpression') return false;

  // Must be a direct Identifier object (single-level: props.x, not props.a.b)
  if (node.object?.type !== 'Identifier') return false;

  const objName = node.object.name;

  // Must not be an imported name
  if (importedNames.has(objName)) return false;

  // Must not be a well-known global
  if (GLOBAL_NAMES.has(objName)) return false;

  // Get property name
  const propName = getPropertyName(node);
  if (propName == null) return false;

  // Exclude .value access (that's signal, not store field)
  if (propName === 'value') return false;

  return true;
}

/**
 * Extract property name from a MemberExpression node.
 * Handles both dot access (x.foo) and computed string access (x['foo']).
 */
function getPropertyName(node: any): string | null {
  if (!node.property) return null;
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (
    node.computed &&
    (node.property.type === 'StringLiteral' || node.property.type === 'Literal') &&
    typeof node.property.value === 'string'
  ) {
    return node.property.value;
  }
  return null;
}

/** Well-known global names that indicate mutable runtime context. */
const GLOBAL_NAMES = new Set([
  'window',
  'document',
  'globalThis',
  'navigator',
  'location',
  'history',
  'screen',
  'localStorage',
  'sessionStorage',
  'console',
  'Math',
  'JSON',
  'Date',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'undefined',
  'NaN',
  'Infinity',
]);

// ---------------------------------------------------------------------------
// Expression analysis utilities
// ---------------------------------------------------------------------------

/**
 * Check if an expression contains a function call whose callee is NOT
 * an imported name (i.e., an "unknown" call).
 */
function containsUnknownCall(node: any, importedNames: Set<string>): boolean {
  if (node == null) return false;

  if (node.type === 'CallExpression') {
    const calleeName = getCalleeIdentifierName(node.callee);
    // If callee is not an imported name, it's an unknown call
    if (calleeName == null || !importedNames.has(calleeName)) {
      return true;
    }
  }

  // Recurse into child nodes
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc')
      continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item.type === 'string') {
            if (containsUnknownCall(item, importedNames)) return true;
          }
        }
      } else if (typeof val.type === 'string') {
        if (containsUnknownCall(val, importedNames)) return true;
      }
    }
  }

  return false;
}

/**
 * Get the identifier name of a callee expression.
 * Returns the name for simple Identifier callees, null otherwise.
 */
function getCalleeIdentifierName(callee: any): string | null {
  if (callee?.type === 'Identifier') return callee.name;
  return null;
}

/**
 * Check if the expression references any imported name directly
 * (not through member access).
 */
function containsImportedReference(
  node: any,
  importedNames: Set<string>,
): boolean {
  if (node == null) return false;
  if (node.type === 'Identifier' && importedNames.has(node.name)) return true;

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc')
      continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item.type === 'string') {
            if (containsImportedReference(item, importedNames)) return true;
          }
        }
      } else if (typeof val.type === 'string') {
        if (containsImportedReference(val, importedNames)) return true;
      }
    }
  }
  return false;
}

/**
 * Count all signal.value accesses in an expression tree.
 */
function countSignalValueAccesses(node: any): number {
  if (node == null) return 0;
  let count = 0;
  if (isSignalValueAccess(node)) count++;

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc')
      continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item.type === 'string') {
            count += countSignalValueAccesses(item);
          }
        }
      } else if (typeof val.type === 'string') {
        count += countSignalValueAccesses(val);
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

/**
 * Analyze a JSX prop expression to determine if it should be wrapped
 * with _wrapProp, converted to _fnSignal, or left as-is.
 *
 * @param exprNode - The AST expression node
 * @param source - The full source text (for extracting substrings)
 * @param importedNames - Set of identifiers that come from imports
 * @returns SignalExprResult indicating wrap type
 */
export function analyzeSignalExpression(
  exprNode: any,
  source: string,
  importedNames: Set<string>,
): SignalExprResult {
  if (exprNode == null) return { type: 'none' };

  // Literals are never wrapped
  if (
    exprNode.type === 'StringLiteral' ||
    exprNode.type === 'NumericLiteral' ||
    exprNode.type === 'BooleanLiteral' ||
    exprNode.type === 'NullLiteral' ||
    exprNode.type === 'Literal'
  ) {
    return { type: 'none' };
  }

  // Bare identifier
  if (exprNode.type === 'Identifier') {
    // Imported names are static, not wrapped
    if (importedNames.has(exprNode.name)) return { type: 'none' };
    // Bare signal reference (no .value) is const, not wrapped
    return { type: 'none' };
  }

  // Template literals without expressions are not wrapped
  if (
    exprNode.type === 'TemplateLiteral' &&
    (!exprNode.expressions || exprNode.expressions.length === 0)
  ) {
    return { type: 'none' };
  }

  // CallExpression with `mutable` callee -> NOT wrapped
  if (exprNode.type === 'CallExpression') {
    const calleeName = getCalleeIdentifierName(exprNode.callee);
    if (calleeName === 'mutable') return { type: 'none' };
    // signal.value() -> NOT wrapped (call on .value)
    if (isSignalValueAccess(exprNode.callee)) return { type: 'none' };
    // Other call expressions are not wrapped
    return { type: 'none' };
  }

  // MemberExpression
  if (exprNode.type === 'MemberExpression') {
    // signal.value -> _wrapProp(signal)
    if (isSignalValueAccess(exprNode)) {
      const objText = source.slice(exprNode.object.start, exprNode.object.end);
      return { type: 'wrapProp', code: `_wrapProp(${objText})` };
    }

    // store.field / props['field'] (single-level, local obj)
    if (isStoreFieldAccess(exprNode, importedNames)) {
      const objText = source.slice(exprNode.object.start, exprNode.object.end);
      const propName = getPropertyName(exprNode)!;
      return {
        type: 'wrapProp',
        code: `_wrapProp(${objText}, "${propName}")`,
      };
    }

    // Other member expressions (e.g., dep.thing, globalThing.thing) -> not wrapped
    return { type: 'none' };
  }

  // BinaryExpression or other compound expressions
  // Check if contains signal.value + something that prevents wrapping
  if (
    exprNode.type === 'BinaryExpression' ||
    exprNode.type === 'ConditionalExpression' ||
    exprNode.type === 'LogicalExpression'
  ) {
    const hasSignalValue = countSignalValueAccesses(exprNode) > 0;

    if (!hasSignalValue) return { type: 'none' };

    // Has signal.value, but check for non-wrap conditions
    // SIG-05: mixed with unknown call -> NOT wrapped
    if (containsUnknownCall(exprNode, importedNames)) return { type: 'none' };

    // SIG-05: mixed with imported reference -> NOT wrapped (goes to varProps)
    if (containsImportedReference(exprNode, importedNames))
      return { type: 'none' };

    // If we get here, it's a computed expression with signal.value only
    // This will be handled by fnSignal in Task 2
    // For now, return none (Task 2 will add fnSignal support)
    return { type: 'none' };
  }

  return { type: 'none' };
}

// ---------------------------------------------------------------------------
// SignalHoister (placeholder for Task 2)
// ---------------------------------------------------------------------------

/**
 * Manages hoisted signal functions (_hf0, _hf1, etc.) for a module.
 */
export class SignalHoister {
  counter = 0;
  hoistedFunctions: Array<{ name: string; fn: string; str: string }> = [];

  /**
   * Add a hoisted function, returns the _hfN name.
   */
  hoist(fn: string, str: string): string {
    const name = `_hf${this.counter}`;
    this.hoistedFunctions.push({ name, fn, str });
    this.counter++;
    return name;
  }

  /**
   * Get all hoisted declarations as source text lines.
   */
  getDeclarations(): string[] {
    const lines: string[] = [];
    for (const h of this.hoistedFunctions) {
      lines.push(`const ${h.name} = ${h.fn};`);
      lines.push(`const ${h.name}_str = ${h.str};`);
    }
    return lines;
  }
}
