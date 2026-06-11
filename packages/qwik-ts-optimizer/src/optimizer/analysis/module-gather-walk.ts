/**
 * Canonical per-module gather walk.
 *
 * One traversal over the original parsed program — building the
 * ScopeTracker as it goes — produces every per-module fact that previously
 * required its own full-program walk:
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
 * so resolution does not depend on the walk cursor — which is what allows
 * the tracker to build *during* the gather walk: by resolution time the
 * scope tree is complete, hoisted declarations included.
 */

import { isBindingIdentifier } from 'oxc-walker';
import type { ScopeTrackerNode } from 'oxc-walker';
import { ScopeQueryTracker } from './scope-query-tracker.js';
import type {
  AstEcmaScriptModule,
  AstFunction,
  AstNode,
  AstProgram,
} from '../../ast-types.js';
import {
  createExtractionCollector,
  type ExtractedSegment,
  type ExtractionCollector,
} from '../extraction/extract.js';
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
 * Inputs for hosting the Phase-1 extraction collector in the gather walk.
 * Mirrors the `extractSegments` parameter surface; the walk itself replaces
 * the standalone extraction traversal.
 */
export interface ExtractionGatherInputs {
  /** Repaired source text backing `program`. */
  readonly source: string;
  readonly relPath: string;
  readonly scope?: string;
  readonly transpileJsx?: boolean;
  readonly explicitTranspileJsx?: boolean;
  readonly parserModule?: AstEcmaScriptModule;
  /** Same out-map contract as `extractSegments`'s `closureNodesOut`. */
  readonly closureNodesOut?: Map<string, AstFunction>;
}

/**
 * Which facts to gather. A projection runs iff its input field is present —
 * passing an empty array/map still runs the projection (matching the
 * original functions, which walked regardless of how many targets they had).
 *
 * Two host modes:
 *   - **standalone-facts mode** — the caller already has extractions and
 *     passes `closureNodes` / `usageExtractions` / `loopExtractions`.
 *   - **fused-extraction mode** — `extraction` is set; the walk hosts the
 *     Phase-1 collector, discovers extractions itself, and the
 *     free-identifier, lexical-scope, loop-map, and segment-usage
 *     projections key off the discovered set. The three standalone-mode
 *     inputs must be omitted.
 */
export interface ModuleGatherInputs {
  readonly program: AstProgram;
  /** Hosts the Phase-1 extraction collector in this walk (fused mode). */
  readonly extraction?: ExtractionGatherInputs;
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
  /** Phase-1 extraction output; empty unless fused-extraction mode. */
  readonly extractions: readonly ExtractedSegment[];
  readonly closureFreeIdentifiers: ReadonlyMap<AstFunction, readonly string[]>;
  /**
   * Keyed by closure-node identity, not symbolName — in fused mode the
   * union is recorded mid-walk, before `disambiguateExtractions` finalises
   * names.
   */
  readonly closureLexicalScopes: Map<AstFunction, Set<string>>;
  readonly extractionLoopMap: Map<string, LoopContext[]>;
  readonly loopBodyVarDecls: LoopBodyVarDeclMap;
  readonly allScopeEntries: ScopeEntry[];
  /** Empty (not computed) when a fused-extraction walk found zero
   * extractions — migration is a no-op without segment usage, so the
   * classification sweep is skipped on extraction-less modules. */
  readonly segmentUsage: Map<string, Set<string>>;
  /** Same skip contract as `segmentUsage`. */
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

/**
 * One lexical-scope stack frame. The name set materializes lazily — only
 * when a registered closure requests the enclosing-scope union — so
 * modules (and functions) without extractions never pay the per-function
 * param/shallow-decl collection. `node === null` marks the module-scope
 * frame. Materialization is timing-independent: the collectors are pure
 * reads of the (immutable) AST, so computing the set at union time yields
 * exactly what computing it at push time would have.
 */
interface LexicalScopeFrame {
  readonly node: AstFunction | null;
  set: Set<string> | null;
}

function materializeScopeFrame(
  frame: LexicalScopeFrame,
  program: AstProgram,
): Set<string> {
  if (frame.set) return frame.set;
  const set = new Set<string>();
  if (frame.node === null) {
    // Module scope: the walk's enter fires for the program's children but
    // not the Program node itself, so it is collected from the body here.
    for (const stmt of program.body ?? []) {
      collectShallowDeclarationsFromStatement(stmt, set);
    }
  } else {
    for (const param of frame.node.params ?? []) {
      addBindingNamesFromPatternToSet(param, set);
    }
    if (frame.node.body) {
      collectShallowDeclarationsFromBody(frame.node.body, set);
    }
  }
  frame.set = set;
  return set;
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
  readonly tracker: ScopeQueryTracker;
  // Free-identifier projection
  readonly freeIdentNames: ReadonlyMap<AstFunction, string[]>;
  readonly freeIdentDedupes: ReadonlyMap<AstFunction, Set<string>>;
  readonly openClosures: readonly OpenClosure[];
  readonly pushOpenClosure: (oc: OpenClosure) => void;
  readonly pendingResolutions: PendingResolution[];
  // Lexical-scope projection
  readonly lexicalEnabled: boolean;
  /** Closure nodes whose enclosing-scope union gets recorded. In fused
   * mode this set grows mid-walk as extractions are discovered — always
   * before the walker reaches the closure node, because discovery happens
   * at the creation node's enter and the closure is a descendant. */
  readonly lexicalClosureNodes: ReadonlySet<AstFunction>;
  readonly program: AstProgram;
  readonly scopeStack: readonly LexicalScopeFrame[];
  readonly pushScope: (frame: LexicalScopeFrame) => void;
  readonly closureLexicalScopes: Map<AstFunction, Set<string>>;
  // Loop-map projection
  readonly loopEnabled: boolean;
  readonly loopExtractions: ReadonlyArray<CallExtractionRange>;
  readonly repairedCode: string;
  readonly loopStack: readonly LoopContext[];
  readonly pushLoop: (loopCtx: LoopContext) => void;
  readonly extractionLoopMap: Map<string, LoopContext[]>;
  readonly loopBodyVarDecls: LoopBodyVarDeclMap;
  // Scope-entry projection (buffers nodes; entries build post-walk)
  readonly scopeEntriesEnabled: boolean;
  readonly scopeEntryNodes: AstNode[];
  // Segment-usage projection
  readonly usageEnabled: boolean;
  /** True when declaration visits must buffer — there is at least one
   * usage extraction, or fused mode may still discover extractions. */
  readonly bufferDeclVisits: boolean;
  readonly identifierVisits: Array<{ pos: number; name: string }>;
  readonly declVisits: AstNode[];
  // Passive-conflict projection
  readonly passiveEnabled: boolean;
  readonly passiveConflicts: PassiveConflict[];
  // Scope-bindings projection
  readonly scopeBindingsCollector: ScopeBindingsCollector | undefined;
  // Fused-extraction host
  readonly extractionCollector: ExtractionCollector | undefined;
}

/** Exit view: adds the stack-pop act-helpers. */
interface GatherExitContext extends GatherEnterContext {
  readonly popOpenClosureIfMatches: (node: AstNode) => void;
  readonly popScopeIfFunction: (node: AstNode) => void;
  readonly popLoopIfMatches: (node: AstNode) => void;
}

/**
 * Run the canonical gather walk — one program traversal. The ScopeTracker
 * builds during the walk itself (attached unfrozen, frozen on return before
 * free-identifier resolution); there is no standalone build walk.
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
  // The tracker builds DURING the gather walk (it is attached unfrozen and
  // collects declarations as the walk traverses) — possible because
  // free-identifier resolution is post-walk and the only mid-walk reads are
  // `getCurrentScope()` cursor lookups, which the walker keeps current
  // before each enter callback in build mode exactly as in replay mode.
  // Built unconditionally: closure-bearing modules need it, and the fusion
  // of Phase-1 extraction into this walk will discover closures mid-walk,
  // after the build-or-not decision would have to be made.
  const tracker = new ScopeQueryTracker({ preserveExitedScopes: true });
  const openClosures: OpenClosure[] = [];
  const pendingResolutions: PendingResolution[] = [];

  // --- Lexical-scope projection setup (buildClosureLexicalScopes) ---
  const lexicalEnabled =
    inputs.closureNodes !== undefined || inputs.extraction !== undefined;
  const lexicalClosureNodes = new Set<AstFunction>(
    inputs.closureNodes?.values() ?? [],
  );
  const closureLexicalScopes = new Map<AstFunction, Set<string>>();
  const scopeStack: LexicalScopeFrame[] = [];
  if (lexicalEnabled) {
    scopeStack.push({ node: null, set: null });
  }

  // --- Loop-map projection setup (buildExtractionLoopMap) ---
  const loopEnabled =
    inputs.loopExtractions !== undefined || inputs.extraction !== undefined;
  const loopExtractions = inputs.loopExtractions ?? [];
  const repairedCode = inputs.repairedCode ?? '';
  const loopStack: LoopContext[] = [];
  const extractionLoopMap = new Map<string, LoopContext[]>();
  const loopBodyVarDecls: LoopBodyVarDeclMap = new Map();

  // --- Scope-entry projection setup (collectAllScopeEntries) ---
  const scopeEntriesEnabled = inputs.scopeEntries === true;
  const scopeEntryNodes: AstNode[] = [];
  const allScopeEntries: ScopeEntry[] = [];

  // --- Segment-usage projection setup (computeSegmentUsage) ---
  const usageEnabled =
    inputs.usageExtractions !== undefined || inputs.extraction !== undefined;
  const usageExtractions = inputs.usageExtractions ?? [];
  const segmentUsage = new Map<string, Set<string>>();
  const rootUsage = new Set<string>();
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

  // --- Fused-extraction host setup (Phase-1 extractSegments) ---
  // Loop-stack snapshots key by extraction object identity:
  // `disambiguateExtractions` rewrites symbolNames post-walk, so the
  // symbolName-keyed `extractionLoopMap` is derived after `finish()`.
  const extractionLoopRefs = new Map<ExtractedSegment, LoopContext[]>();
  let extractionCollector: ExtractionCollector | undefined;
  if (inputs.extraction !== undefined) {
    const ex = inputs.extraction;
    extractionCollector = createExtractionCollector({
      source: ex.source,
      relPath: ex.relPath,
      program,
      parserModule: ex.parserModule,
      scope: ex.scope,
      transpileJsx: ex.transpileJsx,
      explicitTranspileJsx: ex.explicitTranspileJsx,
      closureNodesOut: ex.closureNodesOut,
      onExtraction: (extraction, closureNode) => {
        // Fires at the creation node's enter — before the walker descends
        // into the closure body, so the free-identifier and lexical-scope
        // projections see the registration when they reach the node.
        if (closureNode && !freeIdentNames.has(closureNode)) {
          freeIdentNames.set(closureNode, []);
          freeIdentDedupes.set(closureNode, new Set());
          lexicalClosureNodes.add(closureNode);
        }
        // Snapshot of the enclosing loop stack. Equivalent to the oracle's
        // max-depth scan over every node containing the call range: loops
        // pop only on leave, so the stack at the creation node's enter is
        // exactly the deepest stack any containing node observes (the
        // creation node is never itself a loop context — marker and
        // inlinedQrl calls have Identifier callees, never `.map`).
        if (loopStack.length > 0) {
          extractionLoopRefs.set(extraction, [...loopStack]);
        }
      },
    });
  }

  const enterCtx: GatherEnterContext = {
    tracker,
    freeIdentNames,
    freeIdentDedupes,
    openClosures,
    pushOpenClosure: (oc) => { openClosures.push(oc); },
    pendingResolutions,
    lexicalEnabled,
    lexicalClosureNodes,
    program,
    scopeStack,
    pushScope: (frame) => { scopeStack.push(frame); },
    closureLexicalScopes,
    loopEnabled,
    loopExtractions,
    repairedCode,
    loopStack,
    pushLoop: (loopCtx) => { loopStack.push(loopCtx); },
    extractionLoopMap,
    loopBodyVarDecls,
    scopeEntriesEnabled,
    scopeEntryNodes,
    usageEnabled,
    bufferDeclVisits:
      usageExtractions.length > 0 || inputs.extraction !== undefined,
    identifierVisits,
    declVisits,
    passiveEnabled,
    passiveConflicts,
    scopeBindingsCollector,
    extractionCollector,
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
      // `detectLoopContext` always sets `loopNode` to the node it was
      // given, and loops nest properly, so the stack top on leave is this
      // node's own context iff a context was pushed on its enter —
      // identity comparison replaces a second detection pass per node.
      if (
        loopStack.length > 0 &&
        loopStack[loopStack.length - 1].loopNode === node
      ) {
        loopStack.pop();
      }
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
        // The extraction collector runs after the projections so its
        // onExtraction hook observes this node's loop-stack push (no
        // creation node is itself a loop context, but the ordering keeps
        // the invariant local rather than depending on that fact).
        ctx.extractionCollector?.enter(node, parent);
      },
      leave(node, _parent, ctx) {
        ctx.extractionCollector?.leave(node);
        ctx.popOpenClosureIfMatches(node);
        if (ctx.lexicalEnabled) ctx.popScopeIfFunction(node);
        if (ctx.loopEnabled) ctx.popLoopIfMatches(node);
        ctx.scopeBindingsCollector?.leave(node);
      },
    },
    { scopeTracker: tracker },
  );

  // Program-exit act for the fused-extraction host: disambiguate names,
  // then derive the symbolName-keyed maps from the identity-keyed
  // mid-walk records (names are only final after disambiguation).
  const extractions = extractionCollector?.finish() ?? [];
  for (const [ext, stack] of extractionLoopRefs) {
    extractionLoopMap.set(ext.symbolName, stack);
  }

  // Program-exit act for the scope-entry projection. Skipped when a
  // fused walk found no extractions — the entries' sole consumer
  // (event-handler capture promotion) iterates extractions.
  if (
    scopeEntriesEnabled &&
    (inputs.extraction === undefined || extractions.length > 0)
  ) {
    for (const node of scopeEntryNodes) {
      if (isFunctionLike(node)) {
        allScopeEntries.push(buildFunctionScopeEntry(node));
      } else {
        const entry = buildForLoopScopeEntry(node);
        if (entry) allScopeEntries.push(entry);
      }
    }
  }

  // Program-exit act for the free-identifier projection: the walk has
  // populated the full scope tree (hoisted declarations included), so
  // freeze and resolve the buffered identifier visits, in occurrence order
  // so each closure's name list keeps first-free-occurrence order.
  tracker.freeze();
  resolveFreeIdentifiers(pendingResolutions, tracker);

  // Program-exit act for the segment-usage projection: classification must
  // wait until the locals map has seen hoisted declarations (an identifier
  // reference can be visited before its `function g() {}` declaration).
  // A fused walk that discovered no extractions skips it: every rootUsage
  // read downstream is conjunctive with segment usage (`usedByRoot &&
  // usedByAnySegment` and the MIG-05a single-target check), so with an
  // empty segmentUsage the migration outcome is `keep` for every decl
  // regardless of rootUsage — sorting the identifier buffer would be pure
  // waste on extraction-less modules.
  const classifyUsage =
    usageEnabled && (inputs.extraction === undefined || extractions.length > 0);
  if (classifyUsage) {
    const usageRanges: ReadonlyArray<UsageExtractionRange> =
      inputs.extraction !== undefined ? extractions : usageExtractions;
    const extractionLocals = new Map<string, Set<string>>();
    for (const ext of usageRanges) {
      segmentUsage.set(ext.symbolName, new Set());
      extractionLocals.set(ext.symbolName, new Set());
    }
    classifySegmentUsage(
      declVisits,
      identifierVisits,
      usageRanges,
      extractionLocals,
      collectRootDeclPositions(program),
      segmentUsage,
      rootUsage,
    );
  }

  return {
    extractions,
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

  if (ctx.lexicalClosureNodes.has(node)) {
    // Record union of all enclosing scopes BEFORE pushing this
    // closure's own scope. The closure's params land in
    // `analyzeCaptures(..).paramNames` separately.
    const union = new Set<string>();
    for (const frame of ctx.scopeStack) {
      for (const id of materializeScopeFrame(frame, ctx.program)) {
        union.add(id);
      }
    }
    ctx.closureLexicalScopes.set(node, union);
  }

  // Push this function's own scope frame so any nested closure sees it as
  // an enclosing scope (params + shallow body decls, materialized lazily;
  // nested function bodies are explored by the walker recursively, not by
  // this collector).
  ctx.pushScope({ node, set: null });
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

/** Scope-entry projection — `collectAllScopeEntries`'s gather half. Pure
 * node buffering; the per-node entry records build post-walk (and are
 * skipped entirely when a fused walk found no extractions — the sole
 * consumer, event-handler capture promotion, iterates extractions). */
function enterScopeEntries(node: AstNode, ctx: GatherEnterContext): void {
  if (!ctx.scopeEntriesEnabled) return;

  if (
    (isFunctionLike(node) ||
      node.type === 'ForOfStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForStatement') &&
    node.start !== undefined &&
    node.end !== undefined
  ) {
    ctx.scopeEntryNodes.push(node);
  }
}

/** Segment-usage projection — `computeSegmentUsage`'s gather half. Pure
 * buffering; all attribution happens in {@link classifySegmentUsage}. */
function enterSegmentUsage(node: AstNode, ctx: GatherEnterContext): void {
  if (!ctx.usageEnabled) return;

  if (ctx.bufferDeclVisits && DECLARATION_TYPES.has(node.type)) {
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
