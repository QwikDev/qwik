import type MagicString from 'magic-string';
import { walkWithProtocol } from '../ast/walk-with-protocol.js';
import { forEachAstChild } from '../ast/guards.js';
import { isCaptureWrappingQrlCall } from '../qwik/w-call.js';
import type { AstNode, AstProgram, Expression, JSXElementName } from '../../ast-types.js';
import { SignalHoister } from './signal-analysis.js';
import { collectPassiveDirectives } from './event-handlers.js';
import { detectLoopContext, type LoopContext } from './loop-hoisting.js';
import { computeKeyPrefix } from './key-prefix.js';

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
 * Coordinate-conversion info for JSX dev-info under wrapped-body callers. The inline-strategy and
 * segment-file paths parse the extracted body wrapped in a prefix, so AST-reported JSX positions
 * are offsets in that wrapped body, not the module source. Without conversion, `lineNumber:` ends
 * up body-relative instead of source-relative. Module-level callers (parent rewrite) leave this
 * undefined.
 */
export interface DevInfoSourcePosition {
  source: string;
  bodyOriginOffset: number;
  wrapperPrefixLen: number;
}

export interface DevSuffixOptions {
  relPath: string;
  sourcePosition?: DevInfoSourcePosition;
}

export interface JsxTransformContext {
  source: string;
  s: MagicString;
  importedNames: Set<string>;
  keyCounter: JsxKeyCounter;
  signalHoister: SignalHoister;
  /**
   * Scope-aware binding lookup. `classify(name, atPosition)` resolves to the innermost enclosing
   * scope's kind so shadowed names (arrow param over a for-of binding) classify correctly; a flat
   * `Set` cannot disambiguate.
   */
  bindings?: ScopeAwareBindings;
  allDeclaredNames?: Set<string>;
  paramNames?: Set<string>;
  qrlsWithCaptures?: Set<string>;
  /**
   * Exact-range log of every `writeJsxCall` overwrite, keyed by range start; lets readers recover a
   * rewritten subtree's text without the chunk-list walk `MagicString.slice` pays on a heavily
   * edited buffer (see `sliceTransformed`).
   */
  jsxWriteMemo?: ReadonlyMap<number, { end: number; content: string }>;
}

/**
 * Read a byte range from the in-progress transform buffer, preferring an exact-range hit in the JSX
 * write memo over `MagicString.slice`. Sound because the JSX walk rewrites bottom-up through the
 * single `writeJsxCall` path, so a child's recorded write is the last edit inside its range by the
 * time an ancestor reads it; the only pass that revisits recorded ranges (post-walk signal-hoist
 * rename) runs after all reads.
 */
export function sliceTransformed(ctx: JsxTransformContext, start: number, end: number): string {
  const hit = ctx.jsxWriteMemo?.get(start);
  if (hit !== undefined && hit.end === end) return hit.content;
  return ctx.s.slice(start, end);
}

export interface JsxWalkEnterContext {
  readonly source: string;
  readonly loopStack: LoopContext[];
  readonly childJsxNodes: WeakSet<object>;
}

export interface JsxWalkExitContext extends JsxWalkEnterContext {
  readonly ranges: ReadonlyArray<{ start: number; end: number }>;
  readonly jsxCtx: JsxTransformContext;
  readonly enableSignals: boolean;
  readonly qpOverrides: Map<number, string[]> | undefined;
  readonly neededImports: Set<string>;
  readonly getDevSourceSuffix: (nodeStart: number) => string;
  readonly setNeedsFragment: () => void;
  readonly writeJsxCall: (start: number, end: number, content: string) => void;
}

export interface JsxElementOptions {
  passiveEvents?: Set<string>;
  loopCtx?: LoopContext | null;
  isSoleChild?: boolean;
  enableChildSignals?: boolean;
  qpOverrides?: Map<number, string[]>;
}

export interface ProcessChildrenOptions {
  neededImports: Set<string>;
  enableSignalAnalysis?: boolean;
}

export interface ProcessPropsOptions {
  tagIsHtml: boolean;
  passiveEvents: Set<string>;
  inLoop?: boolean;
  /**
   * Skip signal analysis for prop values; set when lowering to `_createElement` (spread + key),
   * whose path emits prop values verbatim so any `_fnSignal` hoists would be unreachable.
   */
  skipSignalAnalysis?: boolean;
}

export function isConstBindingName(
  name: string | null,
  importedNames: Set<string>,
  bindings: ScopeAwareBindings | undefined,
  atPosition: number
): boolean {
  if (!name) {
    return false;
  }
  if (importedNames.has(name)) return true;
  return bindings?.classify(name, atPosition) === 'const';
}

/**
 * A closure parameter counts as a const-stable dep only on component elements: on an HTML element a
 * param-dependent prop stays var because the DOM node re-renders on every prop change.
 */
export function fnSignalDepsAllConst(
  deps: readonly string[],
  importedNames: Set<string>,
  bindings: ScopeAwareBindings | undefined,
  atPosition: number,
  tagIsHtml: boolean,
  isParam: (dep: string) => boolean
): boolean {
  return deps.every(
    (dep) =>
      isConstBindingName(dep, importedNames, bindings, atPosition) || (!tagIsHtml && isParam(dep))
  );
}

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
 * Scope-aware binding classification: a reference to `item` at position P resolves to the innermost
 * enclosing scope that declares `item`, and classification follows that scope's binding kind.
 * Per-name index `nameToScopes: Map<name, scope-range[]>`; lookup picks the smallest range
 * containing `atPosition`. Synthetic program-scope bindings (`addProgramScopeConst`) use range `[0,
 * MAX]` so any inner scope's binding wins.
 */
interface ScopeRange {
  readonly start: number;
  readonly end: number;
  readonly kind: 'const' | 'var';
}

export interface ScopeAwareBindings {
  /**
   * Innermost enclosing scope's binding kind for `name` at `atPosition`, or undefined when no scope
   * binds it (caller falls through to imports/undeclared).
   */
  classify(name: string, atPosition: number): 'const' | 'var' | undefined;
  /**
   * Register `name` as const everywhere — for names that aren't AST-declared but are runtime-const
   * (e.g. `_captures[i]` unpacking bindings). Inner-scope bindings still shadow.
   */
  addProgramScopeConst(name: string): void;
}

class ScopeAwareBindingsImpl implements ScopeAwareBindings {
  private nameToScopes = new Map<string, ScopeRange[]>();
  /**
   * Names that classify as `'const'` everywhere, overriding AST-derived binding. Populated by
   * `addProgramScopeConst` for `_captures[N]` unpacking names: those appear as `const X =
   * _captures[N]` whose MemberExpression initializer wouldn't pass `isReturnStatic`, so the
   * AST-derived kind would wrongly be `'var'`.
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
  bindings: ScopeAwareBindings;
  /**
   * Every locally declared name (any binding kind), flat/scope-unaware — signal-analysis uses it to
   * skip names declared locally.
   */
  allLocalNames: Set<string>;
}

/**
 * Enter/leave view of the bindings collection so the canonical gather walk
 * (`analysis/module-gather-walk.ts`) can drive it as a projection. `collectScopeAwareBindings`
 * remains the standalone walk and the projection's differential oracle.
 */
export interface ScopeBindingsCollector {
  readonly enter: (node: AstNode) => void;
  readonly leave: (node: AstNode) => void;
  readonly result: () => ScopeAwareCollectResult;
}

export function createScopeBindingsCollector(program: AstProgram): ScopeBindingsCollector {
  const bindings = new ScopeAwareBindingsImpl();
  const allLocalNames = new Set<string>();

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

  function walkPatternInit(
    id: AstNode | null | undefined,
    init: Expression | null | undefined
  ): void {
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

  function enter(node: AstNode): void {
    const pushed = isScopeIntroducing(node);
    if (pushed) {
      scopeStack.push({ start: node.start, end: node.end });
    }

    // FunctionDeclaration/ClassDeclaration names bind in the enclosing scope,
    // not the new body scope — record them in the scope above the just-pushed frame.
    if (node.type === 'FunctionDeclaration' && node.id) {
      const targetScope =
        pushed && scopeStack.length >= 2 ? scopeStack[scopeStack.length - 2] : currentScope();
      allLocalNames.add(node.id.name);
      bindings.add(node.id.name, targetScope.start, targetScope.end, 'var');
    }
    if (node.type === 'ClassDeclaration' && node.id) {
      // Classes aren't scope-introducing in this model (no push), so the name
      // binds in the current scope.
      allLocalNames.add(node.id.name);
      const scope = currentScope();
      bindings.add(node.id.name, scope.start, scope.end, 'var');
    }

    if (
      (node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression') &&
      node.params
    ) {
      for (const param of node.params) {
        addBindingIdent(param, 'var');
      }
    }

    if (node.type === 'CatchClause' && node.param) {
      addBindingIdent(node.param, 'var');
    }

    // One `VariableDeclaration` covers standalone declarations and for-loop LHS.
    // For-of/in have `decl.init === null`, so `isReturnStatic(null) === true`
    // binds them as 'const'.
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
  }

  function leave(node: AstNode): void {
    if (isScopeIntroducing(node)) {
      scopeStack.pop();
    }
  }

  // Push the program-level scope frame so top-level bindings land somewhere;
  // never popped, so `result` is readable after the traversal.
  scopeStack.push({ start: program.start ?? 0, end: program.end ?? Number.MAX_SAFE_INTEGER });

  return {
    enter,
    leave,
    result: () => ({ bindings, allLocalNames }),
  };
}

export function collectScopeAwareBindings(program: AstProgram): ScopeAwareCollectResult {
  const collector = createScopeBindingsCollector(program);
  function visit(node: AstNode | null | undefined): void {
    if (!node) return;
    collector.enter(node);
    forEachAstChild(node, (child) => visit(child));
    collector.leave(node);
  }
  visit(program);
  return collector.result();
}

/**
 * Classify an expression as immutable (const) or mutable (var). Takes the AST position so
 * identifier references resolve through scope-aware lookup and shadowed names classify correctly.
 */
export function classifyConstness(
  exprNode: AstNode | null | undefined,
  importedNames: Set<string>,
  bindings: ScopeAwareBindings | undefined,
  atPosition: number
): 'const' | 'var' {
  if (!exprNode) return 'const';

  switch (exprNode.type) {
    case 'Literal':
      // All four literal interfaces (String/Numeric/Boolean/Null) share the
      // same `'Literal'` discriminant.
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
      // Use the identifier's own start for the scope lookup — the outer
      // `atPosition` is the enclosing expression's start, but the identifier
      // may sit deeper.
      if (bindings?.classify(name, exprNode.start) === 'const') return 'const';
      return 'var';
    }

    case 'MemberExpression': {
      // Computed/Static/PrivateField share one `'MemberExpression'`
      // discriminant; all three carry `.object`.
      const obj = exprNode.object;
      if (obj.type === 'Identifier' && importedNames.has(obj.name)) return 'const';
      return 'var';
    }

    case 'CallExpression':
      // A hoisted `_fnSignal(_hf<n>, [deps], ...)` has a stable callee;
      // classifying it const puts it in the const-props bag so the runtime skips
      // re-computing the prop record on re-render.
      if (exprNode.callee.type === 'Identifier' && exprNode.callee.name === '_fnSignal') {
        return 'const';
      }
      if (isCaptureWrappingQrlCall(exprNode)) {
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
          if (classifyConstness(prop.argument, importedNames, bindings, atPosition) === 'var')
            return 'var';
        } else if (prop.value) {
          if (classifyConstness(prop.value, importedNames, bindings, atPosition) === 'var')
            return 'var';
        }
      }
      return 'const';
    }

    case 'ArrayExpression': {
      for (const el of exprNode.elements) {
        if (el === null) continue;
        if (el.type === 'SpreadElement') {
          if (classifyConstness(el.argument, importedNames, bindings, atPosition) === 'var')
            return 'var';
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
 * Bit 0 (1): static_listeners -- all event handler props are const Bit 1 (2): static_subtree --
 * children are static or none Bit 2 (4): moved_captures -- loop context (q:p/q:ps)
 */
export function computeJsxFlags(
  hasVarProps: boolean,
  childrenType: 'none' | 'static' | 'dynamic',
  inLoop: boolean = false,
  hasVarEventHandler: boolean = false
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
  'text',
  'textarea',
  'title',
  'option',
  'script',
  'style',
  'noscript',
]);

export function isTextOnlyElement(tagName: string): boolean {
  return TEXT_ONLY_TAGS.has(tagName);
}

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

/**
 * Build a binary-searchable index over skip ranges: sort by start (descending end tie-break), drop
 * ranges contained in an already-kept range (lossless — a node inside a dropped range is inside its
 * container). Kept ranges have strictly increasing starts AND ends, which makes `isInSkipRange`'s
 * single-probe query sound.
 */
export function buildSkipRangeIndex(
  skipRanges: ReadonlyArray<{ start: number; end: number }>
): ReadonlyArray<{ start: number; end: number }> {
  if (skipRanges.length <= 1) return skipRanges;
  const sorted = [...skipRanges].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: { start: number; end: number }[] = [];
  let maxEnd = -1;
  for (const range of sorted) {
    if (range.end <= maxEnd) continue;
    kept.push(range);
    maxEnd = range.end;
  }
  return kept;
}

/**
 * Probing only the rightmost kept range with `start <= nodeStart` is sound: suppose the node is
 * contained in some kept range A but the probe picked B (so B.start >= A.start). B kept means B is
 * not contained in A, hence B.end > A.end >= nodeEnd — and nodeStart >= B.start by the probe — so
 * the node is contained in B too and the check still succeeds.
 */
export function isInSkipRange(
  nodeStart: number,
  nodeEnd: number,
  index: ReadonlyArray<{ start: number; end: number }>
): boolean {
  let lo = 0;
  let hi = index.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (index[mid].start <= nodeStart) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 && nodeEnd <= index[found].end;
}

/**
 * Two-phase rename (old → temp → new) so renumbering `_hf` variables to top-down source order can't
 * collide.
 */
function renameSignalHoistNames(text: string, renameMap: Map<string, string>): string {
  let renamed = text;

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

  return renamed;
}

interface RecordedJsxWrite {
  readonly start: number;
  readonly end: number;
  readonly content: string;
}

/**
 * Renumber `_hf` occurrences by re-overwriting exactly the recorded JSX write ranges (every
 * `_hf<n>` lives inside walk-inserted content). Replaying in recorded bottom-up order reproduces
 * the walk's overwrite nesting without touching untouched chunks, so original-source offsets stay
 * valid for later passes that `s.slice` at original AST positions and error on replaced anchors.
 */
function applySignalHoistRenames(
  s: MagicString,
  renameMap: Map<string, string>,
  writes: ReadonlyArray<RecordedJsxWrite>
): void {
  for (const write of writes) {
    const renamed = renameSignalHoistNames(write.content, renameMap);
    if (renamed !== write.content) {
      s.overwrite(write.start, write.end, renamed);
    }
  }
}

function appendDevSuffix(callString: string, devSuffix: string): string {
  if (!devSuffix) return callString;
  return callString.slice(0, -1) + devSuffix + ')';
}

import { transformJsxElement, transformJsxFragment } from './jsx-elements-core.js';

export { transformJsxElement, transformJsxFragment };

export interface TransformAllJsxInput {
  source: string;
  s: MagicString;
  program: AstProgram;
  importedNames: Set<string>;
}

export interface TransformAllJsxOptions {
  skipRanges?: Array<{ start: number; end: number }>;
  devOptions?: DevSuffixOptions;
  keyCounterStart?: number;
  enableSignals?: boolean;
  qpOverrides?: Map<number, string[]>;
  qrlsWithCaptures?: Set<string>;
  paramNames?: Set<string>;
  relPath?: string;
  sharedSignalHoister?: SignalHoister;
  precomputedScopeBindings?: ScopeAwareCollectResult;
}

export function transformAllJsx(
  input: TransformAllJsxInput,
  opts: TransformAllJsxOptions = {}
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
  const ranges = buildSkipRangeIndex(skipRanges ?? []);
  const jsxWriteMemo = new Map<number, { end: number; content: string }>();
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
    jsxWriteMemo,
  };

  // Over a wrapped body, `source` is the wrapped body, so computing
  // `lineStarts` from it yields body-relative dev-info positions;
  // `devOptions.sourcePosition` supplies the original source + offset to convert
  // to source-relative. Module-level callers omit it.
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
    let lo = 0,
      hi = lineStarts.length - 1;
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

  // Enter/Exit context views so the type system enforces "enter gathers, exit
  // acts": calling `writeJsxCall` from enter is a compile error because
  // EnterContext lacks it.
  const jsxWrites: RecordedJsxWrite[] = [];
  const enterCtx: JsxWalkEnterContext = {
    source,
    loopStack,
    childJsxNodes,
  };
  const exitCtx: JsxWalkExitContext = {
    ...enterCtx,
    ranges,
    jsxCtx,
    enableSignals,
    qpOverrides,
    neededImports,
    getDevSourceSuffix,
    setNeedsFragment: () => {
      needsFragment = true;
    },
    writeJsxCall: (start, end, content) => {
      s.overwrite(start, end, content);
      jsxWrites.push({ start, end, content });
      jsxWriteMemo.set(start, { end, content });
    },
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

      const currentLoop = ctx.loopStack.length > 0 ? ctx.loopStack[ctx.loopStack.length - 1] : null;

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
          ctx.writeJsxCall(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
          for (const imp of result.neededImports) ctx.neededImports.add(imp);
        }
      } else if (node.type === 'JSXFragment') {
        const result = transformJsxFragment(ctx.jsxCtx, node);
        if (result) {
          const callStr = appendDevSuffix(result.callString, ctx.getDevSourceSuffix(node.start));
          ctx.writeJsxCall(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
          for (const imp of result.neededImports) ctx.neededImports.add(imp);
          ctx.setNeedsFragment();
        }
      }
    },
  });

  const renameMap = signalHoister.buildRenameMap();
  if (renameMap && renameMap.size > 0) {
    applySignalHoistRenames(s, renameMap, jsxWrites);
  }

  const hoistedDeclarations = signalHoister.getDeclarations();
  return {
    neededImports,
    needsFragment,
    hoistedDeclarations,
    keyCounterValue: keyCounter.current(),
  };
}
