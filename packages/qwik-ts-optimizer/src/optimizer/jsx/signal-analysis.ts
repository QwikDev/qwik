import { createRegExp, exactly, anyOf, global } from 'magic-regexp';
import type { AstMaybeNode, AstNode, AstParentNode } from '../../ast-types.js';
import { forEachAstChild, isAstNode, someAstDescendant, memberStaticPropName } from '../ast/guards.js';
import {
  applyReplacements,
  formatSimplifiedLiteral,
  lambdaBodySimplificationsCollector,
  simplifyExpression,
} from './simplify.js';
import {
  collectRangeReplacements,
  isReplaceableIdentifierPosition,
  type RangeReplacementCollector,
} from '../edit/range-replace.js';
import { quoteAsStringLiteral } from '../edit/string-literal.js';
import { addBindingNamesFromPatternToSet } from '../ast/binding-pattern.js';

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
type AstNodeList = ReadonlyArray<AstMaybeNode>;

function peelExpressionWrappers(node: AstMaybeNode): AstNode | null {
  let current: AstMaybeNode = node;
  while (current) {
    switch (current.type) {
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
      case 'TSSatisfiesExpression':
        current = current.expression;
        continue;
      default:
        return current;
    }
  }
  return null;
}

const GLOBAL_NAMES = new Set([
  'window', 'document', 'globalThis', 'navigator', 'location', 'history',
  'screen', 'localStorage', 'sessionStorage', 'console', 'Math', 'JSON',
  'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'undefined',
  'NaN', 'Infinity',
]);

function isSignalValueAccess(
  node: AstMaybeNode,
): node is MemberExpressionNode {
  return (
    node != null &&
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'value'
  );
}

function isStoreFieldAccess(
  node: AstMaybeNode,
  importedNames: Set<string>,
  localNames?: Set<string>,
): node is MemberExpressionNode {
  if (node == null || node.type !== 'MemberExpression') return false;
  if (node.object?.type !== 'Identifier') return false;

  const objName = node.object.name;
  if (importedNames.has(objName)) return false;
  if (GLOBAL_NAMES.has(objName)) return false;

  // Skip unknown globals (not imported, not in GLOBAL_NAMES, not local) —
  // only known-scope identifiers are analyzed.
  if (localNames && !localNames.has(objName)) return false;

  const propName = memberStaticPropName(node);
  if (propName == null || propName === 'value') return false;

  return true;
}

function containsJsx(node: AstMaybeNode): boolean {
  return someAstDescendant(node, (n) => n.type === 'JSXElement' || n.type === 'JSXFragment');
}

function containsUnknownCall(node: AstMaybeNode, importedNames: Set<string>): boolean {
  return someAstDescendant(node, (n) => {
    if (n.type === 'TaggedTemplateExpression') return true;
    if (n.type !== 'CallExpression') return false;
    if (n.callee?.type === 'MemberExpression' || n.callee?.type === 'ChainExpression') return false;
    const calleeName = getCalleeIdentifierName(n.callee);
    return calleeName == null || !importedNames.has(calleeName);
  });
}

function getCalleeIdentifierName(callee: AstMaybeNode): string | null {
  if (callee?.type === 'Identifier') return callee.name;
  return null;
}

function containsImportedReference(node: AstMaybeNode, importedNames: Set<string>): boolean {
  return someAstDescendant(node, (n) => n.type === 'Identifier' && importedNames.has(n.name));
}

/**
 * True when the expression contains a call outside an optional chain. Such a
 * call blocks hoisting: a serialized, reactively re-run `_fnSignal` body cannot
 * carry an arbitrary call, whereas an optional-chain getter (`a?.b()`) can.
 */
function containsNonOptionalCall(node: AstMaybeNode): boolean {
  return hasCallOutsideChainSpine(node, false);
}

function hasCallOutsideChainSpine(node: AstMaybeNode, inChainSpine: boolean): boolean {
  if (node == null) return false;

  if (node.type === 'ChainExpression') {
    return hasCallOutsideChainSpine(node.expression, true);
  }

  if (node.type === 'CallExpression') {
    if (!inChainSpine) return true;
    if (hasCallOutsideChainSpine(node.callee, true)) return true;
    for (const arg of node.arguments) {
      if (hasCallOutsideChainSpine(arg, false)) return true;
    }
    return false;
  }

  if (node.type === 'MemberExpression') {
    if (hasCallOutsideChainSpine(node.object, inChainSpine)) return true;
    if (node.computed && hasCallOutsideChainSpine(node.property, false)) return true;
    return false;
  }

  let found = false;
  forEachAstChild(node, (child) => {
    if (!found && hasCallOutsideChainSpine(child, false)) found = true;
  });
  return found;
}

function getMemberChainRoot(node: AstNode): string | null {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return getMemberChainRoot(node.object);
  return null;
}

function getMemberChainDepth(node: AstNode): number {
  if (node.type !== 'MemberExpression') return 0;
  return 1 + getMemberChainDepth(node.object);
}

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
 * Single-walk collector returning both `roots` (reactive roots, first-appearance
 * order) and `allDeps` (roots plus bare locally-bound identifiers, sorted). The
 * non-computed `MemberExpression.property` and `Property.key` positions are
 * excluded from both outputs — safe because signal/store detection happens at
 * the MemberExpression level, not the property Identifier.
 */
interface SignalDepsResult {
  roots: string[];
  allDeps: string[];
}

function collectSignalDeps(
  node: AstNode,
  importedNames: Set<string>,
  localNames?: Set<string>,
): SignalDepsResult {
  const roots: string[] = [];
  const bareIdents: string[] = [];
  const rootsSeen = new Set<string>();
  const allSeen = new Set<string>();
  const boundParams = new Set<string>();

  function addRoot(name: string | null): void {
    if (name == null) return;
    if (boundParams.has(name)) return;
    if (!rootsSeen.has(name)) {
      rootsSeen.add(name);
      roots.push(name);
    }
    allSeen.add(name);
  }

  function addBare(name: string): void {
    if (importedNames.has(name) || GLOBAL_NAMES.has(name)) return;
    if (boundParams.has(name)) return;
    if (allSeen.has(name)) return;
    allSeen.add(name);
    bareIdents.push(name);
  }

  function fallbackCollectIdents(n: AstMaybeNode): void {
    if (n == null) return;
    if (n.type === 'Identifier') {
      if (!importedNames.has(n.name)) addRoot(n.name);
      return;
    }
    forEachAstChild(n, (child) => fallbackCollectIdents(child));
  }

  // A store/signal chain's computed keys (`sig.value[key]`) are dependencies:
  // a loop-local key must be carried so the hoisted `_fnSignal` parameterizes
  // it, while module-scope keys stay free (resolvable at the hoist site).
  function walkComputedKeys(chainNode: AstMaybeNode): void {
    let cur: AstMaybeNode = chainNode;
    while (cur != null && cur.type === 'MemberExpression') {
      if (cur.computed && cur.property != null) walkKey(cur.property);
      cur = cur.object;
    }
  }

  function walkKey(keyNode: AstMaybeNode): void {
    if (keyNode == null) return;
    if (
      isSignalValueAccess(keyNode) ||
      isDeepStoreAccess(keyNode, importedNames, localNames) ||
      isStoreFieldAccess(keyNode, importedNames, localNames)
    ) {
      walk(keyNode);
      return;
    }
    if (keyNode.type === 'Identifier') {
      if (localNames == null || localNames.has(keyNode.name)) addBare(keyNode.name);
      return;
    }
    forEachAstChild(keyNode, (child) => walkKey(child));
  }

  function walk(n: AstMaybeNode): void {
    if (n == null) return;

    if (isSignalValueAccess(n)) {
      const root = getMemberChainRoot(n.object);
      if (root != null) {
        addRoot(root);
        walkComputedKeys(n.object);
        return;
      }
      fallbackCollectIdents(n.object);
      return;
    }

    if (isDeepStoreAccess(n, importedNames, localNames)) {
      addRoot(getMemberChainRoot(n));
      walkComputedKeys(n);
      return;
    }

    if (isStoreFieldAccess(n, importedNames, localNames)) {
      // Load-bearing cast: the preceding `isDeepStoreAccess` (also
      // `n is MemberExpressionNode`) has narrowed `n` such that re-narrowing
      // to the same type yields `never`.
      const memberNode = n as MemberExpressionNode;
      addRoot(getMemberChainRoot(memberNode.object));
      walkComputedKeys(memberNode.object);
      return;
    }

    if (n.type === 'Identifier') {
      addBare(n.name);
      return;
    }

    if (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') {
      const paramNames = new Set<string>();
      for (const param of n.params) addBindingNamesFromPatternToSet(param, paramNames);
      const introduced: string[] = [];
      for (const name of paramNames) {
        if (!boundParams.has(name)) {
          boundParams.add(name);
          introduced.push(name);
        }
      }
      descend(n);
      for (const name of introduced) boundParams.delete(name);
      return;
    }

    descend(n);
  }

  function descend(n: AstNode): void {
    forEachAstChild(n, (child, key, parent) => {
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

  const allDeps = [...roots, ...bareIdents];
  allDeps.sort((a, b) => a.localeCompare(b));
  return { roots, allDeps };
}

function collectReactiveRoots(
  node: AstNode,
  importedNames: Set<string>,
  localNames?: Set<string>,
): string[] {
  return collectSignalDeps(node, importedNames, localNames).roots;
}

/**
 * Generate a hoisted function body, replacing reactive root names with `pN`
 * params. Returns both the full function (original spacing) and a
 * minimal-whitespace serialized string form.
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

  // Root substitution and constant-subtree simplification share the
  // orchestrator; disjoint by construction — roots target Identifiers,
  // simplifications target Binary/Unary/Logical/Conditional with primitive
  // operands, so no node type overlaps.
  const rootCollector = rootReplacementsCollector(rootToParam);
  const replacements = collectRangeReplacements(
    exprNode, exprStart, exprText,
    [rootCollector],
  );
  const simplifications = collectRangeReplacements(
    exprNode, exprStart, exprText,
    [lambdaBodySimplificationsCollector()],
  );

  const strFnBody = applyReplacements(exprText, replacements);

  const lambdaFnBody = simplifications.length > 0
    ? applyReplacements(exprText, [...replacements, ...simplifications])
    : strFnBody;

  const params = roots.map((_, i) => `p${i}`).join(',');

  // Object expressions need wrapping parens so the arrow returns an object, not a block
  const needsParens = exprNode.type === 'ObjectExpression';
  const hoistedFn = needsParens
    ? `(${params})=>(${lambdaFnBody})`
    : `(${params})=>${lambdaFnBody}`;

  let strBody = stripTrailingCommas(normalizeStringQuotes(removeWhitespace(strFnBody)));
  strBody = stripOuterParens(strBody);
  strBody = stripTernaryConditionParens(strBody);

  const hoistedStr = quoteAsStringLiteral(strBody);

  return { hoistedFn, hoistedStr };
}

function collectComputedKeyRewrites(
  chainNode: AstNode,
  rootToParam: ReadonlyMap<string, string>,
  exprStart: number,
): Array<{ start: number; end: number; replacement: string }> {
  const reps: Array<{ start: number; end: number; replacement: string }> = [];
  function rewriteKey(node: AstMaybeNode, parentKey?: string, parentNode?: AstNode): void {
    if (node == null) return;
    if (node.type === 'Identifier') {
      if (
        parentKey === 'property' &&
        parentNode?.type === 'MemberExpression' &&
        !parentNode.computed
      ) return;
      const param = rootToParam.get(node.name);
      if (param != null) {
        reps.push({ start: node.start - exprStart, end: node.end - exprStart, replacement: param });
      }
      return;
    }
    forEachAstChild(node, (child, key, parent) => rewriteKey(child, key, parent));
  }
  let cur: AstMaybeNode = chainNode;
  while (cur != null && cur.type === 'MemberExpression') {
    if (cur.computed && cur.property != null) rewriteKey(cur.property, 'property', cur);
    cur = cur.object;
  }
  return reps;
}

function rootReplacementsCollector(
  rootToParam: ReadonlyMap<string, string>,
): RangeReplacementCollector {
  return (n, ctx) => {
    if (isSignalValueAccess(n) || isDeepStoreAccess(n, new Set())) {
      const keyRewrites = collectComputedKeyRewrites(n, rootToParam, ctx.exprStart);
      const rootId = findRootIdentifier(n);
      if (rootId && rootToParam.has(rootId.name)) {
        return {
          replacements: [
            {
              start: rootId.start - ctx.exprStart,
              end: rootId.end - ctx.exprStart,
              replacement: rootToParam.get(rootId.name)!,
            },
            ...keyRewrites,
          ],
          skipSubtree: true,
        };
      }
      if (isSignalValueAccess(n) && !rootId) {
        // Complex object (e.g. `(a || b).value`) — let orchestrator
        // recurse so the bare-identifier arm catches inner identifiers.
        return null;
      }
      return { replacements: keyRewrites, skipSubtree: true };
    }

    if (isStoreFieldAccess(n, new Set())) {
      const memberNode = n as MemberExpressionNode;
      const keyRewrites = collectComputedKeyRewrites(memberNode.object, rootToParam, ctx.exprStart);
      const rootId = findRootIdentifier(memberNode.object);
      if (rootId && rootToParam.has(rootId.name)) {
        return {
          replacements: [
            {
              start: rootId.start - ctx.exprStart,
              end: rootId.end - ctx.exprStart,
              replacement: rootToParam.get(rootId.name)!,
            },
            ...keyRewrites,
          ],
          skipSubtree: true,
        };
      }
      return { replacements: keyRewrites, skipSubtree: true };
    }

    if (
      n.type === 'Identifier' &&
      rootToParam.has(n.name) &&
      isReplaceableIdentifierPosition(ctx.parentKey, ctx.parentNode)
    ) {
      return {
        replacements: [{
          start: n.start - ctx.exprStart,
          end: n.end - ctx.exprStart,
          replacement: rootToParam.get(n.name)!,
        }],
        skipSubtree: true,
      };
    }

    return null;
  };
}

function findRootIdentifier(node: AstMaybeNode): IdentifierNode | null {
  if (!node) return null;
  if (node.type === 'Identifier') return node;
  if (node.type === 'MemberExpression') return findRootIdentifier(node.object);
  return null;
}

/**
 * Remove whitespace around operators for the minimal string form, preserving
 * whitespace inside string literals and inserting a space only where adjacent
 * tokens would merge (e.g. `in`, `instanceof`). Intentionally a character-level
 * tokenizer, not AST-based — it runs on tiny already-extracted fragments where
 * re-parsing would be more complex.
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

/** Strip trailing commas before closing delimiters (dropped by AST re-serialization). */
function stripTrailingCommas(text: string): string {
  return text.replace(trailingComma, '$1');
}

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
 * Find the matching close-paren for an open paren at position 0, skipping
 * string/template literals; returns -1 if not found. Intentionally text-based —
 * runs on tiny fragments where re-parsing isn't worth it.
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
 * Strip balanced outer parentheses that wrap the entire expression (unnecessary
 * parens are omitted by AST re-serialization).
 */
function stripOuterParens(text: string): string {
  while (text.length >= 2 && text[0] === '(') {
    const matchPos = findMatchingParen(text);
    if (matchPos === text.length - 1) {
      text = text.slice(1, -1);
    } else {
      break;
    }
  }
  return text;
}

/**
 * Strip redundant parentheses around a ternary condition:
 * `(cond)?cons:alt` -> `cond?cons:alt`.
 */
function stripTernaryConditionParens(text: string): string {
  if (text.length < 4 || text[0] !== '(') return text;

  const matchPos = findMatchingParen(text);

  if (matchPos > 0 && matchPos < text.length - 1 && text[matchPos + 1] === '?') {
    return text.slice(1, matchPos) + text.slice(matchPos + 1);
  }

  return text;
}

/**
 * Normalize single-quoted string literals to double quotes (the serialized
 * double-quote convention). Intentionally character-level — runs on tiny
 * fragments where re-parsing isn't worth it.
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

export function analyzeSignalExpression(
  exprNode: AstMaybeNode,
  source: string,
  importedNames: Set<string>,
  localNames?: Set<string>,
): SignalExprResult {
  const peeled = peelExpressionWrappers(exprNode);
  if (peeled == null) return { type: 'none' };
  if (peeled !== exprNode) {
    return analyzeSignalExpression(peeled, source, importedNames, localNames);
  }
  exprNode = peeled;

  if (exprNode.type === 'Literal') {
    return { type: 'none' };
  }

  if (exprNode.type === 'Identifier') {
    return { type: 'none' };
  }

  if (
    exprNode.type === 'TemplateLiteral' &&
    (!exprNode.expressions || exprNode.expressions.length === 0)
  ) {
    return { type: 'none' };
  }

  if (exprNode.type === 'ChainExpression') {
    return tryBuildFnSignal(exprNode, source, importedNames, localNames);
  }

  if (exprNode.type === 'CallExpression') {
    return analyzeCallExpression(exprNode, source, importedNames, localNames);
  }

  if (exprNode.type === 'MemberExpression') {
    return analyzeMemberExpression(exprNode, source, importedNames, localNames);
  }

  if (exprNode.type === 'ObjectExpression') {
    const { roots, allDeps } = collectSignalDeps(exprNode, importedNames, localNames);
    if (roots.length === 0) return { type: 'none' };
    if (containsNonOptionalCall(exprNode)) return { type: 'none' };
    const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, allDeps);
    return { type: 'fnSignal', deps: allDeps, hoistedFn, hoistedStr, isObjectExpr: true };
  }

  if (exprNode.type === 'ArrayExpression') {
    const { roots, allDeps } = collectSignalDeps(exprNode, importedNames, localNames);
    if (roots.length === 0) return { type: 'none' };
    if (containsNonOptionalCall(exprNode)) return { type: 'none' };
    const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, allDeps);
    return { type: 'fnSignal', deps: allDeps, hoistedFn, hoistedStr };
  }

  if (
    exprNode.type === 'BinaryExpression' ||
    exprNode.type === 'ConditionalExpression' ||
    exprNode.type === 'LogicalExpression' ||
    exprNode.type === 'UnaryExpression' ||
    exprNode.type === 'TemplateLiteral'
  ) {
    return tryBuildFnSignal(exprNode, source, importedNames, localNames);
  }

  return { type: 'none' };
}

function tryBuildFnSignal(
  exprNode: AstNode,
  source: string,
  importedNames: Set<string>,
  localNames?: Set<string>,
): SignalExprResult {
  const { roots, allDeps } = collectSignalDeps(exprNode, importedNames, localNames);
  if (roots.length === 0) return { type: 'none' };

  if (containsUnknownCall(exprNode, importedNames)) return { type: 'none' };
  if (containsNonOptionalCall(exprNode)) return { type: 'none' };
  if (containsImportedReference(exprNode, importedNames)) return { type: 'none' };
  if (containsJsx(exprNode)) return { type: 'none' };

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
  const unwrapped = peelExpressionWrappers(exprNode.object);
  const objIdent = unwrapped?.type === 'Identifier' ? unwrapped.name : null;

  // Only apply signal treatment to identifiers resolvable in scope.
  const isKnownIdent = objIdent === null ||
    importedNames.has(objIdent) ||
    GLOBAL_NAMES.has(objIdent) ||
    (localNames?.has(objIdent) ?? true);

  if (isSignalValueAccess(exprNode) && isKnownIdent) {
    if (objIdent !== null) {
      return { type: 'wrapProp', code: `_wrapProp(${objIdent})` };
    }
    const roots = collectReactiveRoots(exprNode, importedNames, localNames);
    if (roots.length > 0) {
      const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, roots);
      return { type: 'fnSignal', deps: roots, hoistedFn, hoistedStr };
    }
    const objText = source.slice(exprNode.object.start, exprNode.object.end);
    return { type: 'wrapProp', code: `_wrapProp(${objText})` };
  }

  if (isKnownIdent && isDeepStoreAccess(exprNode, importedNames, localNames)) {
    const roots = collectReactiveRoots(exprNode, importedNames, localNames);
    if (roots.length > 0) {
      const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, roots);
      return { type: 'fnSignal', deps: roots, hoistedFn, hoistedStr };
    }
  }

  if (isKnownIdent && isStoreFieldAccess(exprNode, importedNames, localNames)) {
    const objText = source.slice(exprNode.object.start, exprNode.object.end);
    const propName = memberStaticPropName(exprNode)!;
    return {
      type: 'wrapProp',
      code: `_wrapProp(${objText}, "${propName}")`,
      isStoreField: true,
    };
  }

  // Computed non-literal property (`results[i]`, `obj[key]`, `obj[42]`) — the
  // case the branches above miss: `exprNode.computed === true` and the property
  // isn't a string literal (so `isStoreFieldAccess` didn't fire). Emits
  // `_fnSignal((p0,p1) => p1[p0], deps, str)`.
  if (isKnownIdent && exprNode.computed) {
    const { allDeps } = collectSignalDeps(exprNode, importedNames, localNames);
    if (
      allDeps.length > 0 &&
      !containsUnknownCall(exprNode, importedNames) &&
      !containsNonOptionalCall(exprNode) &&
      !containsImportedReference(exprNode, importedNames) &&
      !containsJsx(exprNode)
    ) {
      const { hoistedFn, hoistedStr } = generateFnSignal(exprNode, source, allDeps);
      return { type: 'fnSignal', deps: allDeps, hoistedFn, hoistedStr };
    }
  }

  return { type: 'none' };
}

export class SignalHoister {
  counter = 0;
  hoistedFunctions: Array<{ name: string; fn: string; str: string; sourcePos: number }> = [];
  private dedupMap = new Map<string, string>();

  hoist(fn: string, str: string, sourcePos: number = 0): string {
    const existing = this.dedupMap.get(fn);
    if (existing) return existing;

    const name = `_hf${this.counter}`;
    this.hoistedFunctions.push({ name, fn, str, sourcePos });
    this.dedupMap.set(fn, name);
    this.counter++;
    return name;
  }

  getDeclarations(): string[] {
    const lines: string[] = [];
    for (const h of this.hoistedFunctions) {
      lines.push(`const ${h.name} = ${h.fn};`);
      lines.push(`const ${h.name}_str = ${h.str};`);
    }
    return lines;
  }

  /**
   * Build a map renumbering `_hf` variables to source-position order. The walk
   * is bottom-up (leave callback), so emitted `_hf` numbers must be remapped to
   * top-down source order. Returns null if already in order.
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
