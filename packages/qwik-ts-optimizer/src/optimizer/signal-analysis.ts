/**
 * Signal analysis for the Qwik optimizer.
 *
 * Detects signal/store expressions in JSX props and generates appropriate
 * wrapping (_wrapProp) or hoisted function signal (_fnSignal) representations.
 */

import { createRegExp, exactly, anyOf, global } from 'magic-regexp';
import type { AstNode } from '../ast-types.js';
import { isAstNode } from '../utils/ast.js';

const trailingComma = createRegExp(
  exactly(',').and(anyOf('}', ']', ')').grouped()),
  [global],
);

export type SignalExprResult =
  | { type: 'none' }
  | { type: 'wrapProp'; code: string; isStoreField?: boolean }
  | { type: 'fnSignal'; deps: string[]; hoistedFn: string; hoistedStr: string; isObjectExpr?: boolean };

type IdentifierNode = Extract<AstNode, { type: 'Identifier' }>;
type MemberExpressionNode = Extract<AstNode, { type: 'MemberExpression' }>;
type AstNodeList = ReadonlyArray<AstNode | null | undefined>;

// --- AST traversal helpers ---------------------------------------------------

/**
 * Walk all AST child nodes of `node`, calling `visitor` on each.
 * Skips position/type metadata keys automatically.
 */
function forEachChildNode(
  node: AstNode | null | undefined,
  visitor: (child: AstNode, key: string, parent: AstNode) => void,
): void {
  if (!node) return;

  const record = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') {
      continue;
    }

    const value = record[key];
    if (!value || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          visitor(item as AstNode, key, node);
        }
      }
      continue;
    }

    if (isAstNode(value)) {
      visitor(value as AstNode, key, node);
    }
  }
}

// --- Node type detection -----------------------------------------------------

const GLOBAL_NAMES = new Set([
  'window', 'document', 'globalThis', 'navigator', 'location', 'history',
  'screen', 'localStorage', 'sessionStorage', 'console', 'Math', 'JSON',
  'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'undefined',
  'NaN', 'Infinity',
]);

/** Detect `x.value` MemberExpression pattern (signal value access). */
export function isSignalValueAccess(
  node: AstNode | null | undefined,
): node is MemberExpressionNode {
  return (
    node != null &&
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'value'
  );
}

/**
 * Detect `props.field` or `store.field` where the object is a local variable.
 * Only matches single-level member access. Excludes `.value` (that's signal).
 */
export function isStoreFieldAccess(
  node: AstNode | null | undefined,
  importedNames: Set<string>,
  localNames?: Set<string>,
): node is MemberExpressionNode {
  if (node == null || node.type !== 'MemberExpression') return false;
  if (node.object?.type !== 'Identifier') return false;

  const objName = node.object.name;
  if (importedNames.has(objName)) return false;
  if (GLOBAL_NAMES.has(objName)) return false;

  // Unknown globals (not imported, not in GLOBAL_NAMES, not local) are skipped
  // to match SWC behavior of only analyzing known-scope identifiers
  if (localNames && !localNames.has(objName)) return false;

  const propName = getPropertyName(node);
  if (propName == null || propName === 'value') return false;

  return true;
}

/**
 * Extract property name from a MemberExpression.
 * Handles both dot access (x.foo) and computed string access (x['foo']).
 */
function getPropertyName(node: MemberExpressionNode): string | null {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (
    node.computed &&
    node.property.type === 'Literal' &&
    typeof node.property.value === 'string'
  ) {
    return node.property.value;
  }
  return null;
}

// --- Expression analysis -----------------------------------------------------

/** Check if the expression tree contains JSX elements or fragments. */
function containsJsx(node: AstNode | AstNodeList | null | undefined): boolean {
  if (node == null) return false;
  if (Array.isArray(node)) return node.some((child) => containsJsx(child));
  const currentNode = node as AstNode;
  if (currentNode.type === 'JSXElement' || currentNode.type === 'JSXFragment') return true;
  let found = false;
  forEachChildNode(currentNode, (child) => {
    if (!found && containsJsx(child)) found = true;
  });
  if (found) return true;
  return false;
}

/**
 * Check if an expression contains a standalone function call whose callee is
 * NOT an imported name. Method calls (obj.method()) are allowed in signal
 * expressions -- only standalone fn() calls block wrapping.
 */
function containsUnknownCall(node: AstNode | null | undefined, importedNames: Set<string>): boolean {
  if (node == null) return false;

  if (node.type === 'CallExpression') {
    if (node.callee?.type !== 'MemberExpression' && node.callee?.type !== 'ChainExpression') {
      const calleeName = getCalleeIdentifierName(node.callee);
      if (calleeName == null || !importedNames.has(calleeName)) {
        return true;
      }
    }
  }

  // Tagged template expressions are effectively function calls
  if (node.type === 'TaggedTemplateExpression') return true;

  let found = false;
  forEachChildNode(node, (child) => {
    if (!found && containsUnknownCall(child, importedNames)) found = true;
  });
  return found;
}

function getCalleeIdentifierName(callee: AstNode | null | undefined): string | null {
  if (callee?.type === 'Identifier') return callee.name;
  return null;
}

/** Check if expression references any imported name directly (not through member access). */
function containsImportedReference(node: AstNode | null | undefined, importedNames: Set<string>): boolean {
  if (node == null) return false;
  if (node.type === 'Identifier' && importedNames.has(node.name)) return true;

  let found = false;
  forEachChildNode(node, (child) => {
    if (!found && containsImportedReference(child, importedNames)) found = true;
  });
  return found;
}

// --- Reactive root detection -------------------------------------------------

/** Get the root identifier name of a member expression chain. */
function getMemberChainRoot(node: AstNode): string | null {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return getMemberChainRoot(node.object);
  return null;
}

/** Get the depth of a member chain. `store.field` = 1, `store.a.b` = 2. */
function getMemberChainDepth(node: AstNode): number {
  if (node.type !== 'MemberExpression') return 0;
  return 1 + getMemberChainDepth(node.object);
}

/** Check if a MemberExpression is a deep store access (depth >= 2) on a local identifier. */
function isDeepStoreAccess(
  node: AstNode,
  importedNames: Set<string>,
  localNames?: Set<string>,
): node is MemberExpressionNode {
  if (node.type !== 'MemberExpression') return false;
  if (getMemberChainDepth(node) < 2) return false;

  const root = getMemberChainRoot(node);
  if (root == null) return false;
  if (importedNames.has(root)) return false;
  if (GLOBAL_NAMES.has(root)) return false;
  if (localNames && !localNames.has(root)) return false;
  return true;
}

/**
 * Collect all non-imported identifier names from an expression.
 * Used for complex `.value` objects like `(a || b).value`.
 */
function collectIdentifiersFromExpr(
  node: AstNode | null | undefined,
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
  forEachChildNode(node, (child) => {
    collectIdentifiersFromExpr(child, importedNames, seen, roots);
  });
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
  node: AstNode,
  importedNames: Set<string>,
  localNames?: Set<string>,
): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();

  function walk(n: AstNode | null | undefined): void {
    if (n == null) return;

    if (isSignalValueAccess(n)) {
      const root = getMemberChainRoot(n.object);
      if (root != null) {
        if (!seen.has(root)) { seen.add(root); roots.push(root); }
        return;
      }
      // Complex expression like (a || b).value -- collect all identifiers
      collectIdentifiersFromExpr(n.object, importedNames, seen, roots);
      return;
    }

    if (isDeepStoreAccess(n, importedNames, localNames)) {
      const root = getMemberChainRoot(n);
      if (root != null && !seen.has(root)) { seen.add(root); roots.push(root); }
      return;
    }

    if (isStoreFieldAccess(n, importedNames, localNames)) {
      const memberNode = n as MemberExpressionNode;
      const root = getMemberChainRoot(memberNode.object);
      if (root != null && !seen.has(root)) { seen.add(root); roots.push(root); }
      return;
    }

    forEachChildNode(n, (child) => walk(child));
  }

  walk(node);
  return roots;
}

/**
 * Collect ALL dependency identifiers from an expression: reactive roots
 * (signal.value, store accesses) PLUS bare local identifiers.
 *
 * Used after confirming reactive roots exist -- bare local identifiers also
 * become deps since _fnSignal needs to track all mutable values for re-evaluation.
 *
 * Returns unique dep names sorted alphabetically (matching SWC's compute_scoped_idents).
 */
function collectAllDeps(
  node: AstNode,
  importedNames: Set<string>,
): string[] {
  const reactiveRoots: string[] = [];
  const bareIdents: string[] = [];
  const seen = new Set<string>();

  function walk(n: AstNode | null | undefined): void {
    if (n == null) return;

    if (isSignalValueAccess(n)) {
      const root = getMemberChainRoot(n.object);
      if (root != null && !seen.has(root)) { seen.add(root); reactiveRoots.push(root); }
      return;
    }

    if (isDeepStoreAccess(n, importedNames)) {
      const root = getMemberChainRoot(n);
      if (root != null && !seen.has(root)) { seen.add(root); reactiveRoots.push(root); }
      return;
    }

    if (isStoreFieldAccess(n, importedNames)) {
      const memberNode = n as MemberExpressionNode;
      const root = getMemberChainRoot(memberNode.object);
      if (root != null && !seen.has(root)) { seen.add(root); reactiveRoots.push(root); }
      return;
    }

    if (n.type === 'Identifier' && !importedNames.has(n.name) && !GLOBAL_NAMES.has(n.name)) {
      if (!seen.has(n.name)) { seen.add(n.name); bareIdents.push(n.name); }
      return;
    }

    forEachChildNode(n, (child, key, parent) => {
      // Object literal keys and non-computed member property names aren't deps
      if (key === 'key' && parent.type === 'Property') return;
      if (
        key === 'property' &&
        parent.type === 'MemberExpression' &&
        !parent.computed
      ) {
        return;
      }
      walk(child);
    });
  }

  walk(node);
  const allDeps = [...reactiveRoots, ...bareIdents];
  allDeps.sort((a, b) => a.localeCompare(b));
  return allDeps;
}

// --- fnSignal generation -----------------------------------------------------

/**
 * Generate hoisted function body by replacing reactive root names with pN parameters.
 * Returns both the full function (preserving original spacing) and a minimal-whitespace
 * string representation (matching SWC's AST-reprinted output).
 */
function generateFnSignal(
  exprNode: AstNode,
  source: string,
  roots: string[],
): { hoistedFn: string; hoistedStr: string } {
  const rootToParam = new Map<string, string>();
  for (let i = 0; i < roots.length; i++) {
    rootToParam.set(roots[i], `p${i}`);
  }

  const exprText = source.slice(exprNode.start, exprNode.end);
  const exprStart = exprNode.start;

  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  function collectReplacements(
    n: AstNode | null | undefined,
    parentKey?: string,
    parentNode?: AstNode | null,
  ): void {
    if (n == null) return;

    // For signal.value or deep store access, replace the root identifier
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
      // Complex object expression (e.g., (a || b).value) -- recurse to find identifiers
      if (isSignalValueAccess(n) && !rootId) {
        collectReplacements(n.object);
        return;
      }
      return;
    }

    // Single-level store field access (e.g., _rawProps.fromProps)
    if (isStoreFieldAccess(n, new Set())) {
      const memberNode = n as MemberExpressionNode;
      const rootId = findRootIdentifier(memberNode.object);
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
      const isPropertyKey = parentKey === 'key' && parentNode?.type === 'Property';
      const isMemberProp =
        parentKey === 'property' &&
        parentNode?.type === 'MemberExpression' &&
        !parentNode.computed;
      if (!isPropertyKey && !isMemberProp) {
        replacements.push({
          start: n.start - exprStart,
          end: n.end - exprStart,
          replacement: rootToParam.get(n.name)!,
        });
      }
      return;
    }

    forEachChildNode(n, (child, key, parent) => collectReplacements(child, key, parent));
  }

  collectReplacements(exprNode);

  // Apply replacements in source order
  replacements.sort((a, b) => a.start - b.start);
  let fnBody = '';
  let pos = 0;
  for (const r of replacements) {
    fnBody += exprText.slice(pos, r.start);
    fnBody += r.replacement;
    pos = r.end;
  }
  fnBody += exprText.slice(pos);

  const params = roots.map((_, i) => `p${i}`).join(',');

  // Object expressions need wrapping parens so the arrow returns an object, not a block
  const needsParens = exprNode.type === 'ObjectExpression';
  const hoistedFn = needsParens
    ? `(${params})=>(${fnBody})`
    : `(${params})=>${fnBody}`;

  // String representation: minimal whitespace, double-quoted strings (matching SWC)
  let strBody = stripTrailingCommas(normalizeStringQuotes(removeWhitespace(fnBody)));
  strBody = stripOuterParens(strBody);
  strBody = stripTernaryConditionParens(strBody);

  const hoistedStr = strBody.includes('"')
    ? `'${strBody}'`
    : `"${strBody}"`;

  return { hoistedFn, hoistedStr };
}

/** Find the root Identifier node at the base of a member chain. */
function findRootIdentifier(node: AstNode | null | undefined): IdentifierNode | null {
  if (!node) return null;
  if (node.type === 'Identifier') return node;
  if (node.type === 'MemberExpression') return findRootIdentifier(node.object);
  return null;
}

// --- String normalization for hoisted string representation ------------------

/**
 * Remove whitespace around operators for the minimal string representation.
 * Preserves whitespace inside string literals. Inserts a space only where
 * adjacent tokens would merge (e.g., keyword boundaries like `in`, `instanceof`).
 *
 * NOTE: This is intentionally a character-level tokenizer rather than AST-based.
 * It operates on tiny expression fragments (already extracted from AST nodes)
 * to produce a minimal serialized form matching SWC's AST-reprinted output.
 * Re-parsing these fragments would be more complex than the tokenizer itself.
 */
function removeWhitespace(text: string): string {
  const tokens: string[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // String literal
    if (ch === '"' || ch === "'") {
      let tok = ch;
      i++;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === '\\') { tok += text[i]; i++; }
        if (i < text.length) { tok += text[i]; i++; }
      }
      if (i < text.length) { tok += text[i]; i++; }
      tokens.push(tok);
      continue;
    }

    // Template literal
    if (ch === '`') {
      let tok = ch;
      i++;
      while (i < text.length && text[i] !== '`') {
        tok += text[i];
        i++;
      }
      if (i < text.length) { tok += text[i]; i++; }
      tokens.push(tok);
      continue;
    }

    // Run of non-whitespace, non-string chars
    let tok = '';
    while (i < text.length) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') break;
      if (c === '"' || c === "'" || c === '`') break;
      tok += c;
      i++;
    }
    if (tok) tokens.push(tok);
  }

  // Join tokens, inserting space only where two word-like chars would merge
  let result = '';
  for (let t = 0; t < tokens.length; t++) {
    if (t > 0) {
      const prevLast = result[result.length - 1];
      const curFirst = tokens[t][0];
      if (isWordChar(prevLast) && isWordChar(curFirst)) {
        result += ' ';
      }
    }
    result += tokens[t];
  }

  return result;
}

function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9_$]/.test(ch);
}

/** Strip trailing commas before closing delimiters. SWC re-serializes from AST so these drop. */
function stripTrailingCommas(text: string): string {
  return text.replace(trailingComma, '$1');
}

/**
 * Skip past a string or template literal starting at position `i`.
 * Returns the index of the character after the closing delimiter.
 */
function skipStringLiteral(text: string, i: number): number {
  const ch = text[i];
  if (ch === '"' || ch === "'") {
    const q = ch;
    i++;
    while (i < text.length && text[i] !== q) {
      if (text[i] === '\\') i++;
      i++;
    }
    return i; // on closing quote; caller's for-loop will advance past it
  }
  if (ch === '`') {
    i++;
    while (i < text.length && text[i] !== '`') {
      if (text[i] === '\\') { i++; }
      else if (text[i] === '$' && i + 1 < text.length && text[i + 1] === '{') {
        i += 2;
        let depth = 1;
        while (i < text.length && depth > 0) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') depth--;
          i++;
        }
        i--; // will be incremented by caller
      }
      i++;
    }
    return i;
  }
  return i;
}

/**
 * Find the matching close-paren for an open paren at position 0.
 * Skips string/template literals. Returns -1 if not found.
 *
 * NOTE: Intentionally text-based. Used by stripOuterParens/stripTernaryConditionParens
 * on tiny expression fragments during serialization. Not worth re-parsing.
 */
function findMatchingParen(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipStringLiteral(text, i);
    }
  }
  return -1;
}

/**
 * Strip balanced outer parentheses that wrap the entire expression.
 * SWC generates the str from AST reprinting which omits unnecessary parens.
 */
function stripOuterParens(text: string): string {
  while (text.length >= 2 && text[0] === '(') {
    const matchPos = findMatchingParen(text);
    if (matchPos === text.length - 1) {
      // Parens wrap entire expression -- strip them
      text = text.slice(1, -1);
    } else {
      // Parens wrap a sub-expression at the start -- don't strip
      break;
    }
  }
  return text;
}

/**
 * Strip redundant parentheses around a ternary condition.
 * `(cond)?cons:alt` -> `cond?cons:alt`
 * SWC's AST reprinting omits grouping parens that don't affect ternary precedence.
 */
function stripTernaryConditionParens(text: string): string {
  if (text.length < 4 || text[0] !== '(') return text;

  const matchPos = findMatchingParen(text);

  // If the matched close paren is immediately followed by '?', the parens are redundant
  if (matchPos > 0 && matchPos < text.length - 1 && text[matchPos + 1] === '?') {
    return text.slice(1, matchPos) + text.slice(matchPos + 1);
  }

  return text;
}

/**
 * Normalize single-quoted string literals to double quotes.
 * Matches SWC behavior: re-serialized AST uses double quotes.
 *
 * NOTE: Intentionally character-level. Operates on tiny serialized expression
 * fragments to match SWC's double-quote convention. Not worth re-parsing.
 */
function normalizeStringQuotes(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      let j = i + 1;
      let content = '';
      while (j < text.length && text[j] !== "'") {
        if (text[j] === '\\') {
          if (text[j + 1] === "'") {
            // Escaped single quote -> unescaped in double-quote context
            content += "'";
            j += 2;
          } else {
            content += text[j] + text[j + 1];
            j += 2;
          }
        } else {
          if (text[j] === '"') {
            content += '\\"';
          } else {
            content += text[j];
          }
          j++;
        }
      }
      result += '"' + content + '"';
      i = j;
    } else if (ch === '"') {
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
      if (i < text.length) result += text[i];
    } else {
      result += ch;
    }
  }
  return result;
}

// --- Main analysis function --------------------------------------------------

/**
 * Analyze a JSX prop expression to determine if it should be wrapped
 * with _wrapProp, converted to _fnSignal, or left as-is.
 */
export function analyzeSignalExpression(
  exprNode: AstNode | null | undefined,
  source: string,
  importedNames: Set<string>,
  localNames?: Set<string>,
): SignalExprResult {
  if (exprNode == null) return { type: 'none' };

  // Literals are never wrapped
  if (exprNode.type === 'Literal') {
    return { type: 'none' };
  }

  if (exprNode.type === 'Identifier') {
    return { type: 'none' };
  }

  // Template literals without expressions are static
  if (
    exprNode.type === 'TemplateLiteral' &&
    (!exprNode.expressions || exprNode.expressions.length === 0)
  ) {
    return { type: 'none' };
  }

  // ChainExpression: analyze the whole chain (preserving `?.` syntax)
  if (exprNode.type === 'ChainExpression') {
    return tryBuildFnSignal(exprNode, source, importedNames, localNames);
  }

  if (exprNode.type === 'CallExpression') {
    return analyzeCallExpression(exprNode, source, importedNames, localNames);
  }

  if (exprNode.type === 'MemberExpression') {
    return analyzeMemberExpression(exprNode, source, importedNames, localNames);
  }

  // Object/array expressions with reactive values get wrapped in _fnSignal
  if (exprNode.type === 'ObjectExpression') {
    const roots = collectReactiveRoots(exprNode, importedNames, localNames);
    if (roots.length === 0) return { type: 'none' };
    const allDeps = collectAllDeps(exprNode, importedNames);
    const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, allDeps);
    return { type: 'fnSignal', deps: allDeps, hoistedFn, hoistedStr, isObjectExpr: true };
  }

  if (exprNode.type === 'ArrayExpression') {
    const roots = collectReactiveRoots(exprNode, importedNames, localNames);
    if (roots.length === 0) return { type: 'none' };
    const allDeps = collectAllDeps(exprNode, importedNames);
    const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, allDeps);
    return { type: 'fnSignal', deps: allDeps, hoistedFn, hoistedStr };
  }

  // Compound expressions (binary, conditional, logical, template)
  if (
    exprNode.type === 'BinaryExpression' ||
    exprNode.type === 'ConditionalExpression' ||
    exprNode.type === 'LogicalExpression' ||
    exprNode.type === 'TemplateLiteral'
  ) {
    return tryBuildFnSignal(exprNode, source, importedNames, localNames);
  }

  return { type: 'none' };
}

/**
 * Try to build an _fnSignal for an expression that may contain reactive roots.
 * Returns 'none' if the expression has blockers (unknown calls, imported refs, JSX)
 * or no reactive roots.
 */
function tryBuildFnSignal(
  exprNode: AstNode,
  source: string,
  importedNames: Set<string>,
  localNames?: Set<string>,
): SignalExprResult {
  const roots = collectReactiveRoots(exprNode, importedNames, localNames);
  if (roots.length === 0) return { type: 'none' };

  if (containsUnknownCall(exprNode, importedNames)) return { type: 'none' };
  if (containsImportedReference(exprNode, importedNames)) return { type: 'none' };
  if (containsJsx(exprNode)) return { type: 'none' };

  const allDeps = collectAllDeps(exprNode, importedNames);
  const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, allDeps);
  return { type: 'fnSignal', deps: allDeps, hoistedFn, hoistedStr };
}

function analyzeCallExpression(
  exprNode: Extract<AstNode, { type: 'CallExpression' }>,
  source: string,
  importedNames: Set<string>,
  localNames?: Set<string>,
): SignalExprResult {
  const calleeName = getCalleeIdentifierName(exprNode.callee);
  if (calleeName === 'mutable') return { type: 'none' };
  if (isSignalValueAccess(exprNode.callee)) return { type: 'none' };

  return tryBuildFnSignal(exprNode, source, importedNames, localNames);
}

function analyzeMemberExpression(
  exprNode: Extract<AstNode, { type: 'MemberExpression' }>,
  source: string,
  importedNames: Set<string>,
  localNames?: Set<string>,
): SignalExprResult {
  // Unwrap TS type assertions to find the underlying identifier
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

  // SWC only applies signal treatment to identifiers it can resolve in scope
  const isKnownIdent = objIdent === null ||
    importedNames.has(objIdent) ||
    GLOBAL_NAMES.has(objIdent) ||
    (localNames?.has(objIdent) ?? true);

  // signal.value -> _wrapProp for simple identifiers, _fnSignal for complex ones
  if (isSignalValueAccess(exprNode) && isKnownIdent) {
    if (objIdent !== null) {
      return { type: 'wrapProp', code: `_wrapProp(${objIdent})` };
    }
    // Complex expression: (a || b).value -> _fnSignal
    const roots = collectReactiveRoots(exprNode, importedNames, localNames);
    if (roots.length > 0) {
      const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, roots);
      return { type: 'fnSignal', deps: roots, hoistedFn, hoistedStr };
    }
    const objText = source.slice(exprNode.object.start, exprNode.object.end);
    return { type: 'wrapProp', code: `_wrapProp(${objText})` };
  }

  // Deep store access (store.address.city.name) -> fnSignal
  if (isKnownIdent && isDeepStoreAccess(exprNode, importedNames, localNames)) {
    const roots = collectReactiveRoots(exprNode, importedNames, localNames);
    if (roots.length > 0) {
      const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, roots);
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

  return { type: 'none' };
}

// --- SignalHoister -----------------------------------------------------------

/** Manages hoisted signal functions (_hf0, _hf1, etc.) for a module. */
export class SignalHoister {
  counter = 0;
  hoistedFunctions: Array<{ name: string; fn: string; str: string; sourcePos: number }> = [];
  private dedupMap = new Map<string, string>();

  /**
   * Add a hoisted function, returns the _hfN name.
   * Deduplicates: identical function bodies reuse their existing name.
   */
  hoist(fn: string, str: string, sourcePos: number = 0): string {
    const existing = this.dedupMap.get(fn);
    if (existing) return existing;

    const name = `_hf${this.counter}`;
    this.hoistedFunctions.push({ name, fn, str, sourcePos });
    this.dedupMap.set(fn, name);
    this.counter++;
    return name;
  }

  /** Get all hoisted declarations as source text lines. */
  getDeclarations(): string[] {
    const lines: string[] = [];
    for (const h of this.hoistedFunctions) {
      lines.push(`const ${h.name} = ${h.fn};`);
      lines.push(`const ${h.name}_str = ${h.str};`);
    }
    return lines;
  }

  /**
   * Build a renaming map that renumbers _hf variables by source position order.
   * SWC processes elements top-down (props before children) but our walk is
   * bottom-up (leave callback). This renumbers from walk order to source order.
   * Returns null if already in order.
   */
  buildRenameMap(): Map<string, string> | null {
    if (this.hoistedFunctions.length <= 1) return null;

    const sorted = [...this.hoistedFunctions].sort((a, b) => a.sourcePos - b.sourcePos);

    let needsRename = false;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].name !== `_hf${i}`) {
        needsRename = true;
        break;
      }
    }
    if (!needsRename) return null;

    const renameMap = new Map<string, string>();
    for (let i = 0; i < sorted.length; i++) {
      const oldName = sorted[i].name;
      const newName = `_hf${i}`;
      if (oldName !== newName) {
        renameMap.set(oldName, newName);
      }
    }

    this.hoistedFunctions = sorted.map((h, i) => ({
      ...h,
      name: `_hf${i}`,
    }));

    return renameMap;
  }
}
