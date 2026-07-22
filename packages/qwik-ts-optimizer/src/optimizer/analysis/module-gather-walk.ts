/**
 * Canonical per-module gather walk: one traversal over the parsed program —
 * building the ScopeTracker as it goes — produces every per-module fact
 * (free identifiers, lexical scopes, loop contexts, scope entries, segment/root
 * usage, passive-directive conflicts, scope-aware JSX bindings) plus the
 * Phase-1 extraction set. Each fact is a projection; the standalone functions
 * they replace are retained as differential oracles.
 *
 * Projections needing whole-program knowledge before they can act (segment
 * usage must see hoisted declarations; free-identifier resolution needs the
 * complete scope tree) buffer during enter and resolve after the walk returns.
 * That post-walk resolution is what lets the tracker build during this walk
 * rather than in a separate pass before it.
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
import { addScopeDeclarations } from './capture-analysis.js';
import {
  DECLARATION_TYPES,
  addDeclaredNamesFromNode,
  collectRootDeclPositions,
  isNonReferenceIdentifier,
} from './variable-migration.js';
import {
  createScopeBindingsCollector,
  type ScopeAwareCollectResult,
  type ScopeBindingsCollector,
} from '../jsx/jsx.js';

export interface UsageExtractionRange {
  readonly symbolName: string;
  readonly argStart: number;
  readonly argEnd: number;
}

export interface CallExtractionRange {
  readonly symbolName: string;
  readonly callStart: number;
  readonly callEnd: number;
}

/** One passive:/preventdefault: conflict site; emission is deferred to Phase 4
 * to preserve diagnostic order. */
export interface PassiveConflict {
  readonly eventName: string;
  readonly start: number;
  readonly end: number;
}

export interface ExtractionGatherInputs {
  readonly source: string;
  readonly relPath: string;
  readonly scope?: string;
  readonly transpileJsx?: boolean;
  readonly explicitTranspileJsx?: boolean;
  readonly parserModule?: AstEcmaScriptModule;
  readonly closureNodesOut?: Map<string, AstFunction>;
}

/**
 * Which facts to gather: each projection runs iff its input field is present —
 * an empty array/map still runs it. Two host modes: standalone-facts (caller
 * passes `closureNodes` / `usageExtractions` / `loopExtractions` for existing
 * extractions) and fused-extraction (`extraction` is set; the walk hosts the
 * Phase-1 collector and the projections key off the discovered set, so the
 * three standalone inputs must be omitted).
 */
export interface ModuleGatherInputs {
  readonly program: AstProgram;
  readonly extraction?: ExtractionGatherInputs;
  readonly closureNodes?: ReadonlyMap<string, AstFunction>;
  readonly usageExtractions?: ReadonlyArray<UsageExtractionRange>;
  readonly loopExtractions?: ReadonlyArray<CallExtractionRange>;
  readonly repairedCode?: string;
  readonly scopeEntries?: boolean;
  readonly passiveConflicts?: boolean;
  readonly scopeBindings?: boolean;
}

/**
 * Every gathered fact; fields for disabled projections are empty. The
 * closure-keyed maps key by node identity, not symbolName — names aren't final
 * until post-walk disambiguation.
 */
export interface ModuleGatherFacts {
  readonly extractions: readonly ExtractedSegment[];
  readonly closureFreeIdentifiers: ReadonlyMap<AstFunction, readonly string[]>;
  readonly closureLexicalScopes: Map<AstFunction, Set<string>>;
  readonly extractionLoopMap: Map<string, LoopContext[]>;
  readonly loopBodyVarDecls: LoopBodyVarDeclMap;
  readonly allScopeEntries: ScopeEntry[];
  readonly segmentUsage: Map<string, Set<string>>;
  readonly rootUsage: Set<string>;
  readonly passiveConflicts: PassiveConflict[];
  readonly scopeAwareBindings: ScopeAwareCollectResult | undefined;
}

/**
 * Scope-key containment: is `scope` equal to or nested under `ancestor`? Keys
 * are dash-joined index paths; root is `""`. Segment-wise, not a bare
 * `startsWith`, which would make `"0-11"` a child of `"0-1"`.
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

/** One enclosing function scope; `node === null` is the module scope. */
interface LexicalScopeFrame {
  readonly node: AstFunction | null;
  readonly set: Set<string>;
}

/**
 * A closure whose free identifiers are being buffered. `ownScope` (its
 * outermost pushed scope key) treats a `FunctionExpression`'s own name as
 * internal — it sits above the param scope. `seen` dedups `(scopeKey, name)`
 * pairs without disturbing first-occurrence order.
 */
interface OpenClosure {
  readonly fn: AstFunction;
  readonly names: string[];
  readonly dedupe: Set<string>;
  readonly ownScope: string;
  readonly seen: Set<string>;
}

interface PendingResolution {
  readonly oc: OpenClosure;
  readonly name: string;
  readonly scopeKey: string;
}

/** Shared mutable walk state — the gather buffers every projection fills. */
interface GatherEnterContext {
  readonly tracker: ScopeQueryTracker;

  readonly freeIdentNames: ReadonlyMap<AstFunction, string[]>;
  readonly freeIdentDedupes: ReadonlyMap<AstFunction, Set<string>>;
  readonly openClosures: readonly OpenClosure[];
  readonly pushOpenClosure: (oc: OpenClosure) => void;
  readonly pendingResolutions: PendingResolution[];

  readonly lexicalEnabled: boolean;
  readonly lexicalClosureNodes: ReadonlySet<AstFunction>;
  readonly program: AstProgram;
  readonly scopeStack: readonly LexicalScopeFrame[];
  readonly pushScope: (frame: LexicalScopeFrame) => void;
  readonly closureLexicalScopes: Map<AstFunction, Set<string>>;
  readonly pendingLexicalUnions: Array<{ node: AstFunction; frames: readonly LexicalScopeFrame[] }>;

  readonly loopEnabled: boolean;
  readonly loopExtractions: ReadonlyArray<CallExtractionRange>;
  readonly repairedCode: string;
  readonly loopStack: readonly LoopContext[];
  readonly pushLoop: (loopCtx: LoopContext) => void;
  readonly extractionLoopMap: Map<string, LoopContext[]>;
  readonly loopBodyVarDecls: LoopBodyVarDeclMap;

  readonly scopeEntriesEnabled: boolean;
  readonly scopeEntryNodes: AstNode[];

  readonly usageEnabled: boolean;
  readonly bufferDeclVisits: boolean;
  readonly identifierVisits: Array<{ pos: number; name: string }>;
  readonly declVisits: AstNode[];

  readonly passiveEnabled: boolean;
  readonly passiveConflicts: PassiveConflict[];

  readonly scopeBindingsCollector: ScopeBindingsCollector | undefined;

  readonly extractionCollector: ExtractionCollector | undefined;
}

/** Exit view: adds the stack-pop act-helpers. */
interface GatherExitContext extends GatherEnterContext {
  readonly popOpenClosureIfMatches: (node: AstNode) => void;
  readonly popScopeIfFunction: (node: AstNode) => void;
  readonly popLoopIfMatches: (node: AstNode) => void;
}

/**
 * Run the canonical gather walk — one program traversal. The ScopeTracker is
 * attached unfrozen and frozen on return before free-identifier resolution.
 */
export function gatherModuleFacts(inputs: ModuleGatherInputs): ModuleGatherFacts {
  const { program } = inputs;

  const freeIdentNames = new Map<AstFunction, string[]>();
  const freeIdentDedupes = new Map<AstFunction, Set<string>>();
  for (const fn of inputs.closureNodes?.values() ?? []) {
    if (!freeIdentNames.has(fn)) {
      freeIdentNames.set(fn, []);
      freeIdentDedupes.set(fn, new Set());
    }
  }
  // preserveExitedScopes: post-walk resolution reads scopes the walk already left.
  const tracker = new ScopeQueryTracker({ preserveExitedScopes: true });
  const openClosures: OpenClosure[] = [];
  const pendingResolutions: PendingResolution[] = [];

  const lexicalEnabled =
    inputs.closureNodes !== undefined || inputs.extraction !== undefined;
  const lexicalClosureNodes = new Set<AstFunction>(
    inputs.closureNodes?.values() ?? [],
  );
  const closureLexicalScopes = new Map<AstFunction, Set<string>>();
  const pendingLexicalUnions: Array<{ node: AstFunction; frames: readonly LexicalScopeFrame[] }> = [];
  const scopeStack: LexicalScopeFrame[] = [];
  if (lexicalEnabled) {
    scopeStack.push({ node: null, set: new Set() });
  }

  const loopEnabled =
    inputs.loopExtractions !== undefined || inputs.extraction !== undefined;
  const loopExtractions = inputs.loopExtractions ?? [];
  const repairedCode = inputs.repairedCode ?? '';
  const loopStack: LoopContext[] = [];
  const extractionLoopMap = new Map<string, LoopContext[]>();
  const loopBodyVarDecls: LoopBodyVarDeclMap = new Map();

  const scopeEntriesEnabled = inputs.scopeEntries === true;
  const scopeEntryNodes: AstNode[] = [];
  const allScopeEntries: ScopeEntry[] = [];

  const usageEnabled =
    inputs.usageExtractions !== undefined || inputs.extraction !== undefined;
  const usageExtractions = inputs.usageExtractions ?? [];
  const segmentUsage = new Map<string, Set<string>>();
  const rootUsage = new Set<string>();
  const identifierVisits: Array<{ pos: number; name: string }> = [];
  const declVisits: AstNode[] = [];

  const passiveEnabled = inputs.passiveConflicts === true;
  const passiveConflicts: PassiveConflict[] = [];

  let scopeBindingsCollector: ScopeBindingsCollector | undefined;
  if (inputs.scopeBindings === true) {
    scopeBindingsCollector = createScopeBindingsCollector(program);
  }

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
        if (closureNode && !freeIdentNames.has(closureNode)) {
          freeIdentNames.set(closureNode, []);
          freeIdentDedupes.set(closureNode, new Set());
          lexicalClosureNodes.add(closureNode);
        }
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
    pendingLexicalUnions,
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
        enterSegmentUsage(node, parent, ctx);
        enterPassiveConflicts(node, ctx);
        ctx.scopeBindingsCollector?.enter(node);
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

  const extractions = extractionCollector?.finish() ?? [];
  for (const [ext, stack] of extractionLoopRefs) {
    extractionLoopMap.set(ext.symbolName, stack);
  }

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

  tracker.freeze();
  resolveFreeIdentifiers(pendingResolutions, tracker);

  // Deferred to post-walk: a later `const` in an enclosing scope is still a capture.
  for (const { node, frames } of pendingLexicalUnions) {
    const union = new Set<string>();
    for (const frame of frames) {
      for (const id of frame.set) union.add(id);
    }
    closureLexicalScopes.set(node, union);
  }

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

// A computed key (`obj[x]`, `{ [x]: v }`) references `x`, but oxc-walker's
// `isBindingIdentifier` ignores `computed` and reports it as a binding.
function isComputedKeyReference(node: AstNode, parent: AstNode | null): boolean {
  if (parent === null) return false;
  if (parent.type === 'MemberExpression') {
    return parent.computed === true && parent.property === node;
  }
  if (
    parent.type === 'Property' ||
    parent.type === 'MethodDefinition' ||
    parent.type === 'PropertyDefinition' ||
    parent.type === 'AccessorProperty'
  ) {
    return parent.computed === true && parent.key === node;
  }
  return false;
}

/**
 * Free-identifier projection: buffer `(name, scopeKey)` per open closure;
 * resolution happens post-walk in {@link resolveFreeIdentifiers}. The same name
 * can resolve free at one reference and internal at another (shadowing), so the
 * buffer keys on the scope key, not the name alone.
 */
function enterFreeIdentifiers(
  node: AstNode,
  parent: AstNode | null,
  ctx: GatherEnterContext,
): void {
  const { tracker, openClosures } = ctx;

  if (isFunctionLike(node) && ctx.freeIdentNames.has(node)) {
    const current = tracker.getCurrentScope();
    let ownScope = current;
    if (node.type === 'FunctionExpression') {
      // A FunctionExpression's own name lives one scope out from its body.
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
  if (isBindingIdentifier(node, parent) && !isComputedKeyReference(node, parent)) return;

  const name = node.name;
  const scopeKey = tracker.getCurrentScope();
  const seenKey = `${scopeKey} ${name}`;
  for (const oc of openClosures) {
    if (oc.seen.has(seenKey)) continue;
    oc.seen.add(seenKey);
    ctx.pendingResolutions.push({ oc, name, scopeKey });
  }
}

/**
 * Resolve the buffered free-identifier visits in occurrence order against the
 * frozen tracker. Memoized per `(name, scopeKey)`: the chain-walk is the
 * expensive step and identical pairs resolve identically.
 */
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
      free = true;
    } else if (decl.node === (oc.fn as unknown)) {
      // A FunctionDeclaration closure referencing its own name: declared at
      // its own root scope, so it is internal, not free.
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

function enterLexicalScopes(node: AstNode, ctx: GatherEnterContext): void {
  if (!ctx.lexicalEnabled) return;

  // Collect before pushing this node's own frame, so a function/class
  // declaration name lands in the enclosing scope, not its own.
  addScopeDeclarations(node, ctx.scopeStack[ctx.scopeStack.length - 1].set);

  if (!isFunctionLike(node)) return;

  if (ctx.lexicalClosureNodes.has(node)) {
    ctx.pendingLexicalUnions.push({ node, frames: [...ctx.scopeStack] });
  }

  const set = new Set<string>();
  for (const param of node.params ?? []) {
    addBindingNamesFromPatternToSet(param, set);
  }
  ctx.pushScope({ node, set });
}

function enterLoopMap(node: AstNode, ctx: GatherEnterContext): void {
  if (!ctx.loopEnabled) return;

  const loopCtx = detectLoopContext(node, ctx.repairedCode);
  if (loopCtx) {
    ctx.pushLoop(loopCtx);
    if (!ctx.loopBodyVarDecls.has(loopBodyKey(loopCtx.loopBodyStart, loopCtx.loopBodyEnd))) {
      ctx.loopBodyVarDecls.set(loopBodyKey(loopCtx.loopBodyStart, loopCtx.loopBodyEnd), []);
    }
  }
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
  if (
    node.start !== undefined &&
    node.end !== undefined &&
    ctx.loopStack.length > 0
  ) {
    for (const ext of ctx.loopExtractions) {
      if (node.start <= ext.callStart && node.end >= ext.callEnd) {
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

/**
 * Scope-entry projection: buffer nodes; entry records build post-walk, skipped
 * when a fused walk found no extractions (the sole consumer iterates
 * extractions).
 */
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

/** Segment-usage projection: buffer decl/identifier visits; attribution happens
 * post-walk in {@link classifySegmentUsage}. */
function enterSegmentUsage(
  node: AstNode,
  parent: AstNode | null,
  ctx: GatherEnterContext,
): void {
  if (!ctx.usageEnabled) return;

  if (ctx.bufferDeclVisits && DECLARATION_TYPES.has(node.type)) {
    ctx.declVisits.push(node);
  }
  // JSXIdentifier matters too: <Component> references module-level bindings
  if (
    (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
    !isNonReferenceIdentifier(node, parent)
  ) {
    ctx.identifierVisits.push({ pos: node.start, name: node.name });
  }
}

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
 * A sweep cursor over extraction arg ranges: fed ascending positions, it keeps
 * the stack of ranges containing the current position. Arg ranges are AST node
 * ranges, so they nest or are disjoint — the stack top is always the innermost
 * containing range.
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
 * Post-walk classification of buffered declaration and identifier visits.
 * Attribution waits for the full locals map because in DFS order an identifier
 * reference can be visited before its hoisted declaration
 * (`function f() { g(); function g() {} }`), so visits are buffered and
 * classified post-walk. Both buffers are classified by a sorted range-stack
 * sweep, so the sweep is independent of walker visit order.
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
  const declSweep = new ExtractionRangeSweep(extractions);
  const sortedDecls = [...declVisits].sort((a, b) => a.start - b.start);
  for (const node of sortedDecls) {
    declSweep.advanceTo(node.start);
    for (const ext of declSweep.stack) {
      if (node.end > ext.argEnd) continue;
      addDeclaredNamesFromNode(node, extractionLocals.get(ext.symbolName)!);
    }
  }

  const identSweep = new ExtractionRangeSweep(extractions);
  const sortedVisits = [...identifierVisits].sort((a, b) => a.pos - b.pos);
  for (const { pos, name } of sortedVisits) {
    identSweep.advanceTo(pos);
    const { stack } = identSweep;

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
