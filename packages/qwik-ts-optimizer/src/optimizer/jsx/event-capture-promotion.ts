/**
 * Event handler capture-to-param promotion for the Qwik optimizer.
 *
 * Handles the q:p delivery mechanism where event handler captures are
 * promoted to function parameters. Includes loop context detection,
 * scope analysis, and slot unification for multiple handlers on the
 * same element.
 */

import { walk } from "oxc-walker";
import { walkWithProtocol } from "../ast/walk-with-protocol.js";
import type { AstNode, AstFunction, AstProgram } from "../../ast-types.js";
import type { ExtractionResult } from "../extraction/extract.js";
import {
  detectLoopContext,
  eventHandlerQpParams,
  generateParamPadding,
  type LoopContext,
} from "./loop-hoisting.js";
import { addBindingNamesFromPatternToSet } from '../ast/binding-pattern.js';
import { getWholeWordPattern } from '../segment/post-process.js';

/**
 * Enter-phase context for the `buildExtractionLoopMap` walker. Carries the
 * two read-only inputs (`extractions`, `repairedCode`), the three mutable
 * buffers the walk fills (`extractionLoopMap`, `loopBodyVarDecls`,
 * `loopStack`), and a `pushLoop` mutator. Holds NO exit-only act-helpers —
 * calling `ctx.popTopLoopIfMatches` from the enter handler is a compile
 * error because this type has no such field.
 */
interface BuildExtractionLoopMapEnterContext {
  readonly extractions: ExtractionResult[];
  readonly repairedCode: string;
  readonly extractionLoopMap: Map<string, LoopContext[]>;
  readonly loopBodyVarDecls: LoopBodyVarDeclMap;
  readonly loopStack: readonly LoopContext[];
  readonly pushLoop: (loopCtx: LoopContext) => void;
}

/**
 * Exit-phase context for the `buildExtractionLoopMap` walker. Extends
 * EnterContext with the exit-only `popTopLoopIfMatches` act-helper, which
 * detects whether the leaving node is a loop boundary and pops the top of
 * `loopStack` accordingly.
 */
interface BuildExtractionLoopMapExitContext
  extends BuildExtractionLoopMapEnterContext {
  readonly popTopLoopIfMatches: (node: AstNode) => void;
}

/**
 * Build a map from extraction symbolName to its loop context stack.
 * Walks the AST once to detect which extractions are inside loops.
 *
 * Production routes through the canonical gather walk's loop-map
 * projection (`analysis/module-gather-walk.ts`); this standalone form is
 * retained as the differential oracle for that projection.
 */
export function buildExtractionLoopMap(
  program: AstProgram,
  extractions: ExtractionResult[],
  repairedCode: string,
): { extractionLoopMap: Map<string, LoopContext[]>; loopBodyVarDecls: LoopBodyVarDeclMap } {
  const extractionLoopMap = new Map<string, LoopContext[]>();
  const loopBodyVarDecls: LoopBodyVarDeclMap = new Map();
  const loopStack: LoopContext[] = [];

  const enterCtx: BuildExtractionLoopMapEnterContext = {
    extractions,
    repairedCode,
    extractionLoopMap,
    loopBodyVarDecls,
    loopStack,
    pushLoop: (loopCtx) => { loopStack.push(loopCtx); },
  };

  const exitCtx: BuildExtractionLoopMapExitContext = {
    ...enterCtx,
    popTopLoopIfMatches: (node) => {
      const loopCtx = detectLoopContext(node, repairedCode);
      if (loopCtx) {
        loopStack.pop();
      }
    },
  };

  walkWithProtocol(program, enterCtx, exitCtx, {
    enter(node, _parent, ctx) {
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
        for (const ext of ctx.extractions) {
          if (node.start <= ext.callStart && node.end >= ext.callEnd) {
            // This node contains the extraction -- record current loop stack
            // We only need the innermost, but store all for nested loop analysis
            if (
              !ctx.extractionLoopMap.has(ext.symbolName) ||
              ctx.extractionLoopMap.get(ext.symbolName)!.length <
                ctx.loopStack.length
            ) {
              ctx.extractionLoopMap.set(ext.symbolName, [...ctx.loopStack]);
            }
          }
        }
      }
    },
    leave(node, _parent, ctx) {
      ctx.popTopLoopIfMatches(node);
    },
  });

  return { extractionLoopMap, loopBodyVarDecls };
}

/** Source kind of a binding, recorded so consumers can filter to
 * `let`/`var` (loop-counter-shaped) vs `param`/`const`/`function`/
 * `class` without re-walking. */
type BindingKind = 'param' | 'let' | 'const' | 'var' | 'function' | 'class';

export interface ScopeEntry {
  type: "function" | "for-loop";
  start: number;
  end: number;
  bindings: Array<{ name: string; pos: number; kind: BindingKind }>;
}

/**
 * Shared plumbing for the three-step event-handler capture promotion
 * orchestration: `promoteEventHandlerCaptures` populates the captures,
 * `unifyParameterSlots` aligns slot ordering across sibling handlers,
 * and `buildElementCaptureMap` produces the per-element `q:ps` map.
 *
 * All three functions read a subset of this context; the broad shape
 * makes it a discoverable surface for the orchestration state. The
 * mutation target `globalDeclPositions` stays as a separate explicit
 * argument so the linkage between the three calls (write/read/read)
 * is visible at the call site.
 */
export interface EventCaptureContext {
  extractions: ExtractionResult[];
  closureNodes: Map<string, AstFunction>;
  /**
   * Module-wide free-identifier map (`computeClosureFreeIdentifiers`),
   * keyed by closure node. Replaces per-handler re-derivation.
   */
  closureFreeIdentifiers: ReadonlyMap<AstFunction, readonly string[]>;
  bodyScopeIds: Map<string, Set<string>>;
  moduleScopeIds: Set<string>;
  importedNames: Set<string>;
  enclosingExtMap: Map<string, ExtractionResult>;
  extractionLoopMap: Map<string, LoopContext[]>;
  allScopeEntries: ScopeEntry[];
  loopBodyVarDecls: LoopBodyVarDeclMap;
  repairedCode: string;
  /**
   * True when the entry strategy is `inline` or `hoist`. Under those
   * strategies, non-loop eventHandler captures stay in `captureNames`
   * (downstream `preConsolidateRawPropsCaptures` + `transformInlineSegmentBody`
   * route them through `_captures[N]` unpacking + `_rawProps.X` rewriting).
   * Under the default/segment strategy, captures get promoted to
   * positional `paramNames` for segment-file emission.
   */
  isInlineStrategy: boolean;
}

/** Per-loop record of VariableDeclarations whose source range falls
 * inside that loop's body. Pre-collected so the per-extraction loop
 * in `promoteEventHandlerCaptures` can look up loop-local declarations
 * via key lookup instead of re-walking the program for each extraction.
 *
 * Keyed by `${loopBodyStart}-${loopBodyEnd}` — the LoopContext's
 * positional fingerprint. */
export type LoopBodyVarDeclMap = Map<string, Array<{ name: string; declStart: number }>>;

/** Positional fingerprint key for `LoopBodyVarDeclMap`. Shared with the
 * canonical gather walk's loop-map projection. */
export function loopBodyKey(start: number, end: number): string {
  return `${start}-${end}`;
}

/**
 * Scope entry for one function-like node: its range plus param and
 * body-top-level var-decl bindings with positions. Shared between
 * `collectAllScopeEntries` and the canonical gather walk's scope-entry
 * projection.
 */
export function buildFunctionScopeEntry(node: AstFunction): ScopeEntry {
  const bindings: Array<{ name: string; pos: number; kind: BindingKind }> = [];
  for (const param of node.params ?? []) {
    const names = new Set<string>();
    addBindingNamesFromPatternToSet(param, names);
    for (const n of names) {
      bindings.push({ name: n, pos: param.start ?? 0, kind: 'param' });
    }
  }
  if (node.body?.type === "BlockStatement") {
    for (const stmt of node.body.body ?? []) {
      if (stmt.type === "VariableDeclaration") {
        const stmtKind: BindingKind =
          stmt.kind === 'const' ? 'const' :
          stmt.kind === 'let' ? 'let' : 'var';
        for (const decl of stmt.declarations ?? []) {
          if (decl.id) {
            const names = new Set<string>();
            addBindingNamesFromPatternToSet(decl.id, names);
            for (const n of names) {
              bindings.push({
                name: n,
                pos: decl.start ?? stmt.start ?? 0,
                kind: stmtKind,
              });
            }
          }
        }
      }
    }
  }
  return { type: "function", start: node.start, end: node.end, bindings };
}

/**
 * Scope entry for one for/for-of/for-in node whose left/init clause
 * declares bindings. Returns undefined when the clause declares nothing
 * (entries without bindings are never consulted). Shared between
 * `collectAllScopeEntries` and the canonical gather walk's scope-entry
 * projection.
 */
export function buildForLoopScopeEntry(node: AstNode): ScopeEntry | undefined {
  if (
    node.type !== "ForOfStatement" &&
    node.type !== "ForInStatement" &&
    node.type !== "ForStatement"
  ) return undefined;
  const left = node.type === "ForStatement" ? node.init : node.left;
  if (left?.type !== "VariableDeclaration") return undefined;
  const leftKind: BindingKind =
    left.kind === 'const' ? 'const' :
    left.kind === 'let' ? 'let' : 'var';
  const bindings: Array<{ name: string; pos: number; kind: BindingKind }> = [];
  for (const decl of left.declarations ?? []) {
    if (decl.id) {
      const names = new Set<string>();
      addBindingNamesFromPatternToSet(decl.id, names);
      for (const n of names) {
        bindings.push({
          name: n,
          pos: decl.start ?? left.start ?? 0,
          kind: leftKind,
        });
      }
    }
  }
  if (bindings.length === 0) return undefined;
  return { type: "for-loop", start: node.start, end: node.end, bindings };
}

/**
 * Pre-collect all function scope entries and for-loop scope entries from a SINGLE AST walk.
 * Each entry records the node's range and its param/body-decl bindings with positions.
 * Per-extraction filtering then uses these cached entries instead of re-walking the AST.
 *
 * Production routes through the canonical gather walk's scope-entry
 * projection (`analysis/module-gather-walk.ts`); this standalone form is
 * retained as the differential oracle for that projection.
 */
export function collectAllScopeEntries(program: AstProgram): ScopeEntry[] {
  const allScopeEntries: ScopeEntry[] = [];

  walk(program, {
    enter(node: AstNode) {
      if (
        (node.type === "ArrowFunctionExpression" ||
          node.type === "FunctionExpression" ||
          node.type === "FunctionDeclaration") &&
        node.start !== undefined &&
        node.end !== undefined
      ) {
        allScopeEntries.push(buildFunctionScopeEntry(node));
      }
      if (
        (node.type === "ForOfStatement" ||
          node.type === "ForInStatement" ||
          node.type === "ForStatement") &&
        node.start !== undefined &&
        node.end !== undefined
      ) {
        const entry = buildForLoopScopeEntry(node);
        if (entry) allScopeEntries.push(entry);
      }
    },
    leave() {},
  });

  return allScopeEntries;
}

/**
 * Counter-variable candidates for while/do-while loops, which carry no
 * iterVars: `let i = 0` declared in an enclosing function body looks
 * "declared" to scope analysis even though the handler needs it via q:p
 * delivery. Scans the pre-collected function-scope entries that strictly
 * contain both the loop and the extraction call site (replaces a
 * `walk(program, ...)` that re-scanned the whole AST per-extraction)
 * and returns the `let`/`var` binding names whole-word-referenced in
 * the handler body. Returns nothing for loops with explicit iterVars.
 *
 * `declMustPrecedeLoop` adds the loop-local partition's extra guard:
 * only bindings declared before the loop construct count as counters.
 */
function collectWhileLoopCounterCandidates(
  allScopeEntries: readonly ScopeEntry[],
  loop: LoopContext,
  extraction: ExtractionResult,
  declMustPrecedeLoop: boolean,
): string[] {
  if (loop.type !== "while" && loop.type !== "do-while") return [];
  if (loop.iterVars.length > 0) return [];

  const names: string[] = [];
  const seen = new Set<string>();
  for (const entry of allScopeEntries) {
    if (entry.type !== 'function') continue;
    if (
      entry.start >= loop.loopNode.start ||
      entry.end <= loop.loopNode.end ||
      entry.start >= extraction.callStart ||
      entry.end <= extraction.callEnd
    ) continue;
    for (const b of entry.bindings) {
      if (b.kind !== 'let' && b.kind !== 'var') continue;
      if (declMustPrecedeLoop && b.pos >= loop.loopNode.start) continue;
      if (seen.has(b.name)) continue;
      if (!getWholeWordPattern(b.name).test(extraction.bodyText)) continue;
      seen.add(b.name);
      names.push(b.name);
    }
  }
  return names;
}

/**
 * Workaround: the free-identifier walk never visits identifiers in
 * computed-member-property position, so a handler referencing a loop
 * variable only as an index (`count[i]++`) does not surface `i` as a
 * free identifier. Augments the raw list with any enclosing loop's
 * iterVars referenced in the handler body text, plus — for
 * while/do-while loops — counter-variable candidates from intermediate
 * function scopes.
 */
function augmentUndeclaredIdsForLoops(
  extraction: ExtractionResult,
  undeclaredIds: readonly string[],
  extractionLoopMap: ReadonlyMap<string, LoopContext[]>,
  allScopeEntries: readonly ScopeEntry[],
): string[] {
  const result = [...undeclaredIds];
  const enclosingLoops = extractionLoopMap.get(extraction.symbolName);
  if (!enclosingLoops || enclosingLoops.length === 0) return result;

  const undeclaredSet = new Set(result);
  const addMissing = (name: string) => {
    if (undeclaredSet.has(name)) return;
    undeclaredSet.add(name);
    result.push(name);
  };
  for (const loop of enclosingLoops) {
    for (const iterVar of loop.iterVars) {
      if (getWholeWordPattern(iterVar).test(extraction.bodyText)) {
        addMissing(iterVar);
      }
    }
    for (const name of collectWhileLoopCounterCandidates(allScopeEntries, loop, extraction, false)) {
      addMissing(name);
    }
  }
  return result;
}

/**
 * Even with no captures, event handlers in a loop context need (_, _1)
 * padding for the q:p delivery mechanism. Exception: component event
 * handlers (onClick$ on <MyComponent/>) are just props, not Qwik event
 * handlers, so they don't need padding.
 */
function applyEmptyCaptureLoopPadding(
  extraction: ExtractionResult,
  extractionLoopMap: ReadonlyMap<string, LoopContext[]>,
): void {
  if (extraction.isComponentEvent) return;
  const enclosingLoops = extractionLoopMap.get(extraction.symbolName);
  if (!enclosingLoops || enclosingLoops.length === 0) return;
  extraction.paramNames = ["_", "_1"];
  extraction.captureNames = [];
  extraction.captures = false;
}

/**
 * Collect ALL scope-visible identifiers from the handler's enclosing
 * scopes: the enclosing extraction's body scope (or module scope at top
 * level) PLUS any intermediate function scopes (like .map() callbacks),
 * looked up against the pre-collected scope entries. Also records each
 * intermediate binding's first-seen declaration position for
 * source-order capture sorting.
 */
function collectVisibleScopeBindings(
  extraction: ExtractionResult,
  ctx: EventCaptureContext,
): { allScopeIds: Set<string>; declPositions: Map<string, number> } {
  const { bodyScopeIds, moduleScopeIds, enclosingExtMap, allScopeEntries, repairedCode } = ctx;

  const allScopeIds = new Set<string>();
  const enclosingExt = enclosingExtMap.get(extraction.symbolName) ?? null;
  if (enclosingExt) {
    const parentIds = bodyScopeIds.get(enclosingExt.symbolName);
    if (parentIds) {
      for (const id of parentIds) allScopeIds.add(id);
    }
  } else {
    for (const id of moduleScopeIds) allScopeIds.add(id);
  }

  const declPositions = new Map<string, number>();
  const enclosingStart = enclosingExt ? enclosingExt.argStart : 0;
  const enclosingEnd = enclosingExt ? enclosingExt.argEnd : repairedCode.length;
  for (const entry of allScopeEntries) {
    if (
      entry.start >= enclosingStart &&
      entry.end <= enclosingEnd &&
      entry.start < extraction.callStart &&
      entry.end > extraction.callEnd
    ) {
      for (const b of entry.bindings) {
        allScopeIds.add(b.name);
        if (!declPositions.has(b.name)) declPositions.set(b.name, b.pos);
      }
    }
  }
  return { allScopeIds, declPositions };
}

/**
 * NOT in a loop. Under the default/segment strategy ALL captured vars
 * become paramNames, sorted ALPHABETICALLY per SWC Rule 7. Under the
 * inline/hoist strategy, captures stay in `captureNames`: the
 * downstream pipeline (`preConsolidateRawPropsCaptures` →
 * `transformInlineSegmentBody` → `injectCapturesUnpacking` →
 * `replacePropsFieldReferencesInBody`) routes them through
 * `_captures[N]` unpacking + (when the parent component has
 * destructured props) `_rawProps.X` rewriting. The segment-file-style
 * positional-param padding is wrong for `q_X.s(body)` emission — the
 * body needs its original closure args preserved.
 */
function promoteNonLoopCaptures(
  extraction: ExtractionResult,
  uniqueCaptures: readonly string[],
  isInlineStrategy: boolean,
): void {
  const sortedCaptures = [...uniqueCaptures].sort();
  if (isInlineStrategy) {
    extraction.captureNames = sortedCaptures;
    extraction.captures = sortedCaptures.length > 0;
  } else {
    extraction.paramNames = generateParamPadding(sortedCaptures);
    extraction.captureNames = [];
    extraction.captures = false;
  }
}

/**
 * IN a loop: partition captures into loop-local (promoted to positional
 * params) vs cross-scope (delivered via .w() hoisting). Only the
 * IMMEDIATE (innermost) loop's variables are loop-local; variables from
 * outer loops are cross-scope captures.
 */
function partitionLoopCaptures(
  extraction: ExtractionResult,
  uniqueCaptures: readonly string[],
  enclosingLoops: readonly LoopContext[],
  allScopeEntries: readonly ScopeEntry[],
  loopBodyVarDecls: LoopBodyVarDeclMap,
): void {
  const immediateLoop = enclosingLoops[enclosingLoops.length - 1];

  // Loop-local names: the immediate loop's iterVars, plus block-scoped
  // declarations inside its body (pre-collected during
  // `buildExtractionLoopMap`), plus — for while/do-while loops —
  // counter candidates declared before the loop in enclosing functions.
  const loopLocalSet = new Set<string>(immediateLoop.iterVars);
  const loopBodyDecls = loopBodyVarDecls.get(loopBodyKey(immediateLoop.loopBodyStart, immediateLoop.loopBodyEnd));
  if (loopBodyDecls) {
    for (const d of loopBodyDecls) loopLocalSet.add(d.name);
  }
  for (const name of collectWhileLoopCounterCandidates(allScopeEntries, immediateLoop, extraction, true)) {
    loopLocalSet.add(name);
  }

  const loopLocalVars: string[] = [];
  const crossScopeCaptures: string[] = [];
  for (const name of uniqueCaptures) {
    if (loopLocalSet.has(name)) {
      loopLocalVars.push(name);
    } else {
      crossScopeCaptures.push(name);
    }
  }

  if (loopLocalVars.length > 0) {
    extraction.paramNames = generateParamPadding(loopLocalVars);
  }
  extraction.captureNames = crossScopeCaptures.sort();
  extraction.captures = crossScopeCaptures.length > 0;
}

/**
 * Promote event handler captures to function parameters.
 *
 * This implements the q:p delivery mechanism where captured variables
 * become positional function parameters instead of runtime captures.
 */
export function promoteEventHandlerCaptures(
  ctx: EventCaptureContext,
  globalDeclPositions: Map<string, number>,
): void {
  const {
    extractions,
    closureNodes,
    importedNames,
    extractionLoopMap,
    allScopeEntries,
    loopBodyVarDecls,
    isInlineStrategy,
  } = ctx;

  for (const extraction of extractions) {
    if (extraction.ctxKind !== "eventHandler") continue;
    if (extraction.isInlinedQrl) continue;

    // Re-detect captures by checking undeclared identifiers against ALL
    // enclosing scopes (including loop callback scopes that capture
    // analysis misses because they're intermediate nested functions).
    const closureNode = closureNodes.get(extraction.symbolName);
    if (!closureNode) continue;
    const rawUndeclaredIds = ctx.closureFreeIdentifiers.get(closureNode);
    if (!rawUndeclaredIds) continue;
    const undeclaredIds = augmentUndeclaredIdsForLoops(
      extraction,
      rawUndeclaredIds,
      extractionLoopMap,
      allScopeEntries,
    );
    if (undeclaredIds.length === 0) {
      applyEmptyCaptureLoopPadding(extraction, extractionLoopMap);
      continue;
    }

    const { allScopeIds, declPositions } = collectVisibleScopeBindings(extraction, ctx);
    // Copy declaration positions to the shared map for cross-handler slot allocation
    for (const [name, pos] of declPositions) {
      if (!globalDeclPositions.has(name))
        globalDeclPositions.set(name, pos);
    }

    // Filter undeclared identifiers against all scope identifiers.
    // Sort by declaration position (source order) to match Rust optimizer behavior.
    const allCaptures = undeclaredIds.filter(
      (name) => allScopeIds.has(name) && !importedNames.has(name),
    );
    const uniqueCaptures = [...new Set(allCaptures)].sort(
      (a, b) => (declPositions.get(a) ?? 0) - (declPositions.get(b) ?? 0),
    );
    if (uniqueCaptures.length === 0) {
      applyEmptyCaptureLoopPadding(extraction, extractionLoopMap);
      continue;
    }

    const enclosingLoops = extractionLoopMap.get(extraction.symbolName);
    if (!enclosingLoops || enclosingLoops.length === 0) {
      promoteNonLoopCaptures(extraction, uniqueCaptures, isInlineStrategy);
    } else {
      partitionLoopCaptures(
        extraction,
        uniqueCaptures,
        enclosingLoops,
        allScopeEntries,
        loopBodyVarDecls,
      );
    }
  }
}

/**
 * Group promoted event handlers (paramNames starting `_, _1`) by their
 * enclosing extraction's symbolName. Handlers with no enclosing
 * extraction don't participate in q:p slot allocation.
 */
function groupPromotedHandlersByParent(
  extractions: readonly ExtractionResult[],
  enclosingExtMap: ReadonlyMap<string, ExtractionResult>,
): Map<string, ExtractionResult[]> {
  const handlersByParent = new Map<string, ExtractionResult[]>();
  for (const ext of extractions) {
    if (ext.ctxKind !== "eventHandler") continue;
    if (
      ext.paramNames.length < 2 ||
      ext.paramNames[0] !== "_" ||
      ext.paramNames[1] !== "_1"
    )
      continue;
    const parentExt = enclosingExtMap.get(ext.symbolName);
    if (!parentExt) continue;
    const existing = handlersByParent.get(parentExt.symbolName);
    if (existing) existing.push(ext);
    else handlersByParent.set(parentExt.symbolName, [ext]);
  }
  return handlersByParent;
}

/**
 * Group handlers by their containing JSX element, identified by the
 * byte offset of the nearest `<` scanning backwards from each handler's
 * call start.
 */
function groupByContainingElement(
  handlers: readonly ExtractionResult[],
  repairedCode: string,
): Map<number, ExtractionResult[]> {
  const elementGroups = new Map<number, ExtractionResult[]>();
  for (const h of handlers) {
    let pos = h.callStart - 1;
    while (pos > 0 && repairedCode[pos] !== "<") pos--;
    const existing = elementGroups.get(pos);
    if (existing) existing.push(h);
    else elementGroups.set(pos, [h]);
  }
  return elementGroups;
}

/** Source-declaration-order sort, the q:p emit order for loop handlers
 * (and for stripped-handler capture propagation). */
function sortByGlobalDeclPosition(
  names: string[],
  globalDeclPositions: ReadonlyMap<string, number>,
): void {
  names.sort(
    (a, b) =>
      (globalDeclPositions.get(a) ?? 0) - (globalDeclPositions.get(b) ?? 0),
  );
}

/**
 * q:p ordering policy for an element group: groups containing a loop
 * handler sort by declaration position; non-loop groups sort
 * alphabetically (SWC Rule 7).
 */
function sortQpNamesForGroup(
  names: string[],
  group: readonly ExtractionResult[],
  extractionLoopMap: ReadonlyMap<string, LoopContext[]>,
  globalDeclPositions: ReadonlyMap<string, number>,
): void {
  const anyInLoop = group.some(
    (h) => (extractionLoopMap.get(h.symbolName)?.length ?? 0) > 0,
  );
  if (anyInLoop) {
    sortByGlobalDeclPosition(names, globalDeclPositions);
  } else {
    names.sort((a, b) => a.localeCompare(b));
  }
}

/**
 * Unify parameter slots for multiple event handlers on the same element.
 * Ensures consistent positional parameter ordering across handlers.
 */
export function unifyParameterSlots(
  ctx: EventCaptureContext,
  globalDeclPositions: Map<string, number>,
): void {
  const { extractions, enclosingExtMap, extractionLoopMap, repairedCode } = ctx;
  const handlersByParent = groupPromotedHandlersByParent(extractions, enclosingExtMap);

  // For each parent, group handlers by their containing JSX element
  for (const [, handlers] of handlersByParent) {
    if (handlers.length < 2) continue;
    const elementGroups = groupByContainingElement(handlers, repairedCode);

    // For each element group with 2+ handlers, unify their loop-local params
    for (const [, group] of elementGroups) {
      if (group.length < 2) continue;

      // Collect all unique loop-local params across all handlers
      const allLoopLocals: string[] = [];
      const seen = new Set<string>();
      for (const h of group) {
        for (let i = 2; i < h.paramNames.length; i++) {
          const p = h.paramNames[i];
          if (!seen.has(p)) {
            seen.add(p);
            allLoopLocals.push(p);
          }
        }
      }
      sortQpNamesForGroup(allLoopLocals, group, extractionLoopMap, globalDeclPositions);

      if (allLoopLocals.length === 0) continue;

      // Now reassign paramNames for each handler using unified slots.
      // Handlers with no loop-local captures keep just (_, _1) -- they don't
      // participate in slot allocation.
      for (const h of group) {
        const handlerCaptures = new Set<string>();
        for (let i = 2; i < h.paramNames.length; i++) {
          handlerCaptures.add(h.paramNames[i]);
        }
        if (handlerCaptures.size === 0) continue; // no captures, keep (_, _1) only
        // Build new paramNames with unified slots.
        // Trailing unused positions are omitted (not padded).
        const newParams = ["_", "_1"];
        let paddingCounter = 2; // Start at _2 for first gap
        let lastCaptureIdx = -1;
        // Find the last position in the unified list that this handler uses
        for (let idx = 0; idx < allLoopLocals.length; idx++) {
          if (handlerCaptures.has(allLoopLocals[idx])) lastCaptureIdx = idx;
        }
        // Only fill slots up to the last used position
        for (let idx = 0; idx <= lastCaptureIdx; idx++) {
          const p = allLoopLocals[idx];
          if (handlerCaptures.has(p)) {
            newParams.push(p);
          } else {
            newParams.push(`_${paddingCounter}`);
          }
          paddingCounter++;
        }
        h.paramNames = newParams;
      }
    }
  }
}

/**
 * Build the element capture map: for each event handler, store the unified q:ps params
 * for its containing element.
 *
 * An optional `stripCtxName` + `stripEventHandlers` arg pair adds a
 * second pass that picks up stripped event handlers with captures.
 * Stripped handlers have null bodies at runtime and can't consume
 * captures positionally, so SWC propagates the captures to the parent
 * JSX element's `q:p` var-prop. The second pass mirrors that for the
 * segment-codegen JSX path (which re-parses + walks a fresh AST so
 * positions align).
 */
export function buildElementCaptureMap(
  ctx: EventCaptureContext,
  globalDeclPositions: Map<string, number>,
  stripCtxName?: readonly string[],
  stripEventHandlers?: boolean,
): Map<string, string[]> {
  const { extractions, enclosingExtMap, extractionLoopMap, repairedCode } = ctx;
  const elementQpParamsMap = new Map<string, string[]>();

  // Group event handlers by parent and element (same logic as slot unification)
  const handlersByParent = groupPromotedHandlersByParent(extractions, enclosingExtMap);

  for (const [, handlers] of handlersByParent) {
    const elementGroups = groupByContainingElement(handlers, repairedCode);

    for (const [, group] of elementGroups) {
      // Collect actual (non-padding) loop-local vars
      const allVars: string[] = [];
      const seen = new Set<string>();
      for (const h of group) {
        for (const p of eventHandlerQpParams(h.paramNames)) {
          if (!seen.has(p)) {
            seen.add(p);
            allVars.push(p);
          }
        }
      }
      sortQpNamesForGroup(allVars, group, extractionLoopMap, globalDeclPositions);
      for (const h of group) {
        elementQpParamsMap.set(h.symbolName, allVars);
      }
    }
  }

  // Second pass for stripped event handlers with captures.
  // Stripped bodies (`export const X = null` for `stripCtxName` matches +
  // all `eventHandler`-kind extractions when `stripEventHandlers` is true)
  // can't consume captures via `_captures[N]` at runtime. SWC propagates
  // their captures to the parent JSX element's `q:p` var-prop instead so
  // the runtime can hand them back when the handler is rehydrated. Group
  // stripped handlers by element (same byte-offset-walk as the loop pass)
  // and union their `captureNames` into the element's qpParams.
  if (stripCtxName || stripEventHandlers) {
    const strippedHandlers: ExtractionResult[] = [];
    for (const ext of extractions) {
      if (ext.ctxKind !== 'eventHandler') continue;
      if (!ext.captures || ext.captureNames.length === 0) continue;
      const isStripped =
        (stripCtxName && stripCtxName.some(v => ext.ctxName.startsWith(v))) ||
        (stripEventHandlers === true);
      if (!isStripped) continue;
      strippedHandlers.push(ext);
    }

    const strippedByElement = groupByContainingElement(strippedHandlers, repairedCode);
    for (const [, group] of strippedByElement) {
      const allCaps: string[] = [];
      const seen = new Set<string>();
      for (const h of group) {
        for (const c of h.captureNames) {
          if (!seen.has(c)) {
            seen.add(c);
            allCaps.push(c);
          }
        }
      }
      // SWC's stripped-event q:p emit uses source-declaration order
      // (matches the loop arm of the q:p ordering policy).
      sortByGlobalDeclPosition(allCaps, globalDeclPositions);
      for (const h of group) {
        // Don't overwrite an entry already populated by the loop pass.
        if (!elementQpParamsMap.has(h.symbolName)) {
          elementQpParamsMap.set(h.symbolName, allCaps);
        }
      }
    }
  }

  return elementQpParamsMap;
}
