/**
 * JSX element transformation module for the Qwik optimizer.
 *
 * Converts JSX syntax to _jsxSorted/_jsxSplit function calls with
 * correct prop classification (varProps/constProps), flags computation,
 * key generation, spread handling, and fragment support.
 */

import type MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import { forEachAstChild } from '../utils/ast.js';
import type { AstNode, AstProgram, Expression, JSXElementName } from '../../ast-types.js';
import { SignalHoister } from '../signal-analysis.js';
import { collectPassiveDirectives } from './event-handlers.js';
import { detectLoopContext, type LoopContext } from '../loop-hoisting.js';
import { computeKeyPrefix } from '../key-prefix.js';

// Re-export for consumers
export { processChildren } from './jsx-children.js';
export {
  processProps,
  formatPropName,
  isRewrittenEventEntry,
  sortVarEntries,
} from './jsx-props.js';

export interface JsxTransformResult {
  tag: string;
  varProps: string | null;
  constProps: string | null;
  children: string | null;
  flags: number;
  key: string | null;
  callString: string;
  neededImports: Set<string>;
}

export interface JsxTransformOutput {
  neededImports: Set<string>;
  needsFragment: boolean;
  hoistedDeclarations: string[];
  keyCounterValue: number;
}

/**
 * Shared plumbing + scope information threaded through the JSX transform
 * for a single `transformAllJsx` invocation. Consumers (`transformJsxElement`,
 * `processProps`, future `transformJsxFragment` / `processChildren` refactors)
 * read a subset; the context is constant across every element in one call.
 */
export interface JsxTransformContext {
  source: string;
  s: MagicString;
  importedNames: Set<string>;
  keyCounter: JsxKeyCounter;
  signalHoister: SignalHoister;
  constIdents?: Set<string>;
  allDeclaredNames?: Set<string>;
  paramNames?: Set<string>;
  qrlsWithCaptures?: Set<string>;
}

/** Per-element options for `transformJsxElement`. All fields are optional. */
export interface JsxElementOptions {
  passiveEvents?: Set<string>;
  loopCtx?: LoopContext | null;
  isSoleChild?: boolean;
  enableChildSignals?: boolean;
  qpOverrides?: Map<number, string[]>;
}

/** Per-call options for `processProps`. */
export interface ProcessPropsOptions {
  tagIsHtml: boolean;
  passiveEvents: Set<string>;
  inLoop?: boolean;
  /**
   * Skip signal analysis for prop value expressions. Set to `true` when the
   * caller intends to lower the element to `_createElement` (spread + key
   * variant), since that path emits prop values verbatim and any
   * `_fnSignal` hoists for those values would be unreachable.
   */
  skipSignalAnalysis?: boolean;
}

export function isConstBindingName(
  name: string | null,
  importedNames: Set<string>,
  constIdents?: Set<string>,
): boolean {
  if (!name) {
    return false;
  }
  return importedNames.has(name) || (constIdents?.has(name) ?? false);
}

/**
 * Extract a non-computed Property key as a string. Returns the identifier
 * name for `{x: ...}`, the stringified value for `{"x": ...}` / `{1: ...}`,
 * or null for any shape that can't be resolved statically.
 */
function staticPropKeyName(key: AstNode | null | undefined): string | null {
  if (!key) return null;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal') return String(key.value);
  return null;
}

function isReturnStatic(init: Expression | null | undefined): boolean {
  if (!init) return true;
  if (init.type === 'CallExpression' && init.callee.type === 'Identifier') {
    const calleeName = init.callee.name;
    return calleeName.endsWith('$') || calleeName.endsWith('Qrl') || calleeName.startsWith('use');
  }
  return false;
}

export interface ConstAndLocalNames {
  /** Const-bound identifiers whose initializer is `isReturnStatic` —
   * treated as immutable references for prop classification. */
  constBindings: Set<string>;
  /** Every locally declared identifier name (any binding kind) — used to
   * distinguish known locals from unknown globals for signal analysis. */
  allLocalNames: Set<string>;
}

/**
 * Single-pass collection of both `constBindings` (const-declared idents with
 * static initializers) and `allLocalNames` (every locally declared ident).
 *
 * Each binding-introducing node feeds the right output(s):
 * - `VariableDeclaration`: always `addIdent` per declarator for
 *   `allLocalNames`; if `kind === 'const'`, also `walkPatternInit` to classify
 *   leaf bindings for `constBindings`.
 * - `FunctionDeclaration` / `ClassDeclaration` name, function params,
 *   `CatchClause` param, `ForIn/ForOfStatement` left-hand pattern: `addIdent`
 *   only.
 */
export function collectConstAndLocalNames(program: AstProgram): ConstAndLocalNames {
  const constBindings = new Set<string>();
  const allLocalNames = new Set<string>();

  function addIdent(node: AstNode | null | undefined): void {
    if (!node) return;
    if (node.type === 'Identifier') {
      allLocalNames.add(node.name);
    } else if (node.type === 'ArrayPattern') {
      for (const elem of node.elements) {
        if (elem) addIdent(elem.type === 'RestElement' ? elem.argument : elem);
      }
    } else if (node.type === 'ObjectPattern') {
      for (const prop of node.properties) {
        if (prop.type === 'RestElement') {
          addIdent(prop.argument);
        } else {
          addIdent(prop.value);
        }
      }
    } else if (node.type === 'AssignmentPattern') {
      addIdent(node.left);
    }
  }

  /** Walk a destructure pattern and its initializer in parallel. For each
   * leaf binding, classify it as const iff the corresponding init expression
   * is `isReturnStatic`. This catches compound destructures where the init
   * is an ArrayExpression / ObjectExpression literal whose individual
   * elements are themselves const-stable (e.g. `const [store, math] =
   * [useStore(...), Math.random()]` → `store` const, `math` not). Without
   * this, the source-level destructure form would leave all bindings
   * unclassified because the top-level init isn't a single call. */
  function walkPatternInit(id: AstNode | null | undefined, init: Expression | null | undefined): void {
    if (!id) return;
    if (id.type === 'Identifier') {
      if (isReturnStatic(init)) constBindings.add(id.name);
      return;
    }
    if (id.type === 'ArrayPattern') {
      const elems = id.elements;
      if (init && init.type === 'ArrayExpression') {
        for (let i = 0; i < elems.length; i++) {
          const elem = elems[i];
          // RestElement isn't tracked — the rest binding's init is the
          // "remainder" of the array, not const-foldable per-elem.
          if (!elem || elem.type === 'RestElement') continue;
          const initElem = init.elements?.[i] ?? null;
          // SpreadElement in an array literal isn't a per-position init
          // we can pair with the destructure slot; skip.
          if (initElem && initElem.type === 'SpreadElement') continue;
          walkPatternInit(elem, initElem);
        }
      } else {
        // Non-array-literal init (e.g. `const [a] = fn()`): treat all
        // bindings under the same init.
        for (const elem of elems) {
          if (!elem || elem.type === 'RestElement') continue;
          walkPatternInit(elem, init);
        }
      }
      return;
    }
    if (id.type === 'ObjectPattern') {
      const props = id.properties;
      if (init && init.type === 'ObjectExpression') {
        // Build a name→value map for the object literal.
        const valueByKey = new Map<string, Expression | null>();
        for (const ip of init.properties ?? []) {
          if (ip.type !== 'Property' || ip.computed) continue;
          const keyName = staticPropKeyName(ip.key);
          if (keyName === null) continue;
          valueByKey.set(keyName, ip.value as Expression);
        }
        for (const pp of props) {
          if (pp.type !== 'Property' || pp.computed) continue;
          const keyName = staticPropKeyName(pp.key);
          if (keyName === null) continue;
          walkPatternInit(pp.value, valueByKey.get(keyName) ?? null);
        }
      } else {
        // Non-object-literal init (e.g. `const {x} = fn()`): treat all
        // value bindings under the same init.
        for (const pp of props) {
          if (pp.type !== 'Property') continue;
          walkPatternInit(pp.value, init);
        }
      }
      return;
    }
    if (id.type === 'AssignmentPattern') {
      walkPatternInit(id.left, init);
    }
  }

  function visit(node: AstNode | null | undefined): void {
    if (!node) return;

    if (node.type === 'VariableDeclaration') {
      const isConst = node.kind === 'const';
      for (const decl of node.declarations) {
        addIdent(decl.id);
        if (isConst) walkPatternInit(decl.id, decl.init);
      }
    }

    if (node.type === 'FunctionDeclaration' && node.id) {
      addIdent(node.id);
    }

    if (node.type === 'ClassDeclaration' && node.id) {
      addIdent(node.id);
    }

    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' ||
         node.type === 'ArrowFunctionExpression') && node.params) {
      for (const param of node.params) {
        addIdent(param);
      }
    }

    if (node.type === 'CatchClause' && node.param) {
      addIdent(node.param);
    }

    if ((node.type === 'ForInStatement' || node.type === 'ForOfStatement') && node.left) {
      if (node.left.type === 'VariableDeclaration') {
        for (const decl of node.left.declarations) {
          addIdent(decl.id);
        }
      }
    }

    forEachAstChild(node, (child) => visit(child as AstNode));
  }

  visit(program);
  return { constBindings, allLocalNames };
}

/**
 * Determine if an expression is immutable (const) or mutable (var).
 * Mirrors SWC's `is_const_expr`.
 */
export function classifyConstness(
  exprNode: AstNode | null | undefined,
  importedNames: Set<string>,
  constIdents?: Set<string>,
): 'const' | 'var' {
  if (!exprNode) return 'const';

  switch (exprNode.type) {
    case 'Literal':
      // Runtime emits all four literal interfaces (String/Numeric/Boolean/
      // Null) under the same `'Literal'` discriminant.
      return 'const';

    case 'TemplateLiteral': {
      if (exprNode.expressions.length === 0) return 'const';
      for (const expr of exprNode.expressions) {
        if (classifyConstness(expr, importedNames, constIdents) === 'var') return 'var';
      }
      return 'const';
    }

    case 'Identifier': {
      const name = exprNode.name;
      if (name === 'undefined') return 'const';
      if (importedNames.has(name)) return 'const';
      if (constIdents?.has(name)) return 'const';
      return 'var';
    }

    case 'MemberExpression': {
      // Runtime emits Computed/Static/PrivateField under one
      // `'MemberExpression'` discriminant; all three carry `.object`.
      const obj = exprNode.object;
      if (obj.type === 'Identifier' && importedNames.has(obj.name)) return 'const';
      return 'var';
    }

    case 'CallExpression':
      // `_fnSignal(_hf<n>, [deps], _hf<n>_str)` is a hoisted reactive
      // expression — its callee identity is stable, the runtime evaluates
      // the inner `_hf<n>` against fresh deps. SWC classifies these as
      // const; matching that puts them in the const-props bag where the
      // runtime can skip re-computing the prop record on re-render.
      if (
        exprNode.callee.type === 'Identifier' &&
        exprNode.callee.name === '_fnSignal'
      ) {
        return 'const';
      }
      return 'var';

    case 'UnaryExpression':
      return classifyConstness(exprNode.argument, importedNames, constIdents);

    case 'BinaryExpression':
    case 'LogicalExpression': {
      const leftClass = classifyConstness(exprNode.left, importedNames, constIdents);
      const rightClass = classifyConstness(exprNode.right, importedNames, constIdents);
      return leftClass === 'var' || rightClass === 'var' ? 'var' : 'const';
    }

    case 'ConditionalExpression': {
      const testClass = classifyConstness(exprNode.test, importedNames, constIdents);
      const consClass = classifyConstness(exprNode.consequent, importedNames, constIdents);
      const altClass = classifyConstness(exprNode.alternate, importedNames, constIdents);
      return testClass === 'var' || consClass === 'var' || altClass === 'var' ? 'var' : 'const';
    }

    case 'ObjectExpression': {
      for (const prop of exprNode.properties) {
        if (prop.type === 'SpreadElement') {
          if (classifyConstness(prop.argument, importedNames, constIdents) === 'var') return 'var';
        } else if (prop.value) {
          if (classifyConstness(prop.value, importedNames, constIdents) === 'var') return 'var';
        }
      }
      return 'const';
    }

    case 'ArrayExpression': {
      for (const el of exprNode.elements) {
        if (el === null) continue;
        if (el.type === 'SpreadElement') {
          if (classifyConstness(el.argument, importedNames, constIdents) === 'var') return 'var';
        } else {
          if (classifyConstness(el, importedNames, constIdents) === 'var') return 'var';
        }
      }
      return 'const';
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return 'const';

    case 'ParenthesizedExpression':
      return classifyConstness(exprNode.expression, importedNames, constIdents);

    case 'SequenceExpression': {
      for (const expr of exprNode.expressions) {
        if (classifyConstness(expr, importedNames, constIdents) === 'var') return 'var';
      }
      return 'const';
    }

    default:
      return 'var';
  }
}

/**
 * Compute the flags bitmask for a JSX element.
 *
 * Bit 0 (1): static_listeners -- all event handler props are const
 * Bit 1 (2): static_subtree -- children are static or none
 * Bit 2 (4): moved_captures -- loop context (q:p/q:ps)
 */
export function computeJsxFlags(
  hasVarProps: boolean,
  childrenType: 'none' | 'static' | 'dynamic',
  inLoop: boolean = false,
  hasVarEventHandler: boolean = false,
): number {
  let flags = 0;
  if (!hasVarEventHandler && (!inLoop || !hasVarProps)) {
    flags |= 1;
  }
  if (childrenType !== 'dynamic') {
    flags |= 2;
  }
  if (inLoop) {
    flags |= 4;
  }
  return flags;
}

export class JsxKeyCounter {
  private count: number;
  private prefix: string;

  constructor(startAt = 0, prefix = 'u6') {
    this.count = startAt;
    this.prefix = prefix;
  }

  next(): string {
    return `${this.prefix}_${this.count++}`;
  }

  current(): number {
    return this.count;
  }

  reset(): void {
    this.count = 0;
  }
}

export function isHtmlElement(tagName: string): boolean {
  return tagName.length > 0 && tagName[0] === tagName[0].toLowerCase();
}

/** Text-only HTML elements whose children should NOT be signal-wrapped. */
const TEXT_ONLY_TAGS = new Set([
  'text', 'textarea', 'title', 'option', 'script', 'style', 'noscript',
]);

export function isTextOnlyElement(tagName: string): boolean {
  return TEXT_ONLY_TAGS.has(tagName);
}

/**
 * Extract tag representation from a JSX opening element name node.
 */
export function processJsxTag(nameNode: JSXElementName | null | undefined): string {
  if (!nameNode) return '"div"';

  switch (nameNode.type) {
    case 'JSXIdentifier': {
      const name = nameNode.name;
      return isHtmlElement(name) ? `"${name}"` : name;
    }
    case 'JSXMemberExpression': {
      const parts: string[] = [];
      let current: JSXElementName = nameNode;
      while (current.type === 'JSXMemberExpression') {
        parts.unshift(current.property.name);
        current = current.object as JSXElementName;
      }
      if (current.type === 'JSXIdentifier') {
        parts.unshift(current.name);
      }
      return parts.join('.');
    }
    case 'JSXNamespacedName':
      return `"${nameNode.namespace.name}:${nameNode.name.name}"`;
    default:
      return '"div"';
  }
}

function isInSkipRange(
  nodeStart: number,
  nodeEnd: number,
  skipRanges: Array<{ start: number; end: number }>,
): boolean {
  for (const range of skipRanges) {
    if (nodeStart >= range.start && nodeEnd <= range.end) return true;
  }
  return false;
}

/**
 * Apply two-phase rename (old -> temp -> new) to avoid collisions when
 * renumbering _hf variables to match SWC's top-down source order.
 */
function applySignalHoistRenames(
  s: MagicString,
  renameMap: Map<string, string>,
): void {
  const content = s.toString();
  let renamed = content;

  const tempMap = new Map<string, string>();
  for (const [oldName, newName] of renameMap) {
    const temp = `__hf_temp_${oldName.slice(3)}__`;
    tempMap.set(temp, newName);
    renamed = renamed.split(`${oldName}_str`).join(`${temp}_str`);
    renamed = renamed.split(oldName).join(temp);
  }

  for (const [temp, newName] of tempMap) {
    renamed = renamed.split(`${temp}_str`).join(`${newName}_str`);
    renamed = renamed.split(temp).join(newName);
  }

  if (renamed !== content) {
    s.overwrite(0, s.original.length, renamed);
  }
}

/** Append dev source location info to a JSX call string. */
function appendDevSuffix(callString: string, devSuffix: string): string {
  if (!devSuffix) return callString;
  return callString.slice(0, -1) + devSuffix + ')';
}

// Import element/fragment transform functions
import { transformJsxElement, transformJsxFragment } from './jsx-elements-core.js';

// Re-export for consumers
export { transformJsxElement, transformJsxFragment };

/**
 * Walk the AST bottom-up and transform all JSX nodes.
 * Uses leave callback to ensure inner JSX is transformed before outer JSX.
 */
export function transformAllJsx(
  source: string,
  s: MagicString,
  program: AstProgram,
  importedNames: Set<string>,
  skipRanges?: Array<{ start: number; end: number }>,
  devOptions?: { relPath: string },
  keyCounterStart?: number,
  enableSignals: boolean = true,
  qpOverrides?: Map<number, string[]>,
  qrlsWithCaptures?: Set<string>,
  paramNames?: Set<string>,
  relPath?: string,
  sharedSignalHoister?: SignalHoister,
  precomputedConstAndLocal?: ConstAndLocalNames,
): JsxTransformOutput {
  const { constBindings: resolvedConstIdents, allLocalNames: allDeclaredNames } =
    precomputedConstAndLocal ?? collectConstAndLocalNames(program);
  const prefix = relPath ? computeKeyPrefix(relPath) : 'u6';
  const keyCounter = new JsxKeyCounter(keyCounterStart ?? 0, prefix);
  const signalHoister = sharedSignalHoister ?? new SignalHoister();
  const neededImports = new Set<string>();
  let needsFragment = false;
  const ranges = skipRanges ?? [];
  const jsxCtx: JsxTransformContext = {
    source,
    s,
    importedNames,
    keyCounter,
    signalHoister,
    constIdents: resolvedConstIdents,
    allDeclaredNames,
    paramNames,
    qrlsWithCaptures,
  };

  let lineStarts: number[] | null = null;
  if (devOptions) {
    lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n') lineStarts.push(i + 1);
    }
  }

  function getDevSourceSuffix(nodeStart: number): string {
    if (!devOptions || !lineStarts) return '';
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= nodeStart) lo = mid;
      else hi = mid - 1;
    }
    const lineNumber = lo + 1;
    const columnNumber = nodeStart - lineStarts[lo] + 1;
    return `, {\n    fileName: "${devOptions.relPath}",\n    lineNumber: ${lineNumber},\n    columnNumber: ${columnNumber}\n}`;
  }

  const loopStack: LoopContext[] = [];
  const childJsxNodes = new WeakSet<object>();

  walk(program, {
    enter(node) {
      const loopCtx = detectLoopContext(node, source);
      if (loopCtx) {
        loopStack.push(loopCtx);
      }

      if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
        for (const child of node.children) {
          if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
            childJsxNodes.add(child);
          }
        }
      }
    },
    leave(node) {
      if (loopStack.length > 0 && loopStack[loopStack.length - 1].loopNode === node) {
        loopStack.pop();
      }

      if (ranges.length > 0 && isInSkipRange(node.start, node.end, ranges)) return;

      const currentLoop = loopStack.length > 0 ? loopStack[loopStack.length - 1] : null;

      if (node.type === 'JSXElement') {
        const passiveEvents = collectPassiveDirectives(node.openingElement?.attributes ?? []);
        const isSoleChild = childJsxNodes.has(node);

        const result = transformJsxElement(jsxCtx, node, {
          passiveEvents,
          loopCtx: currentLoop,
          isSoleChild,
          enableChildSignals: enableSignals,
          qpOverrides,
        });
        if (result) {
          const callStr = appendDevSuffix(result.callString, getDevSourceSuffix(node.start));
          s.overwrite(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
          for (const imp of result.neededImports) neededImports.add(imp);
        }
      } else if (node.type === 'JSXFragment') {
        const isChildFragment = childJsxNodes.has(node);
        const result = transformJsxFragment(
          node, source, s, importedNames, keyCounter,
          isChildFragment, resolvedConstIdents, signalHoister, allDeclaredNames,
        );
        if (result) {
          const callStr = appendDevSuffix(result.callString, getDevSourceSuffix(node.start));
          s.overwrite(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
          for (const imp of result.neededImports) neededImports.add(imp);
          needsFragment = true;
        }
      }
    },
  });

  const renameMap = signalHoister.buildRenameMap();
  if (renameMap && renameMap.size > 0) {
    applySignalHoistRenames(s, renameMap);
  }

  const hoistedDeclarations = signalHoister.getDeclarations();
  return { neededImports, needsFragment, hoistedDeclarations, keyCounterValue: keyCounter.current() };
}
