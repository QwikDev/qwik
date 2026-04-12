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
  | { type: 'wrapProp'; code: string; isStoreField?: boolean }
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
  localNames?: Set<string>,
): boolean {
  if (node == null || node.type !== 'MemberExpression') return false;

  // Must be a direct Identifier object (single-level: props.x, not props.a.b)
  if (node.object?.type !== 'Identifier') return false;

  const objName = node.object.name;

  // Must not be an imported name
  if (importedNames.has(objName)) return false;

  // Must not be a well-known global
  if (GLOBAL_NAMES.has(objName)) return false;

  // Must be a known local identifier when localNames is provided.
  // Unknown globals (not imported, not in GLOBAL_NAMES, not in localNames) should
  // NOT be treated as store fields — SWC skips signal analysis for them.
  if (localNames && !localNames.has(objName)) return false;

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
// Reactive root detection
// ---------------------------------------------------------------------------

/**
 * Get the root identifier of a member expression chain.
 * For `store.address.city.name`, returns `store`.
 */
function getMemberChainRoot(node: any): string | null {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return getMemberChainRoot(node.object);
  return null;
}

/**
 * Get the depth of a member expression chain.
 * `store.field` = 1, `store.address.city` = 2, `store.address.city.name` = 3
 */
function getMemberChainDepth(node: any): number {
  if (node.type !== 'MemberExpression') return 0;
  return 1 + getMemberChainDepth(node.object);
}

/**
 * Check if a MemberExpression is a deep store access (depth >= 2)
 * on a local (non-imported, non-global) identifier.
 */
function isDeepStoreAccess(node: any, importedNames: Set<string>, localNames?: Set<string>): boolean {
  if (node.type !== 'MemberExpression') return false;
  const depth = getMemberChainDepth(node);
  if (depth < 2) return false;
  const root = getMemberChainRoot(node);
  if (root == null) return false;
  if (importedNames.has(root)) return false;
  if (GLOBAL_NAMES.has(root)) return false;
  // Must be a known local when localNames is provided
  if (localNames && !localNames.has(root)) return false;
  return true;
}

/**
 * Collect all non-imported identifier names from an expression.
 * Used when a `.value` access has a complex object like `(a || b).value`
 * to find all signal references within the expression.
 */
function collectIdentifiersFromExpr(
  node: any,
  importedNames: Set<string>,
  seen: Set<string>,
  roots: string[],
): void {
  if (node == null) return;
  if (node.type === 'Identifier') {
    if (!importedNames.has(node.name) && !seen.has(node.name)) {
      seen.add(node.name);
      roots.push(node.name);
    }
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item.type === 'string') collectIdentifiersFromExpr(item, importedNames, seen, roots);
        }
      } else if (typeof val.type === 'string') {
        collectIdentifiersFromExpr(val, importedNames, seen, roots);
      }
    }
  }
}

/**
 * Collect all reactive roots from an expression.
 * Reactive roots are:
 * - The object of a `.value` access (signal pattern)
 * - The root identifier of a deep member chain on a local object (store pattern)
 *
 * Returns unique root names in order of first appearance.
 */
function collectReactiveRoots(
  node: any,
  importedNames: Set<string>,
  localNames?: Set<string>,
): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();

  function walk(n: any): void {
    if (n == null) return;

    // signal.value access -> root is the object name
    if (isSignalValueAccess(n)) {
      const root = getMemberChainRoot(n.object);
      if (root != null) {
        if (!seen.has(root)) {
          seen.add(root);
          roots.push(root);
        }
        return; // Don't recurse further into this node
      }
      // Complex expression like (a || b).value -- collect all non-imported
      // identifiers from the object as reactive roots
      collectIdentifiersFromExpr(n.object, importedNames, seen, roots);
      return;
    }

    // Deep store access -> root is the chain root
    if (isDeepStoreAccess(n, importedNames, localNames)) {
      const root = getMemberChainRoot(n);
      if (root != null && !seen.has(root)) {
        seen.add(root);
        roots.push(root);
      }
      return; // Don't recurse further
    }

    // Single-level store field access (props.field, store.field) -> root is object
    if (isStoreFieldAccess(n, importedNames, localNames)) {
      const root = getMemberChainRoot(n.object);
      if (root != null && !seen.has(root)) {
        seen.add(root);
        roots.push(root);
      }
      return; // Don't recurse further
    }

    // Recurse into child nodes
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc')
        continue;
      const val = n[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') walk(item);
          }
        } else if (typeof val.type === 'string') {
          walk(val);
        }
      }
    }
  }

  walk(node);
  return roots;
}

/**
 * Collect ALL dependency identifiers from an expression: reactive roots
 * (signal.value, store accesses) PLUS bare local identifiers.
 *
 * This is used after we've confirmed there are reactive roots -- bare
 * identifiers that are non-imported local variables also become deps
 * since _fnSignal needs to track all mutable values for re-evaluation.
 *
 * Returns unique dep names in order of first appearance.
 */
function collectAllDeps(
  node: any,
  importedNames: Set<string>,
): string[] {
  // Collect reactive roots and bare identifiers separately.
  // Reactive roots go first in the dep list (matching Rust optimizer ordering).
  const reactiveRoots: string[] = [];
  const bareIdents: string[] = [];
  const seen = new Set<string>();

  function walk(n: any): void {
    if (n == null) return;

    // signal.value access -> reactive root
    if (isSignalValueAccess(n)) {
      const root = getMemberChainRoot(n.object);
      if (root != null && !seen.has(root)) {
        seen.add(root);
        reactiveRoots.push(root);
      }
      return;
    }

    // Deep store access -> reactive root
    if (isDeepStoreAccess(n, importedNames)) {
      const root = getMemberChainRoot(n);
      if (root != null && !seen.has(root)) {
        seen.add(root);
        reactiveRoots.push(root);
      }
      return;
    }

    // Single-level store field access -> reactive root
    if (isStoreFieldAccess(n, importedNames)) {
      const root = getMemberChainRoot(n.object);
      if (root != null && !seen.has(root)) {
        seen.add(root);
        reactiveRoots.push(root);
      }
      return;
    }

    // Bare local identifier (non-imported, non-global)
    if (n.type === 'Identifier' && !importedNames.has(n.name) && !GLOBAL_NAMES.has(n.name)) {
      if (!seen.has(n.name)) {
        seen.add(n.name);
        bareIdents.push(n.name);
      }
      return;
    }

    // Recurse into child nodes, but skip property keys in objects
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      // Skip the 'key' child of Property nodes (object literal keys aren't deps)
      if (key === 'key' && (n.type === 'Property' || n.type === 'ObjectProperty')) continue;
      // Skip the 'property' child of MemberExpression (property names aren't deps)
      if (key === 'property' && (n.type === 'MemberExpression' || n.type === 'StaticMemberExpression') && !n.computed) continue;
      const val = n[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') walk(item);
          }
        } else if (typeof val.type === 'string') {
          walk(val);
        }
      }
    }
  }

  walk(node);
  // Reactive roots first, then bare identifiers
  return [...reactiveRoots, ...bareIdents];
}

// ---------------------------------------------------------------------------
// fnSignal generation
// ---------------------------------------------------------------------------

/**
 * Generate the hoisted function body by replacing reactive root names
 * with pN parameters. Also generates the minimal-whitespace string.
 *
 * The function body preserves the original expression structure but
 * replaces root object names.
 */
function generateFnSignal(
  exprNode: any,
  source: string,
  roots: string[],
): { hoistedFn: string; hoistedStr: string } {
  const rootToParam = new Map<string, string>();
  for (let i = 0; i < roots.length; i++) {
    rootToParam.set(roots[i], `p${i}`);
  }

  // Extract the expression source text
  const exprText = source.slice(exprNode.start, exprNode.end);
  const exprStart = exprNode.start;

  // Collect all positions where root identifiers need to be replaced.
  // We need to find root identifiers that are the base of reactive accesses.
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  function findRootReplacements(n: any, parentKey?: string, parentNode?: any): void {
    if (n == null) return;

    // For signal.value or deep store access, find the root identifier
    if (isSignalValueAccess(n) || isDeepStoreAccess(n, new Set())) {
      const rootId = findRootIdentifier(n);
      if (rootId && rootToParam.has(rootId.name)) {
        replacements.push({
          start: rootId.start - exprStart,
          end: rootId.end - exprStart,
          replacement: rootToParam.get(rootId.name)!,
        });
        return;
      }
      // Complex object expression (e.g., (a || b).value) -- recurse into the object
      // to find all identifier references that need parameterization
      if (isSignalValueAccess(n) && !rootId) {
        findRootReplacements(n.object);
        return;
      }
      return;
    }

    // Single-level store field access (e.g., _rawProps.fromProps)
    if (isStoreFieldAccess(n, new Set())) {
      const rootId = findRootIdentifier(n.object);
      if (rootId && rootToParam.has(rootId.name)) {
        replacements.push({
          start: rootId.start - exprStart,
          end: rootId.end - exprStart,
          replacement: rootToParam.get(rootId.name)!,
        });
      }
      return;
    }

    // Bare identifier that is a dep -- replace with pN
    if (n.type === 'Identifier' && rootToParam.has(n.name)) {
      // Skip property keys in object literals
      const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
      // Skip property names in non-computed member expressions
      const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode.computed;
      if (!isPropertyKey && !isMemberProp) {
        replacements.push({
          start: n.start - exprStart,
          end: n.end - exprStart,
          replacement: rootToParam.get(n.name)!,
        });
      }
      return;
    }

    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc')
        continue;
      const val = n[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') findRootReplacements(item, key, n);
          }
        } else if (typeof val.type === 'string') {
          findRootReplacements(val, key, n);
        }
      }
    }
  }

  findRootReplacements(exprNode);

  // Sort replacements by position (ascending) and apply
  replacements.sort((a, b) => a.start - b.start);

  let fnBody = '';
  let pos = 0;
  for (const r of replacements) {
    fnBody += exprText.slice(pos, r.start);
    fnBody += r.replacement;
    pos = r.end;
  }
  fnBody += exprText.slice(pos);

  // Generate params string
  const params = roots.map((_, i) => `p${i}`).join(',');

  // Hoisted function: preserves original spacing in body
  // Wrap object expressions in parens so arrow function returns object, not block
  const needsParens = exprNode.type === 'ObjectExpression';
  const hoistedFn = needsParens
    ? `(${params})=>(${fnBody})`
    : `(${params})=>${fnBody}`;

  // String representation: minimal whitespace, with string literals normalized
  // to double quotes (matching Rust SWC optimizer behavior which re-serializes
  // the AST, producing double-quoted strings).
  const strBody = normalizeStringQuotes(removeWhitespace(fnBody));

  // Determine quote style for string representation
  // If the string body contains double quotes, use single quotes for wrapping
  const hasDoubleQuotes = strBody.includes('"');
  const hoistedStr = hasDoubleQuotes
    ? `'${strBody}'`
    : `"${strBody}"`;

  return { hoistedFn, hoistedStr };
}

/**
 * Find the root Identifier node at the base of a member chain.
 */
function findRootIdentifier(node: any): any | null {
  if (node.type === 'Identifier') return node;
  if (node.type === 'MemberExpression') return findRootIdentifier(node.object);
  return null;
}

/**
 * Remove whitespace around operators for the minimal string representation.
 * Preserves whitespace inside string literals.
 */
function removeWhitespace(text: string): string {
  let result = '';
  let inString: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      result += ch;
      if (ch === inString && text[i - 1] !== '\\') {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      result += ch;
      continue;
    }

    if (ch === '`') {
      // Template literals - just include everything until closing backtick
      result += ch;
      i++;
      while (i < text.length && text[i] !== '`') {
        result += text[i];
        i++;
      }
      if (i < text.length) result += text[i]; // closing backtick
      continue;
    }

    // Skip whitespace (spaces, tabs)
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      continue;
    }

    result += ch;
  }

  return result;
}

/**
 * Normalize string literals from single quotes to double quotes.
 * Matches Rust SWC optimizer behavior: re-serialized AST uses double quotes.
 * `'yes'` -> `"yes"`, already-double-quoted strings are left alone.
 */
function normalizeStringQuotes(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      // Find closing single quote (handle escapes)
      let j = i + 1;
      let content = '';
      while (j < text.length && text[j] !== "'") {
        if (text[j] === '\\') {
          // Handle escape sequences
          if (text[j + 1] === "'") {
            // Escaped single quote -> just the quote char in double-quote context
            content += "'";
            j += 2;
          } else {
            content += text[j] + text[j + 1];
            j += 2;
          }
        } else {
          // If the content contains an unescaped double quote, escape it
          if (text[j] === '"') {
            content += '\\"';
          } else {
            content += text[j];
          }
          j++;
        }
      }
      result += '"' + content + '"';
      i = j; // skip past closing quote
    } else if (ch === '"') {
      // Already double-quoted, pass through as-is
      result += ch;
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') {
          result += text[i] + text[i + 1];
          i += 2;
        } else {
          result += text[i];
          i++;
        }
      }
      if (i < text.length) result += text[i]; // closing "
    } else {
      result += ch;
    }
  }
  return result;
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
  /** All locally declared names (for distinguishing known locals from unknown globals) */
  localNames?: Set<string>,
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
    // Skip signal analysis for member expressions on unknown globals.
    // SWC only applies _wrapProp/_fnSignal when the object is a known local
    // (in decl_stack) or a global (import/export). Unknown identifiers that
    // aren't in scope get no signal treatment.
    // Unwrap TS type assertions and parenthesized expressions to find the underlying identifier
    let unwrapped = exprNode.object;
    while (unwrapped) {
      if (unwrapped.type === 'TSAsExpression' || unwrapped.type === 'TSNonNullExpression' ||
          unwrapped.type === 'TSTypeAssertion' || unwrapped.type === 'TSInstantiationExpression' ||
          unwrapped.type === 'TSSatisfiesExpression' || unwrapped.type === 'ParenthesizedExpression') {
        unwrapped = unwrapped.expression;
      } else {
        break;
      }
    }
    const objIdent = unwrapped?.type === 'Identifier' ? unwrapped.name : null;
    const isKnownIdent = objIdent === null || // non-ident object (e.g., call result) is fine
      importedNames.has(objIdent) ||
      GLOBAL_NAMES.has(objIdent) ||
      (localNames?.has(objIdent) ?? true); // if no localNames provided, assume known (backwards compat)

    // signal.value -> _wrapProp(signal) for simple identifiers,
    // _fnSignal for complex expressions like (a || b).value
    if (isSignalValueAccess(exprNode) && isKnownIdent) {
      if (objIdent !== null) {
        // Simple identifier (possibly wrapped in TS assertion): signal.value -> _wrapProp(signal)
        return { type: 'wrapProp', code: `_wrapProp(${objIdent})` };
      } else {
        // Complex expression: (a || b).value -> _fnSignal
        const roots = collectReactiveRoots(exprNode, importedNames, localNames);
        if (roots.length > 0) {
          const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, roots);
          return { type: 'fnSignal', deps: roots, hoistedFn, hoistedStr };
        }
        // If no reactive roots found, fallback to _wrapProp
        const objText = source.slice(exprNode.object.start, exprNode.object.end);
        return { type: 'wrapProp', code: `_wrapProp(${objText})` };
      }
    }

    // Deep store access (store.address.city.name) -> fnSignal
    if (isKnownIdent && isDeepStoreAccess(exprNode, importedNames, localNames)) {
      const roots = collectReactiveRoots(exprNode, importedNames, localNames);
      if (roots.length > 0) {
        const { hoistedFn, hoistedStr } = generateFnSignal(
          exprNode,
          source,
          roots,
        );
        return { type: 'fnSignal', deps: roots, hoistedFn, hoistedStr };
      }
    }

    // store.field / props['field'] (single-level, local obj)
    if (isKnownIdent && isStoreFieldAccess(exprNode, importedNames, localNames)) {
      const objText = source.slice(exprNode.object.start, exprNode.object.end);
      const propName = getPropertyName(exprNode)!;
      return {
        type: 'wrapProp',
        code: `_wrapProp(${objText}, "${propName}")`,
        isStoreField: true,
      };
    }

    // Other member expressions (e.g., dep.thing, globalThing.thing) -> not wrapped
    return { type: 'none' };
  }

  // ObjectExpression values: wrap in _fnSignal only if they contain reactive roots.
  // e.g., {props: _rawProps.fromProps} -> _fnSignal((p0) => ({props: p0.fromProps}), [_rawProps], ...)
  // Plain object literals without reactive roots are NOT wrapped.
  if (exprNode.type === 'ObjectExpression') {
    // SIG-05: mixed with unknown call -> NOT wrapped
    if (containsUnknownCall(exprNode, importedNames)) return { type: 'none' };

    // SIG-05: mixed with imported reference -> NOT wrapped
    if (containsImportedReference(exprNode, importedNames)) return { type: 'none' };

    const roots = collectReactiveRoots(exprNode, importedNames, localNames);
    if (roots.length === 0) return { type: 'none' };

    const allDeps = collectAllDeps(exprNode, importedNames);
    const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, allDeps);
    return { type: 'fnSignal', deps: allDeps, hoistedFn, hoistedStr };
  }

  // BinaryExpression or other compound expressions
  // Check for reactive roots (signal.value, store access)
  if (
    exprNode.type === 'BinaryExpression' ||
    exprNode.type === 'ConditionalExpression' ||
    exprNode.type === 'LogicalExpression' ||
    exprNode.type === 'TemplateLiteral'
  ) {
    // SIG-05: mixed with unknown call -> NOT wrapped
    if (containsUnknownCall(exprNode, importedNames)) return { type: 'none' };

    // SIG-05: mixed with imported reference -> NOT wrapped (goes to varProps)
    if (containsImportedReference(exprNode, importedNames))
      return { type: 'none' };

    // Collect reactive roots (signal.value + store accesses)
    const roots = collectReactiveRoots(exprNode, importedNames, localNames);
    if (roots.length === 0) return { type: 'none' };

    // Also collect bare local identifiers as additional deps.
    // When there's a reactive root (signal.value, store.field), all local
    // variable references in the expression become dependencies too,
    // since _fnSignal needs to track all mutable values for re-evaluation.
    const allDeps = collectAllDeps(exprNode, importedNames);

    // Generate fnSignal
    const { hoistedFn, hoistedStr } = generateFnSignal(
      exprNode,
      source,
      allDeps,
    );
    return { type: 'fnSignal', deps: allDeps, hoistedFn, hoistedStr };
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
  /** Deduplication map: function body text -> existing _hf variable name */
  private dedupMap = new Map<string, string>();

  /**
   * Add a hoisted function, returns the _hfN name.
   * Deduplicates: if an identical function body already exists, reuses its name.
   */
  hoist(fn: string, str: string): string {
    // Check for existing identical function body
    const existing = this.dedupMap.get(fn);
    if (existing) {
      return existing;
    }

    const name = `_hf${this.counter}`;
    this.hoistedFunctions.push({ name, fn, str });
    this.dedupMap.set(fn, name);
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
