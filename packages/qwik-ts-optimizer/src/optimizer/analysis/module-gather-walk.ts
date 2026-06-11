/**
 * Canonical per-module gather walk.
 *
 * One ScopeTracker build walk plus one gather walk over the original parsed
 * program produce every per-module fact that previously required its own
 * full-program walk:
 *
 *   - free identifiers per extraction closure (was `computeClosureFreeIdentifiers`,
 *     itself the group-1 fusion of per-closure `getUndeclaredIdentifiersInFunction`)
 *   - lexical scope chains per closure (was `buildClosureLexicalScopes`)
 *   - extraction loop contexts + per-loop var decls (was `buildExtractionLoopMap`)
 *   - function/for-loop scope entries (was `collectAllScopeEntries`)
 *   - segment/root identifier usage (was `computeSegmentUsage`)
 *   - passive:/preventdefault: JSX attribute conflicts (was the walk inside
 *     `detectPassivePreventdefaultConflicts`; emission stays at the Phase-4
 *     call site so diagnostic order is unchanged)
 *   - scope-aware JSX bindings (was the standalone `collectScopeAwareBindings`
 *     walk that `transformAllJsx` ran on the parent program; threaded to the
 *     Phase-4 JSX transform via `precomputedScopeBindings`)
 *
 * Parity contract: each projection keeps the exact per-node logic of the
 * function it replaces — shared node-level helpers are imported from the
 * original modules where exportable, and the walk topology (DFS enter/leave
 * order) is identical because every original used the same `oxc-walker`
 * traversal. The originals are retained as differential oracles; see
 * `tests/optimizer/analysis/module-gather-walk.test.ts`.
 *
 * Projections that need whole-program knowledge before they can act
 * (segment-usage classification must see hoisted declarations) buffer during
 * enter and act after the walk returns — the Program-exit act of the
 * single-pass stack model. The free-identifier projection follows the same
 * shape: identifier visits buffer `(name, scopeKey)` per open closure and
 * resolve after the walk via `ScopeQueryTracker.getDeclarationFromScope`,
 * so resolution no longer depends on the walk cursor — the precondition for
 * building the tracker *during* the gather walk instead of before it.
 */

import { isBindingIdentifier, walk } from 'oxc-walker';
import type { ScopeTrackerNode } from 'oxc-walker';
import { ScopeQueryTracker } from './scope-query-tracker.js';
import type { AstFunction, AstNode, AstProgram } from '../../ast-types.js';
import { walkWithProtocol } from '../ast/walk-with-protocol.js';
import { addBindingNamesFromPatternToSet } from '../ast/binding-pattern.js';
import { getJsxAttributeName } from '../jsx/jsx-attr-name.js';
import { detectLoopContext, type LoopContext } from '../jsx/loop-hoisting.js';
import {
  buildForLoopScopeEntry,
  buildFunctionScopeEntry,
  loopBodyKey,
  type LoopBodyVarDeclMap,
  type ScopeEntry,
} from '../jsx/event-capture-promotion.js';
import {
  collectShallowDeclarationsFromBody,
  collectShallowDeclarationsFromStatement,
} from './capture-analysis.js';
import {
  DECLARATION_TYPES,
  addDeclaredNamesFromNode,
  collectRootDeclPositions,
} from './variable-migration.js';
import {
  createScopeBindingsCollector,
  type ScopeAwareCollectResult,
  type ScopeBindingsCollector,
} from '../jsx/jsx.js';

/** Inputs for the segment-usage projection. */
export interface UsageExtractionRange {
  readonly symbolName: string;
  readonly argStart: number;
  readonly argEnd: number;
}

/** Inputs for the loop-map projection. */
export interface CallExtractionRange {
  readonly symbolName: string;
  readonly callStart: number;
  readonly callEnd: number;
}

/** One passive:/preventdefault: conflict site, gathered during the walk and
 * emitted as a diagnostic later (Phase 4) to preserve diagnostic order. */
export interface PassiveConflict {
  readonly eventName: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Which facts to gather. A projection runs iff its input field is present —
 * passing an empty array/map still runs the projection (matching the
 * original functions, which walked regardless of how many targets they had).
 */
export interface ModuleGatherInputs {
  readonly program: AstProgram;
  /** Enables the free-identifier and lexical-scope projections. */
  readonly closureNodes?: ReadonlyMap<string, AstFunction>;
  /** Enables the segment-usage projection. */
  readonly usageExtractions?: ReadonlyArray<UsageExtractionRange>;
  /** Enables the loop-map projection. */
  readonly loopExtractions?: ReadonlyArray<CallExtractionRange>;
  /** Source text for `detectLoopContext`; required by the loop-map projection. */
  readonly repairedCode?: string;
  /** Enables the scope-entry projection. */
  readonly scopeEntries?: boolean;
  /** Enables the passive-conflict projection. */
  readonly passiveConflicts?: boolean;
  /** Enables the scope-aware-bindings projection (the gather half of the
   * JSX transform's `collectScopeAwareBindings`). */
  readonly scopeBindings?: boolean;
}

/** Every gathered fact. Fields for disabled projections are empty. */
export interface ModuleGatherFacts {
  readonly closureFreeIdentifiers: ReadonlyMap<AstFunction, readonly string[]>;
  readonly closureLexicalScopes: Map<string, Set<string>>;
  readonly extractionLoopMap: Map<string, LoopContext[]>;
  readonly loopBodyVarDecls: LoopBodyVarDeclMap;
  readonly allScopeEntries: ScopeEntry[];
  readonly segmentUsage: Map<string, Set<string>>;
  readonly rootUsage: Set<string>;
  readonly passiveConflicts: PassiveConflict[];
  /** Present iff the scope-bindings projection was enabled. */
  readonly scopeAwareBindings: ScopeAwareCollectResult | undefined;
}

/**
 * Scope-key containment: is `scope` equal to or nested under `ancestor`?
 * Scope keys are dash-joined index paths (`"0-2-1"`); the root scope is
 * the empty string. Segment-wise comparison — a bare `startsWith` would
 * make `"0-11"` a child of `"0-1"`.
 */
function isScopeWithin(scope: string, ancestor: string): boolean {
  if (ancestor === '') return true;
  return scope === ancestor || scope.startsWith(`${ancestor}-`);
}

function isFunctionLike(node: AstNode): node is AstFunction {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

interface OpenClosure {
  readonly fn: AstFunction;
  readonly names: string[];
  readonly dedupe: Set<string>;
  /**
   * Scope key of the outermost scope this closure node pushes. A
   * `FunctionExpression` pushes an id-holding scope above its param scope,
   * so its own-name binding (`$(function g() { g(); })`) counts as
   * internal — matching the closure-rooted analysis, where that binding
   * lands inside the walked subtree.
   */
  readonly ownScope: string;
  /**
   * `(scopeKey, name)` pairs already buffered for this closure. Identical
   * pairs resolve identically, so dropping repeats keeps the buffer bounded
   * without changing which visit is the first free occurrence — the
   * property that fixes each closure's `names` order.
   */
  readonly seen: Set<string>;
}

/** One buffered identifier visit awaiting post-walk resolution. */
interface PendingResolution {
  readonly oc: OpenClosure;
  readonly name: string;
  readonly scopeKey: string;
}

/** Shared mutable walk state — the gather buffers every projection fills. */
interface GatherEnterContext {
  readonly tracker: ScopeQueryTracker | undefined;
  // Free-identifier projection
  readonly freeIdentNames: ReadonlyMap<AstFunction, string[]>;
  readonly freeIdentDedupes: ReadonlyMap<AstFunction, Set<string>>;
  readonly openClosures: readonly OpenClosure[];
  readonly pushOpenClosure: (oc: OpenClosure) => void;
  readonly pendingResolutions: PendingResolution[];
  // Lexical-scope projection
  readonly lexicalEnabled: boolean;
  readonly nodeToSymbol: ReadonlyMap<AstFunction, string>;
  readonly scopeStack: readonly Set<string>[];
  readonly pushScope: (scope: Set<string>) => void;
  readonly closureLexicalScopes: Map<string, Set<string>>;
  // Loop-map projection
  readonly loopEnabled: boolean;
  readonly loopExtractions: ReadonlyArray<CallExtractionRange>;
  readonly repairedCode: string;
  readonly loopStack: readonly LoopContext[];
  readonly pushLoop: (loopCtx: LoopContext) => void;
  readonly extractionLoopMap: Map<string, LoopContext[]>;
  readonly loopBodyVarDecls: LoopBodyVarDeclMap;
  // Scope-entry projection
  readonly scopeEntriesEnabled: boolean;
  readonly allScopeEntries: ScopeEntry[];
  // Segment-usage projection
  readonly usageEnabled: boolean;
  readonly usageExtractions: ReadonlyArray<UsageExtractionRange>;
  readonly extractionLocals: ReadonlyMap<string, Set<string>>;
  readonly identifierVisits: Array<{ pos: number; name: string }>;
  readonly declVisits: AstNode[];
  // Passive-conflict projection
  readonly passiveEnabled: boolean;
  readonly passiveConflicts: PassiveConflict[];
  // Scope-bindings projection
  readonly scopeBindingsCollector: ScopeBindingsCollector | undefined;
}

/** Exit view: adds the stack-pop act-helpers. */
interface GatherExitContext extends GatherEnterContext {
  readonly popOpenClosureIfMatches: (node: AstNode) => void;
  readonly popScopeIfFunction: (node: AstNode) => void;
  readonly popLoopIfMatches: (node: AstNode) => void;
}

/**
 * Run the canonical gather walk. At most two program traversals: the
 * ScopeTracker build walk (only when the free-identifier projection is on
 * and has closures to track) and the gather walk itself.
 */
export function gatherModuleFacts(inputs: ModuleGatherInputs): ModuleGatherFacts {
  const { program } = inputs;

  // --- Free-identifier projection setup (computeClosureFreeIdentifiers) ---
  const freeIdentNames = new Map<AstFunction, string[]>();
  const freeIdentDedupes = new Map<AstFunction, Set<string>>();
  for (const fn of inputs.closureNodes?.values() ?? []) {
    if (!freeIdentNames.has(fn)) {
      freeIdentNames.set(fn, []);
      freeIdentDedupes.set(fn, new Set());
    }
  }
  let tracker: ScopeQueryTracker | undefined;
  if (freeIdentNames.size > 0) {
    tracker = new ScopeQueryTracker({ preserveExitedScopes: true });
    walk(program, { scopeTracker: tracker });
    tracker.freeze();
  }
  const openClosures: OpenClosure[] = [];
  const pendingResolutions: PendingResolution[] = [];

  // --- Lexical-scope projection setup (buildClosureLexicalScopes) ---
  const lexicalEnabled = inputs.closureNodes !== undefined;
  const nodeToSymbol = new Map<AstFunction, string>();
  if (inputs.closureNodes) {
    for (const [sym, fn] of inputs.closureNodes) {
      nodeToSymbol.set(fn, sym);
    }
  }
  const closureLexicalScopes = new Map<string, Set<string>>();
  const scopeStack: Set<string>[] = [];
  if (lexicalEnabled) {
    // Module scope is pre-collected: the walk's enter fires for the
    // program's children but not the Program node itself.
    const moduleScope = new Set<string>();
    for (const stmt of program.body ?? []) {
      collectShallowDeclarationsFromStatement(stmt, moduleScope);
    }
    scopeStack.push(moduleScope);
  }

  // --- Loop-map projection setup (buildExtractionLoopMap) ---
  const loopEnabled = inputs.loopExtractions !== undefined;
  const loopExtractions = inputs.loopExtractions ?? [];
  const repairedCode = inputs.repairedCode ?? '';
  const loopStack: LoopContext[] = [];
  const extractionLoopMap = new Map<string, LoopContext[]>();
  const loopBodyVarDecls: LoopBodyVarDeclMap = new Map();

  // --- Scope-entry projection setup (collectAllScopeEntries) ---
  const scopeEntriesEnabled = inputs.scopeEntries === true;
  const allScopeEntries: ScopeEntry[] = [];

  // --- Segment-usage projection setup (computeSegmentUsage) ---
  const usageEnabled = inputs.usageExtractions !== undefined;
  const usageExtractions = inputs.usageExtractions ?? [];
  const segmentUsage = new Map<string, Set<string>>();
  const rootUsage = new Set<string>();
  const extractionLocals = new Map<string, Set<string>>();
  for (const ext of usageExtractions) {
    segmentUsage.set(ext.symbolName, new Set());
    extractionLocals.set(ext.symbolName, new Set());
  }
  const rootDeclPositions = usageEnabled ? collectRootDeclPositions(program) : new Set<number>();
  const identifierVisits: Array<{ pos: number; name: string }> = [];
  const declVisits: AstNode[] = [];

  // --- Passive-conflict projection setup ---
  const passiveEnabled = inputs.passiveConflicts === true;
  const passiveConflicts: PassiveConflict[] = [];

  // --- Scope-bindings projection setup (collectScopeAwareBindings) ---
  let scopeBindingsCollector: ScopeBindingsCollector | undefined;
  if (inputs.scopeBindings === true) {
    scopeBindingsCollector = createScopeBindingsCollector(program);
  }

  const enterCtx: GatherEnterContext = {
    tracker,
    freeIdentNames,
    freeIdentDedupes,
    openClosures,
    pushOpenClosure: (oc) => { openClosures.push(oc); },
    pendingResolutions,
    lexicalEnabled,
    nodeToSymbol,
    scopeStack,
    pushScope: (scope) => { scopeStack.push(scope); },
    closureLexicalScopes,
    loopEnabled,
    loopExtractions,
    repairedCode,
    loopStack,
    pushLoop: (loopCtx) => { loopStack.push(loopCtx); },
    extractionLoopMap,
    loopBodyVarDecls,
    scopeEntriesEnabled,
    allScopeEntries,
    usageEnabled,
    usageExtractions,
    extractionLocals,
    identifierVisits,
    declVisits,
    passiveEnabled,
    passiveConflicts,
    scopeBindingsCollector,
  };

  const exitCtx: GatherExitContext = {
    ...enterCtx,
    popOpenClosureIfMatches: (node) => {
      if (openClosures.length > 0 && openClosures[openClosures.length - 1].fn === node) {
        openClosures.pop();
      }
    },
    popScopeIfFunction: (node) => {
      if (isFunctionLike(node)) scopeStack.pop();
    },
    popLoopIfMatches: (node) => {
      if (detectLoopContext(node, repairedCode)) loopStack.pop();
    },
  };

  walkWithProtocol(
    program,
    enterCtx,
    exitCtx,
    {
      enter(node, parent, ctx) {
        enterFreeIdentifiers(node, parent, ctx);
        enterLexicalScopes(node, ctx);
        enterLoopMap(node, ctx);
        enterScopeEntries(node, ctx);
        enterSegmentUsage(node, ctx);
        enterPassiveConflicts(node, ctx);
        ctx.scopeBindingsCollector?.enter(node);
      },
      leave(node, _parent, ctx) {
        ctx.popOpenClosureIfMatches(node);
        if (ctx.lexicalEnabled) ctx.popScopeIfFunction(node);
        if (ctx.loopEnabled) ctx.popLoopIfMatches(node);
        ctx.scopeBindingsCollector?.leave(node);
      },
    },
    tracker ? { scopeTracker: tracker } : undefined,
  );

  // Program-exit act for the free-identifier projection: resolve the
  // buffered identifier visits against the frozen tracker, in occurrence
  // order so each closure's name list keeps first-free-occurrence order.
  if (tracker !== undefined) {
    resolveFreeIdentifiers(pendingResolutions, tracker);
  }

  // Program-exit act for the segment-usage projection: classification must
  // wait until the locals map has seen hoisted declarations (an identifier
  // reference can be visited before its `function g() {}` declaration).
  if (usageEnabled) {
    classifySegmentUsage(
      declVisits,
      identifierVisits,
      usageExtractions,
      extractionLocals,
      rootDeclPositions,
      segmentUsage,
      rootUsage,
    );
  }

  return {
    closureFreeIdentifiers: freeIdentNames,
    closureLexicalScopes,
    extractionLoopMap,
    loopBodyVarDecls,
    allScopeEntries,
    segmentUsage,
    rootUsage,
    passiveConflicts,
    scopeAwareBindings: scopeBindingsCollector?.result(),
  };
}

/** Free-identifier projection — `computeClosureFreeIdentifiers`'s gather
 * half. Pure buffering of `(name, scopeKey)` per open closure; resolution
 * happens post-walk in {@link resolveFreeIdentifiers}. The same name can
 * resolve free at one reference site and internal at another (shadowing),
 * which is why the buffer keys on the scope key, not the name alone. */
function enterFreeIdentifiers(
  node: AstNode,
  parent: AstNode | null,
  ctx: GatherEnterContext,
): void {
  const { tracker, openClosures } = ctx;
  if (tracker === undefined) return;

  if (isFunctionLike(node) && ctx.freeIdentNames.has(node)) {
    // The tracker has already pushed this node's scope(s) — its
    // processNodeEnter runs before this callback. Current key is the
    // innermost own scope; for FunctionExpression strip one segment
    // to reach the id-holding outer scope.
    const current = tracker.getCurrentScope();
    let ownScope = current;
    if (node.type === 'FunctionExpression') {
      const cut = current.lastIndexOf('-');
      ownScope = cut === -1 ? '' : current.slice(0, cut);
    }
    ctx.pushOpenClosure({
      fn: node,
      names: ctx.freeIdentNames.get(node)!,
      dedupe: ctx.freeIdentDedupes.get(node)!,
      ownScope,
      seen: new Set(),
    });
  }

  if (openClosures.length === 0) return;
  if (node.type !== 'Identifier') return;
  if (isBindingIdentifier(node, parent)) return;

  const name = node.name;
  const scopeKey = tracker.getCurrentScope();
  const seenKey = `${scopeKey} ${name}`;
  for (const oc of openClosures) {
    if (oc.seen.has(seenKey)) continue;
    oc.seen.add(seenKey);
    ctx.pendingResolutions.push({ oc, name, scopeKey });
  }
}

/** Post-walk act for the free-identifier projection: resolve the buffered
 * visits in occurrence order against the frozen tracker. Resolution is
 * memoized per `(name, scopeKey)` — the chain-walk is the expensive step
 * and identical pairs resolve identically. */
function resolveFreeIdentifiers(
  pending: readonly PendingResolution[],
  tracker: ScopeQueryTracker,
): void {
  const memo = new Map<string, ScopeTrackerNode | null>();
  for (const { oc, name, scopeKey } of pending) {
    if (oc.dedupe.has(name)) continue;
    const memoKey = `${scopeKey} ${name}`;
    let decl: ScopeTrackerNode | null;
    if (memo.has(memoKey)) {
      decl = memo.get(memoKey)!;
    } else {
      decl = tracker.getDeclarationFromScope(name, scopeKey);
      memo.set(memoKey, decl);
    }
    let free: boolean;
    if (decl === null) {
      // No declaration anywhere on the chain — global or unresolved.
      // Free in every enclosing closure, as in the per-closure form.
      free = true;
    } else if (decl.node === (oc.fn as unknown)) {
      // A FunctionDeclaration closure referencing its own name: the
      // closure-rooted tracker declares that name at its root scope,
      // so the per-closure form treats it as internal.
      free = false;
    } else {
      free = !isScopeWithin(decl.scope, oc.ownScope);
    }
    if (free) {
      oc.dedupe.add(name);
      oc.names.push(name);
    }
  }
}

/** Lexical-scope projection — `buildClosureLexicalScopes`'s scope stack. */
function enterLexicalScopes(node: AstNode, ctx: GatherEnterContext): void {
  if (!ctx.lexicalEnabled) return;
  if (!isFunctionLike(node)) return;

  const sym = ctx.nodeToSymbol.get(node);
  if (sym !== undefined) {
    // Record union of all enclosing scopes BEFORE pushing this
    // closure's own scope. The closure's params land in
    // `analyzeCaptures(..).paramNames` separately.
    const union = new Set<string>();
    for (const scope of ctx.scopeStack) {
      for (const id of scope) union.add(id);
    }
    ctx.closureLexicalScopes.set(sym, union);
  }

  // Push this function's own scope so any nested closure sees it as
  // an enclosing scope. Includes params + shallow body decls; nested
  // function bodies are explored by the walker recursively, not by
  // this collector.
  const ownScope = new Set<string>();
  for (const param of node.params ?? []) {
    addBindingNamesFromPatternToSet(param, ownScope);
  }
  if (node.body) {
    collectShallowDeclarationsFromBody(node.body, ownScope);
  }
  ctx.pushScope(ownScope);
}

/** Loop-map projection — `buildExtractionLoopMap`'s loop stack + buckets. */
function enterLoopMap(node: AstNode, ctx: GatherEnterContext): void {
  if (!ctx.loopEnabled) return;

  const loopCtx = detectLoopContext(node, ctx.repairedCode);
  if (loopCtx) {
    ctx.pushLoop(loopCtx);
    if (!ctx.loopBodyVarDecls.has(loopBodyKey(loopCtx.loopBodyStart, loopCtx.loopBodyEnd))) {
      ctx.loopBodyVarDecls.set(loopBodyKey(loopCtx.loopBodyStart, loopCtx.loopBodyEnd), []);
    }
  }
  // VariableDeclarations encountered inside any active loop body get
  // bucketed under the innermost loop. Skips loops' OWN init clauses
  // (those are scoped to the loop construct, not its body).
  if (node.type === 'VariableDeclaration' && ctx.loopStack.length > 0 && node.start !== undefined) {
    const innermost = ctx.loopStack[ctx.loopStack.length - 1];
    if (node.start >= innermost.loopBodyStart && node.end !== undefined && node.end <= innermost.loopBodyEnd) {
      const bucket = ctx.loopBodyVarDecls.get(loopBodyKey(innermost.loopBodyStart, innermost.loopBodyEnd))!;
      for (const decl of node.declarations ?? []) {
        if (decl.id?.type === 'Identifier') {
          bucket.push({ name: decl.id.name, declStart: decl.start ?? node.start });
        }
      }
    }
  }
  // Check if this node's range matches any extraction's call range
  if (
    node.start !== undefined &&
    node.end !== undefined &&
    ctx.loopStack.length > 0
  ) {
    for (const ext of ctx.loopExtractions) {
      if (node.start <= ext.callStart && node.end >= ext.callEnd) {
        // This node contains the extraction -- record current loop stack
        // We only need the innermost, but store all for nested loop analysis
        if (
          !ctx.extractionLoopMap.has(ext.symbolName) ||
          ctx.extractionLoopMap.get(ext.symbolName)!.length < ctx.loopStack.length
        ) {
          ctx.extractionLoopMap.set(ext.symbolName, [...ctx.loopStack]);
        }
      }
    }
  }
}

/** Scope-entry projection — `collectAllScopeEntries`'s per-node records. */
function enterScopeEntries(node: AstNode, ctx: GatherEnterContext): void {
  if (!ctx.scopeEntriesEnabled) return;

  if (isFunctionLike(node) && node.start !== undefined && node.end !== undefined) {
    ctx.allScopeEntries.push(buildFunctionScopeEntry(node));
  }
  if (
    (node.type === 'ForOfStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForStatement') &&
    node.start !== undefined &&
    node.end !== undefined
  ) {
    const entry = buildForLoopScopeEntry(node);
    if (entry) ctx.allScopeEntries.push(entry);
  }
}

/** Segment-usage projection — `computeSegmentUsage`'s gather half. Pure
 * buffering; all attribution happens in {@link classifySegmentUsage}. */
function enterSegmentUsage(node: AstNode, ctx: GatherEnterContext): void {
  if (!ctx.usageEnabled) return;

  if (DECLARATION_TYPES.has(node.type) && ctx.usageExtractions.length > 0) {
    ctx.declVisits.push(node);
  }
  // JSXIdentifier matters too: <Component> references module-level bindings
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
    ctx.identifierVisits.push({ pos: node.start, name: node.name });
  }
}

/** Passive-conflict projection — the walk half of
 * `detectPassivePreventdefaultConflicts` (emission happens in Phase 4). */
function enterPassiveConflicts(node: AstNode, ctx: GatherEnterContext): void {
  if (!ctx.passiveEnabled) return;
  if (node.type !== 'JSXOpeningElement') return;

  const attrs = node.attributes ?? [];
  const passiveEvents = new Set<string>();
  const preventdefaultEvents = new Set<string>();

  for (const attr of attrs) {
    if (attr.type !== 'JSXAttribute') continue;

    const name = getJsxAttributeName(attr);

    if (name.startsWith('passive:')) {
      passiveEvents.add(name.slice('passive:'.length));
    } else if (name.startsWith('preventdefault:')) {
      preventdefaultEvents.add(name.slice('preventdefault:'.length));
    }
  }

  for (const eventName of passiveEvents) {
    if (preventdefaultEvents.has(eventName)) {
      ctx.passiveConflicts.push({ eventName, start: node.start, end: node.end });
    }
  }
}

/**
 * A sweep cursor over extraction arg ranges: feed it positions in ascending
 * order and it maintains the stack of ranges containing the current
 * position. Arg ranges are AST node ranges, so they nest properly or are
 * disjoint — the stack top is always the innermost containing range, which
 * is what the pre-sweep implementation found by scanning every extraction
 * per visit (the O(identifiers × extractions) shape this replaces).
 */
class ExtractionRangeSweep {
  private readonly sorted: UsageExtractionRange[];
  private next = 0;
  readonly stack: UsageExtractionRange[] = [];

  constructor(extractions: ReadonlyArray<UsageExtractionRange>) {
    // Ascending argStart; ties open the wider (outer) range first so the
    // stack stays outer-below-inner.
    this.sorted = [...extractions].sort(
      (a, b) => a.argStart - b.argStart || b.argEnd - a.argEnd,
    );
  }

  /** Advance to `pos`; afterwards `stack` holds exactly the ranges with
   * `argStart <= pos < argEnd`, innermost on top. */
  advanceTo(pos: number): void {
    const { sorted, stack } = this;
    while (stack.length > 0 && stack[stack.length - 1].argEnd <= pos) {
      stack.pop();
    }
    while (this.next < sorted.length && sorted[this.next].argStart <= pos) {
      const ext = sorted[this.next];
      this.next++;
      if (ext.argEnd > pos) stack.push(ext);
    }
  }
}

/**
 * Post-walk classification of buffered declaration and identifier visits —
 * the attribution half of `computeSegmentUsage`. Attribution waits for the
 * full locals map; in DFS order an identifier reference can be visited
 * before its hoisted declaration (`function f() { g(); function g() {} }`).
 *
 * Both buffers are classified by a sorted range-stack sweep instead of a
 * per-visit scan over every extraction, bounding the work at
 * O((visits + extractions) · nesting-depth) rather than
 * O(visits × extractions). The buffers arrive in DFS-enter order, which is
 * ascending by position for source-ordered AST properties; the sorts make
 * the sweep independent of that walker detail.
 */
function classifySegmentUsage(
  declVisits: readonly AstNode[],
  identifierVisits: ReadonlyArray<{ pos: number; name: string }>,
  extractions: ReadonlyArray<UsageExtractionRange>,
  extractionLocals: ReadonlyMap<string, Set<string>>,
  rootDeclPositions: ReadonlySet<number>,
  segmentUsage: Map<string, Set<string>>,
  rootUsage: Set<string>,
): void {
  // 1. Locals first — every containing extraction collects the decl's
  //    names, exactly as the oracle's per-extraction containment test did.
  const declSweep = new ExtractionRangeSweep(extractions);
  const sortedDecls = [...declVisits].sort((a, b) => a.start - b.start);
  for (const node of sortedDecls) {
    declSweep.advanceTo(node.start);
    for (const ext of declSweep.stack) {
      if (node.end > ext.argEnd) continue;
      addDeclaredNamesFromNode(node, extractionLocals.get(ext.symbolName)!);
    }
  }

  // 2. Identifier attribution against the now-complete locals map.
  const identSweep = new ExtractionRangeSweep(extractions);
  const sortedVisits = [...identifierVisits].sort((a, b) => a.pos - b.pos);
  for (const { pos, name } of sortedVisits) {
    identSweep.advanceTo(pos);
    const { stack } = identSweep;

    // When nested extractions overlap (e.g., $() inside component$()),
    // attribute to the innermost range — the stack top.
    const innermostExt = stack.length > 0 ? stack[stack.length - 1] : null;
    if (innermostExt) {
      const locals = extractionLocals.get(innermostExt.symbolName)!;
      if (!locals.has(name)) {
        segmentUsage.get(innermostExt.symbolName)!.add(name);
      }
    } else if (!rootDeclPositions.has(pos)) {
      rootUsage.add(name);
    }
  }
}
