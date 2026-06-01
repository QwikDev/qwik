/**
 * JSX element transformation module for the Qwik optimizer.
 *
 * Converts JSX syntax to _jsxSorted/_jsxSplit function calls with
 * correct prop classification (varProps/constProps), flags computation,
 * key generation, spread handling, and fragment support.
 */

import type MagicString from 'magic-string';
import { walkWithProtocol } from '../utils/walk-with-protocol.js';
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
 * Coordinate-conversion info for JSX dev-info under wrapped-body callers.
 *
 * The Inline-strategy path (`rewrite/inline-body.ts`) and default-strategy
 * segment-file path (`segment-codegen.ts`) parse the extracted body wrapped
 * in a single-line prefix (`const __body__ = ` and `(` respectively). When
 * dev-info is requested, JSX positions reported by the AST are offsets in
 * that wrapped body — not in the original module source. Without conversion,
 * `lineNumber:` ends up body-relative, but SWC reports source-relative
 * positions for both fixtures using these paths (`example_dev_mode_inlined`,
 * `example_dev_mode`, `root_level_self_referential_qrl_inline`). OSS-410.
 *
 * Callers that already pass the original module source as `transformAllJsx`'s
 * `source` arg (parent rewrite at `rewrite/index.ts`) leave this undefined.
 */
export interface DevInfoSourcePosition {
  /** Original module source — `lineStarts` is computed from this. */
  source: string;
  /** Byte offset of the wrapped body's start in `source`. */
  bodyOriginOffset: number;
  /** Length of the single-line wrapper prefix prepended to the body. */
  wrapperPrefixLen: number;
}

/** Dev-info emission options for `transformAllJsx`. */
export interface DevSuffixOptions {
  /** Source-file path emitted as `fileName:` on the dev-info object. */
  relPath: string;
  /**
   * Optional coordinate-conversion info; see {@link DevInfoSourcePosition}.
   * When provided, dev-info `lineNumber:`/`columnNumber:` are computed in
   * `sourcePosition.source` coords with `bodyOriginOffset + (nodeStart -
   * wrapperPrefixLen)` as the absolute byte offset.
   */
  sourcePosition?: DevInfoSourcePosition;
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
  /** Scope-aware binding lookup. Use `bindings.classify(name, atPosition)`
   * to resolve a reference to its innermost enclosing scope's binding kind;
   * shadowed names (e.g. arrow param shadowing a for-of binding) resolve
   * correctly. Replaces the prior flat `constIdents: Set<string>` per
   * OSS-401. */
  bindings?: ScopeAwareBindings;
  allDeclaredNames?: Set<string>;
  paramNames?: Set<string>;
  qrlsWithCaptures?: Set<string>;
}

/**
 * Enter-phase context for the JSX walker (OSS-391). Carries the read-only
 * source text plus the two enter-phase accumulators: the loop stack (pushed
 * on loop enter) and the sole-child JSX marker WeakSet (filled when a parent
 * JSX node first sees its children). Holds NO MagicString — calling
 * `ctx.s.overwrite(...)` from the enter handler is a compile error because
 * this type has no `s` field.
 */
export interface JsxWalkEnterContext {
  readonly source: string;
  readonly loopStack: LoopContext[];
  readonly childJsxNodes: WeakSet<object>;
}

/**
 * Exit-phase context for the JSX walker (OSS-391). Extends EnterContext with
 * the MagicString accumulator, the per-element transform inputs (`jsxCtx`,
 * `enableSignals`, `qpOverrides`, `ranges`), and the act-helpers needed
 * during leave: `neededImports` (write target), `getDevSourceSuffix` (dev
 * suffix builder), `setNeedsFragment` (flip the outer `needsFragment` flag
 * when a JSXFragment is rewritten).
 */
export interface JsxWalkExitContext extends JsxWalkEnterContext {
  readonly s: MagicString;
  readonly ranges: ReadonlyArray<{ start: number; end: number }>;
  readonly jsxCtx: JsxTransformContext;
  readonly enableSignals: boolean;
  readonly qpOverrides: Map<number, string[]> | undefined;
  readonly neededImports: Set<string>;
  readonly getDevSourceSuffix: (nodeStart: number) => string;
  readonly setNeedsFragment: () => void;
}

/** Per-element options for `transformJsxElement`. All fields are optional. */
export interface JsxElementOptions {
  passiveEvents?: Set<string>;
  loopCtx?: LoopContext | null;
  isSoleChild?: boolean;
  enableChildSignals?: boolean;
  qpOverrides?: Map<number, string[]>;
}

/** Per-call options for `processChildren`. */
export interface ProcessChildrenOptions {
  /**
   * Per-element accumulator. `processChildren` and its helpers add the
   * names of any runtime helpers they emit (`_wrapProp`, `_fnSignal`, …)
   * into this set so the caller can wire imports.
   */
  neededImports: Set<string>;
  /**
   * Gate for child-expression signal analysis (`_fnSignal` hoisting,
   * `_wrapProp`, constness classification). Defaults to `true`. Set to
   * `false` for elements where signal-aware processing of children is
   * suppressed (currently: text-only HTML tags, and components opting
   * out via `enableChildSignals: false`).
   */
  enableSignalAnalysis?: boolean;
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
  bindings: ScopeAwareBindings | undefined,
  atPosition: number,
): boolean {
  if (!name) {
    return false;
  }
  if (importedNames.has(name)) return true;
  return bindings?.classify(name, atPosition) === 'const';
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

/**
 * Scope-aware binding classification (OSS-401).
 *
 * Replaces the prior flat `constBindings: Set<string>` with a position-indexed
 * lookup. A reference to `item` at position P resolves to the innermost
 * enclosing scope that declares `item`; classification follows that scope's
 * binding kind. This is what SWC's hygiene-based `decl_stack` lookup gives
 * for free; OXC has no equivalent, so we simulate it via scope ranges.
 *
 * Per-name index: `nameToScopes: Map<name, scope-range[]>`. Lookup picks the
 * smallest range containing `atPosition` whose name matches. Synthetic
 * program-scope bindings (`addProgramScopeConst`) use range `[0, MAX]` so
 * any inner scope's binding wins — segment-codegen uses this to inject
 * `_captures[i]` names that aren't AST-declared but are runtime-const.
 */
interface ScopeRange {
  readonly start: number;
  readonly end: number;
  readonly kind: 'const' | 'var';
}

export interface ScopeAwareBindings {
  /** Look up `name`'s binding kind at AST position `atPosition`. Returns the
   * innermost matching scope's kind, or undefined if no enclosing scope
   * binds `name` (caller falls through to imports / undeclared check). */
  classify(name: string, atPosition: number): 'const' | 'var' | undefined;
  /** Add a name that classifies as `const` everywhere — used to inject
   * names that aren't AST-declared but are runtime-const (e.g. capture
   * bindings from `_captures[i]` unpacking). Any inner-scope binding of
   * the same name shadows correctly. */
  addProgramScopeConst(name: string): void;
}

class ScopeAwareBindingsImpl implements ScopeAwareBindings {
  private nameToScopes = new Map<string, ScopeRange[]>();
  /**
   * Names that classify as `'const'` everywhere, overriding any AST-derived
   * binding. Populated by `addProgramScopeConst` — used for capture names
   * injected by `_captures[i]` unpacking. Even though those names appear
   * as AST `const X = _captures[N]` declarations inside segment bodies,
   * their initializer (`_captures[N]`) is a MemberExpression that wouldn't
   * normally pass `isReturnStatic`, so the AST-derived classification
   * would be `'var'` — incorrect, since `_captures` is a runtime-stable
   * array. The override matches the prior flat-Set behavior where
   * `captureInfo.captureNames` were forcibly added to `constBindings`.
   */
  private alwaysConst = new Set<string>();

  add(name: string, start: number, end: number, kind: 'const' | 'var'): void {
    let arr = this.nameToScopes.get(name);
    if (!arr) {
      arr = [];
      this.nameToScopes.set(name, arr);
    }
    arr.push({ start, end, kind });
  }

  classify(name: string, atPosition: number): 'const' | 'var' | undefined {
    // alwaysConst overrides scope walk — see field doc above.
    if (this.alwaysConst.has(name)) return 'const';
    const scopes = this.nameToScopes.get(name);
    if (!scopes) return undefined;
    let best: ScopeRange | undefined;
    let bestSize = Infinity;
    for (const s of scopes) {
      if (s.start <= atPosition && atPosition < s.end) {
        const size = s.end - s.start;
        if (size < bestSize) {
          best = s;
          bestSize = size;
        }
      }
    }
    return best?.kind;
  }

  addProgramScopeConst(name: string): void {
    this.alwaysConst.add(name);
  }
}

export interface ScopeAwareCollectResult {
  /** Scope-aware binding lookup keyed by (name, position). */
  bindings: ScopeAwareBindings;
  /** Every locally declared identifier name (any binding kind) — flat,
   * scope-unaware. Used by signal-analysis as a "this name is declared
   * somewhere locally, so don't treat it as a signal/store dep" filter. */
  allLocalNames: Set<string>;
}

/**
 * Single-pass collection of scope-aware `bindings` + flat `allLocalNames`.
 * Walks the AST maintaining a scope stack: each Function* / Arrow / Block /
 * For-loop / Catch / Program node pushes a frame on enter, pops on leave.
 * Bindings declared inside are recorded with that frame's source range.
 *
 * Const-vs-var classification per binding mirrors the prior `collectConst-
 * AndLocalNames` behavior:
 * - `VariableDeclaration` with `kind === 'const'` and `isReturnStatic(init)`
 *   per leaf → `'const'`
 * - All other bindings (let/var declarations, function/arrow/method params,
 *   for-in/of bindings via VarDecl with null init are special-cased through
 *   the same VarDecl branch, catch param, function/class declaration names)
 *   → `'var'`
 *
 * Block scoping is treated uniformly (every binding goes in its immediate
 * enclosing scope-introducing node). This is technically more restrictive
 * than JS semantics for `var` (which floats to the enclosing function), but
 * is safe: a `var x` recorded in an inner block scope can only produce a
 * false-positive shadow detection, which classifies the reference as `var`
 * (the safer direction — fewer false-const classifications).
 */
export function collectScopeAwareBindings(program: AstProgram): ScopeAwareCollectResult {
  const bindings = new ScopeAwareBindingsImpl();
  const allLocalNames = new Set<string>();

  /** Stack of active scope ranges. The top is the innermost; bindings
   * declared inside the current visit get recorded with the top range. */
  const scopeStack: Array<{ start: number; end: number }> = [];

  function currentScope(): { start: number; end: number } {
    return scopeStack[scopeStack.length - 1];
  }

  function addBindingIdent(idNode: AstNode | null | undefined, kind: 'const' | 'var'): void {
    if (!idNode) return;
    if (idNode.type === 'Identifier') {
      allLocalNames.add(idNode.name);
      const scope = currentScope();
      bindings.add(idNode.name, scope.start, scope.end, kind);
    } else if (idNode.type === 'ArrayPattern') {
      for (const elem of idNode.elements) {
        if (elem) addBindingIdent(elem.type === 'RestElement' ? elem.argument : elem, kind);
      }
    } else if (idNode.type === 'ObjectPattern') {
      for (const prop of idNode.properties) {
        if (prop.type === 'RestElement') {
          addBindingIdent(prop.argument, kind);
        } else {
          addBindingIdent(prop.value, kind);
        }
      }
    } else if (idNode.type === 'AssignmentPattern') {
      addBindingIdent(idNode.left, kind);
    }
  }

  /** Walk a destructure pattern paired with its initializer. For each leaf
   * binding, classify as `'const'` iff the corresponding init expression is
   * `isReturnStatic`; otherwise `'var'`. Same algorithm as the prior
   * `walkPatternInit` — catches compound destructures like
   * `const [store, math] = [useStore(...), Math.random()]` → store const,
   * math not.
   */
  function walkPatternInit(id: AstNode | null | undefined, init: Expression | null | undefined): void {
    if (!id) return;
    if (id.type === 'Identifier') {
      addBindingIdent(id, isReturnStatic(init) ? 'const' : 'var');
      return;
    }
    if (id.type === 'ArrayPattern') {
      const elems = id.elements;
      if (init && init.type === 'ArrayExpression') {
        for (let i = 0; i < elems.length; i++) {
          const elem = elems[i];
          if (!elem || elem.type === 'RestElement') continue;
          const initElem = init.elements?.[i] ?? null;
          if (initElem && initElem.type === 'SpreadElement') continue;
          walkPatternInit(elem, initElem);
        }
      } else {
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

  function isScopeIntroducing(node: AstNode): boolean {
    return (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'BlockStatement' ||
      node.type === 'ForStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForOfStatement' ||
      node.type === 'CatchClause'
    );
  }

  function visit(node: AstNode | null | undefined): void {
    if (!node) return;

    const pushed = isScopeIntroducing(node);
    if (pushed) {
      scopeStack.push({ start: node.start, end: node.end });
    }

    // FunctionDeclaration/ClassDeclaration NAMES bind in their enclosing
    // scope (the parent), not in the new function-body scope. Add them to
    // the scope ABOVE the just-pushed frame (if we pushed one).
    if (node.type === 'FunctionDeclaration' && node.id) {
      const targetScope = pushed && scopeStack.length >= 2
        ? scopeStack[scopeStack.length - 2]
        : currentScope();
      allLocalNames.add(node.id.name);
      bindings.add(node.id.name, targetScope.start, targetScope.end, 'var');
    }
    if (node.type === 'ClassDeclaration' && node.id) {
      // Classes are not scope-introducing in this model (we don't push for
      // them); the name binds in the current scope.
      allLocalNames.add(node.id.name);
      const scope = currentScope();
      bindings.add(node.id.name, scope.start, scope.end, 'var');
    }

    // Function parameters bind in the function/arrow body scope (which we
    // just pushed for these node types).
    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' ||
         node.type === 'ArrowFunctionExpression') && node.params) {
      for (const param of node.params) {
        addBindingIdent(param, 'var');
      }
    }

    // Catch param binds in the catch clause scope.
    if (node.type === 'CatchClause' && node.param) {
      addBindingIdent(node.param, 'var');
    }

    // VariableDeclaration handles both standalone `const/let/var x = ...`
    // AND the LHS of `for (const x of arr)` / `for (let i = 0; ...)`. For
    // const declarations, walkPatternInit classifies each leaf based on
    // `isReturnStatic(init)`. For for-of/in, `decl.init === null` →
    // `isReturnStatic(null) === true` → bound as 'const' (matches prior
    // behavior).
    if (node.type === 'VariableDeclaration') {
      const isConst = node.kind === 'const';
      for (const decl of node.declarations) {
        if (isConst) {
          walkPatternInit(decl.id, decl.init);
        } else {
          addBindingIdent(decl.id, 'var');
        }
      }
    }

    forEachAstChild(node, (child) => visit(child));

    if (pushed) {
      scopeStack.pop();
    }
  }

  // Push the program-level scope frame so top-level bindings have somewhere
  // to land. Range covers the whole program.
  scopeStack.push({ start: program.start ?? 0, end: program.end ?? Number.MAX_SAFE_INTEGER });
  visit(program);
  scopeStack.pop();

  return { bindings, allLocalNames };
}

/**
 * Determine if an expression is immutable (const) or mutable (var).
 * Mirrors SWC's `is_const_expr`. Per OSS-401, takes the expression's AST
 * position so identifier references resolve through scope-aware lookup;
 * shadowed names (e.g. an arrow param shadowing an outer for-of binding)
 * classify correctly.
 */
export function classifyConstness(
  exprNode: AstNode | null | undefined,
  importedNames: Set<string>,
  bindings: ScopeAwareBindings | undefined,
  atPosition: number,
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
        if (classifyConstness(expr, importedNames, bindings, atPosition) === 'var') return 'var';
      }
      return 'const';
    }

    case 'Identifier': {
      const name = exprNode.name;
      if (name === 'undefined') return 'const';
      if (importedNames.has(name)) return 'const';
      // Use the identifier's own position for the scope lookup — the
      // outer `atPosition` is the enclosing expression's start, but the
      // identifier may sit deeper (e.g. nested in a SequenceExpression).
      // Both resolve to the same enclosing scope for the cases we care
      // about; using the identifier's start is the most precise.
      if (bindings?.classify(name, exprNode.start) === 'const') return 'const';
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
      // OSS-438: `q_<sym>.w([captures])` on a hoisted QRL binding is a
      // capture-wrapping invocation that produces a stable QRL reference
      // — the underlying `q_<sym>` const is immutable, and `.w()` only
      // attaches captures for runtime re-inflation. SWC classifies these
      // as const on component-prop position (`example_strip_client_code`
      // shows `render$: q_X.w([state])` in the const-props bag).
      if (
        exprNode.callee.type === 'MemberExpression' &&
        exprNode.callee.object.type === 'Identifier' &&
        exprNode.callee.object.name.startsWith('q_') &&
        exprNode.callee.property.type === 'Identifier' &&
        exprNode.callee.property.name === 'w'
      ) {
        return 'const';
      }
      return 'var';

    case 'UnaryExpression':
      return classifyConstness(exprNode.argument, importedNames, bindings, atPosition);

    case 'BinaryExpression':
    case 'LogicalExpression': {
      const leftClass = classifyConstness(exprNode.left, importedNames, bindings, atPosition);
      const rightClass = classifyConstness(exprNode.right, importedNames, bindings, atPosition);
      return leftClass === 'var' || rightClass === 'var' ? 'var' : 'const';
    }

    case 'ConditionalExpression': {
      const testClass = classifyConstness(exprNode.test, importedNames, bindings, atPosition);
      const consClass = classifyConstness(exprNode.consequent, importedNames, bindings, atPosition);
      const altClass = classifyConstness(exprNode.alternate, importedNames, bindings, atPosition);
      return testClass === 'var' || consClass === 'var' || altClass === 'var' ? 'var' : 'const';
    }

    case 'ObjectExpression': {
      for (const prop of exprNode.properties) {
        if (prop.type === 'SpreadElement') {
          if (classifyConstness(prop.argument, importedNames, bindings, atPosition) === 'var') return 'var';
        } else if (prop.value) {
          if (classifyConstness(prop.value, importedNames, bindings, atPosition) === 'var') return 'var';
        }
      }
      return 'const';
    }

    case 'ArrayExpression': {
      for (const el of exprNode.elements) {
        if (el === null) continue;
        if (el.type === 'SpreadElement') {
          if (classifyConstness(el.argument, importedNames, bindings, atPosition) === 'var') return 'var';
        } else {
          if (classifyConstness(el, importedNames, bindings, atPosition) === 'var') return 'var';
        }
      }
      return 'const';
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return 'const';

    case 'ParenthesizedExpression':
      return classifyConstness(exprNode.expression, importedNames, bindings, atPosition);

    case 'SequenceExpression': {
      for (const expr of exprNode.expressions) {
        if (classifyConstness(expr, importedNames, bindings, atPosition) === 'var') return 'var';
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
    default: {
      const _exhaustive: never = nameNode;
      throw new Error(`unhandled JSXElementName: ${(_exhaustive as { type?: string }).type}`);
    }
  }
}

function isInSkipRange(
  nodeStart: number,
  nodeEnd: number,
  skipRanges: ReadonlyArray<{ start: number; end: number }>,
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
/**
 * Required inputs for one `transformAllJsx` invocation — the four values
 * the orchestrator can't sensibly default. `source` is the parser input
 * the AST is positioned in; `s` is the MagicString being mutated; `program`
 * is the parsed AST root; `importedNames` is the set of top-level imported
 * binding names used for prop-classification.
 */
export interface TransformAllJsxInput {
  source: string;
  s: MagicString;
  program: AstProgram;
  importedNames: Set<string>;
}

/**
 * Per-call configuration for `transformAllJsx`. All fields optional; defaults
 * mirror the previous positional signature (OSS-374/375/376/377 lineage).
 *
 * Closes the OSS-374/375/376/377 parameter-reduction arc: the JSX orchestrator
 * is now context+options shaped like its inner callees (`transformJsxElement`,
 * `transformJsxFragment`, `processChildren`, `processProps`).
 */
export interface TransformAllJsxOptions {
  /** Byte ranges to skip during the walk (e.g., already-handled subtrees). */
  skipRanges?: Array<{ start: number; end: number }>;
  /** Dev-info emission config; when set, JSX calls get a trailing dev-source suffix. */
  devOptions?: DevSuffixOptions;
  /** Starting JSX key counter value (continuation across multiple `transformAllJsx` calls). */
  keyCounterStart?: number;
  /** Run signal-analysis hoisting (`_fnSignal`, `_wrapProp`). Defaults to true. */
  enableSignals?: boolean;
  /** Per-element `q:p`/`q:ps` overrides keyed by JSXElement.start byte offset. */
  qpOverrides?: Map<number, string[]>;
  /** Set of QRL local names that carry captures, used by prop classification. */
  qrlsWithCaptures?: Set<string>;
  /** Closure parameter names (treated as const for prop classification on HTML tags). */
  paramNames?: Set<string>;
  /** Module-relative path used to derive the JSX key prefix. */
  relPath?: string;
  /** Shared SignalHoister for `_hf<n>` counter continuity across calls. */
  sharedSignalHoister?: SignalHoister;
  /** Pre-computed scope-aware bindings, when the caller already built them. */
  precomputedScopeBindings?: ScopeAwareCollectResult;
}

export function transformAllJsx(
  input: TransformAllJsxInput,
  opts: TransformAllJsxOptions = {},
): JsxTransformOutput {
  const { source, s, program, importedNames } = input;
  const {
    skipRanges,
    devOptions,
    keyCounterStart,
    enableSignals = true,
    qpOverrides,
    qrlsWithCaptures,
    paramNames,
    relPath,
    sharedSignalHoister,
    precomputedScopeBindings,
  } = opts;
  const { bindings: resolvedBindings, allLocalNames: allDeclaredNames } =
    precomputedScopeBindings ?? collectScopeAwareBindings(program);
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
    bindings: resolvedBindings,
    allDeclaredNames,
    paramNames,
    qrlsWithCaptures,
  };

  // OSS-410: when the JSX walk runs over a *wrapped body* (Inline strategy
  // via `inline-body.ts` and default-strategy segment files via
  // `segment-codegen.ts`), `source` here is the wrapped body — not the
  // original module source. Naively computing `lineStarts` from this `source`
  // produces body-relative line/column for JSX dev-info, but SWC reports
  // source-relative positions. `devOptions.sourcePosition` lets callers
  // declare "compute lineStarts from this other string and convert nodeStart
  // via `bodyOriginOffset + (nodeStart - wrapperPrefixLen)` before lookup."
  // Module-level callers (parent rewrite) omit it; their `source` already
  // IS the original module source.
  let lineStarts: number[] | null = null;
  if (devOptions) {
    const linesSource = devOptions.sourcePosition?.source ?? source;
    lineStarts = [0];
    for (let i = 0; i < linesSource.length; i++) {
      if (linesSource[i] === '\n') lineStarts.push(i + 1);
    }
  }

  function getDevSourceSuffix(nodeStart: number): string {
    if (!devOptions || !lineStarts) return '';
    const effectiveOffset = devOptions.sourcePosition
      ? devOptions.sourcePosition.bodyOriginOffset +
        (nodeStart - devOptions.sourcePosition.wrapperPrefixLen)
      : nodeStart;
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= effectiveOffset) lo = mid;
      else hi = mid - 1;
    }
    const lineNumber = lo + 1;
    const columnNumber = effectiveOffset - lineStarts[lo] + 1;
    return `, {\n    fileName: "${devOptions.relPath}",\n    lineNumber: ${lineNumber},\n    columnNumber: ${columnNumber}\n}`;
  }

  const loopStack: LoopContext[] = [];
  const childJsxNodes = new WeakSet<object>();

  // Per OSS-391: split walk state into Enter and Exit context views so the
  // type system enforces "enter gathers, exit acts." Enter sees only what's
  // needed to record loop context and pre-mark sole-child JSX nodes; Exit
  // adds the MagicString, the dev-suffix helper, and the act-helpers that
  // mutate `s` and `needsFragment`. Calling `ctx.s.overwrite(...)` from
  // enter would be a compile error because the EnterContext type has no
  // `s` field.
  const enterCtx: JsxWalkEnterContext = {
    source,
    loopStack,
    childJsxNodes,
  };
  const exitCtx: JsxWalkExitContext = {
    ...enterCtx,
    s,
    ranges,
    jsxCtx,
    enableSignals,
    qpOverrides,
    neededImports,
    getDevSourceSuffix,
    setNeedsFragment: () => { needsFragment = true; },
  };

  walkWithProtocol(program, enterCtx, exitCtx, {
    enter(node, _parent, ctx) {
      const loopCtx = detectLoopContext(node, ctx.source);
      if (loopCtx) {
        ctx.loopStack.push(loopCtx);
      }

      if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
        for (const child of node.children) {
          if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
            ctx.childJsxNodes.add(child);
          }
        }
      }
    },
    leave(node, _parent, ctx) {
      if (ctx.loopStack.length > 0 && ctx.loopStack[ctx.loopStack.length - 1].loopNode === node) {
        ctx.loopStack.pop();
      }

      if (ctx.ranges.length > 0 && isInSkipRange(node.start, node.end, ctx.ranges)) return;

      const currentLoop =
        ctx.loopStack.length > 0 ? ctx.loopStack[ctx.loopStack.length - 1] : null;

      if (node.type === 'JSXElement') {
        const passiveEvents = collectPassiveDirectives(node.openingElement?.attributes ?? []);
        const isSoleChild = ctx.childJsxNodes.has(node);

        const result = transformJsxElement(ctx.jsxCtx, node, {
          passiveEvents,
          loopCtx: currentLoop,
          isSoleChild,
          enableChildSignals: ctx.enableSignals,
          qpOverrides: ctx.qpOverrides,
        });
        if (result) {
          const callStr = appendDevSuffix(result.callString, ctx.getDevSourceSuffix(node.start));
          ctx.s.overwrite(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
          for (const imp of result.neededImports) ctx.neededImports.add(imp);
        }
      } else if (node.type === 'JSXFragment') {
        const result = transformJsxFragment(ctx.jsxCtx, node);
        if (result) {
          const callStr = appendDevSuffix(result.callString, ctx.getDevSourceSuffix(node.start));
          ctx.s.overwrite(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
          for (const imp of result.neededImports) ctx.neededImports.add(imp);
          ctx.setNeedsFragment();
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
