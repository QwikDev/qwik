import { walk } from 'oxc-walker';
import { walkWithProtocol } from '../ast/walk-with-protocol.js';
import type { AstNode, AstFunction, AstProgram } from '../../ast-types.js';
import type { ExtractionResult } from '../extraction/extract.js';
import {
  detectLoopContext,
  eventHandlerQpParams,
  generateParamPadding,
  type LoopContext,
} from './loop-hoisting.js';
import { addBindingNamesFromPatternToSet } from '../ast/binding-pattern.js';
import { getWholeWordPattern } from '../segment/post-process.js';

interface BuildExtractionLoopMapEnterContext {
  readonly extractions: ExtractionResult[];
  readonly repairedCode: string;
  readonly extractionLoopMap: Map<string, LoopContext[]>;
  readonly loopBodyVarDecls: LoopBodyVarDeclMap;
  readonly loopStack: readonly LoopContext[];
  readonly pushLoop: (loopCtx: LoopContext) => void;
}

interface BuildExtractionLoopMapExitContext extends BuildExtractionLoopMapEnterContext {
  readonly popTopLoopIfMatches: (node: AstNode) => void;
}

/**
 * Retained as the differential oracle for the canonical gather walk's loop-map projection
 * (`analysis/module-gather-walk.ts`).
 */
export function buildExtractionLoopMap(
  program: AstProgram,
  extractions: ExtractionResult[],
  repairedCode: string
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
    pushLoop: (loopCtx) => {
      loopStack.push(loopCtx);
    },
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
      if (
        node.type === 'VariableDeclaration' &&
        ctx.loopStack.length > 0 &&
        node.start !== undefined
      ) {
        const innermost = ctx.loopStack[ctx.loopStack.length - 1];
        if (
          node.start >= innermost.loopBodyStart &&
          node.end !== undefined &&
          node.end <= innermost.loopBodyEnd
        ) {
          const bucket = ctx.loopBodyVarDecls.get(
            loopBodyKey(innermost.loopBodyStart, innermost.loopBodyEnd)
          )!;
          for (const decl of node.declarations ?? []) {
            if (decl.id?.type === 'Identifier') {
              bucket.push({ name: decl.id.name, declStart: decl.start ?? node.start });
            }
          }
        }
      }
      if (node.start !== undefined && node.end !== undefined && ctx.loopStack.length > 0) {
        for (const ext of ctx.extractions) {
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
    },
    leave(node, _parent, ctx) {
      ctx.popTopLoopIfMatches(node);
    },
  });

  return { extractionLoopMap, loopBodyVarDecls };
}

type BindingKind = 'param' | 'let' | 'const' | 'var' | 'function' | 'class';

export interface ScopeEntry {
  type: 'function' | 'for-loop';
  start: number;
  end: number;
  bindings: Array<{ name: string; pos: number; kind: BindingKind }>;
}

export interface EventCaptureContext {
  extractions: ExtractionResult[];
  closureNodes: Map<string, AstFunction>;
  closureFreeIdentifiers: ReadonlyMap<AstFunction, readonly string[]>;
  bodyScopeIds: Map<string, Set<string>>;
  moduleScopeIds: Set<string>;
  importedNames: Set<string>;
  enclosingExtMap: Map<string, ExtractionResult>;
  extractionLoopMap: Map<string, LoopContext[]>;
  allScopeEntries: ScopeEntry[];
  loopBodyVarDecls: LoopBodyVarDeclMap;
  repairedCode: string;
  isInlineStrategy: boolean;
}

/** Keyed by `${loopBodyStart}-${loopBodyEnd}` — a LoopContext's positional fingerprint. */
export type LoopBodyVarDeclMap = Map<string, Array<{ name: string; declStart: number }>>;

export function loopBodyKey(start: number, end: number): string {
  return `${start}-${end}`;
}

export function buildFunctionScopeEntry(node: AstFunction): ScopeEntry {
  const bindings: Array<{ name: string; pos: number; kind: BindingKind }> = [];
  for (const param of node.params ?? []) {
    const names = new Set<string>();
    addBindingNamesFromPatternToSet(param, names);
    for (const n of names) {
      bindings.push({ name: n, pos: param.start ?? 0, kind: 'param' });
    }
  }
  if (node.body?.type === 'BlockStatement') {
    for (const stmt of node.body.body ?? []) {
      if (stmt.type === 'VariableDeclaration') {
        const stmtKind: BindingKind =
          stmt.kind === 'const' ? 'const' : stmt.kind === 'let' ? 'let' : 'var';
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
  return { type: 'function', start: node.start, end: node.end, bindings };
}

export function buildForLoopScopeEntry(node: AstNode): ScopeEntry | undefined {
  if (
    node.type !== 'ForOfStatement' &&
    node.type !== 'ForInStatement' &&
    node.type !== 'ForStatement'
  )
    return undefined;
  const left = node.type === 'ForStatement' ? node.init : node.left;
  if (left?.type !== 'VariableDeclaration') return undefined;
  const leftKind: BindingKind =
    left.kind === 'const' ? 'const' : left.kind === 'let' ? 'let' : 'var';
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
  return { type: 'for-loop', start: node.start, end: node.end, bindings };
}

/**
 * Retained as the differential oracle for the canonical gather walk's scope-entry projection
 * (`analysis/module-gather-walk.ts`).
 */
export function collectAllScopeEntries(program: AstProgram): ScopeEntry[] {
  const allScopeEntries: ScopeEntry[] = [];

  walk(program, {
    enter(node: AstNode) {
      if (
        (node.type === 'ArrowFunctionExpression' ||
          node.type === 'FunctionExpression' ||
          node.type === 'FunctionDeclaration') &&
        node.start !== undefined &&
        node.end !== undefined
      ) {
        allScopeEntries.push(buildFunctionScopeEntry(node));
      }
      if (
        (node.type === 'ForOfStatement' ||
          node.type === 'ForInStatement' ||
          node.type === 'ForStatement') &&
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
 * While/do-while loops carry no iterVars, so a counter like `let i = 0` in an enclosing function
 * body reads as "declared" to scope analysis even though the handler needs it delivered via q:p.
 * Returns the `let`/`var` names whole-word- referenced in the handler body; `declMustPrecedeLoop`
 * additionally requires the binding to be declared before the loop.
 */
function collectWhileLoopCounterCandidates(
  allScopeEntries: readonly ScopeEntry[],
  loop: LoopContext,
  extraction: ExtractionResult,
  declMustPrecedeLoop: boolean
): string[] {
  if (loop.type !== 'while' && loop.type !== 'do-while') return [];
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
    )
      continue;
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
 * The free-identifier walk never visits identifiers in computed-member-property position, so a
 * handler referencing a loop variable only as an index (`count[i]++`) never surfaces `i`. Augment
 * with any enclosing loop's iterVars referenced in the handler body, plus while/do-while counter
 * candidates.
 */
function augmentUndeclaredIdsForLoops(
  extraction: ExtractionResult,
  undeclaredIds: readonly string[],
  extractionLoopMap: ReadonlyMap<string, LoopContext[]>,
  allScopeEntries: readonly ScopeEntry[]
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
    for (const name of collectWhileLoopCounterCandidates(
      allScopeEntries,
      loop,
      extraction,
      false
    )) {
      addMissing(name);
    }
  }
  return result;
}

/**
 * Event handlers in a loop need `(_, _1)` padding for q:p delivery even with no captures. Component
 * event handlers (`onClick$` on `<MyComponent/>`) are plain props, not Qwik handlers, so they're
 * excepted.
 */
function applyEmptyCaptureLoopPadding(
  extraction: ExtractionResult,
  extractionLoopMap: ReadonlyMap<string, LoopContext[]>
): void {
  if (extraction.isComponentEvent) return;
  const enclosingLoops = extractionLoopMap.get(extraction.symbolName);
  if (!enclosingLoops || enclosingLoops.length === 0) return;
  extraction.paramNames = ['_', '_1'];
  extraction.captureNames = [];
  extraction.captures = false;
}

function collectVisibleScopeBindings(
  extraction: ExtractionResult,
  ctx: EventCaptureContext
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
 * Not in a loop. Under the default/segment strategy all captured vars become alphabetically-sorted
 * paramNames. Under inline/hoist they stay in `captureNames` (routed through `_captures[N]`
 * unpacking downstream, plus `_rawProps.X` rewriting when the parent component has destructured
 * props): positional-param padding is wrong for `q_X.s(body)` emission, which must preserve the
 * body's original closure args.
 */
function promoteNonLoopCaptures(
  extraction: ExtractionResult,
  uniqueCaptures: readonly string[],
  isInlineStrategy: boolean
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
 * IN a loop: partition captures into loop-local (promoted to positional params) vs cross-scope
 * (delivered via .w() hoisting). Only the IMMEDIATE (innermost) loop's variables are loop-local;
 * variables from outer loops are cross-scope captures.
 */
function partitionLoopCaptures(
  extraction: ExtractionResult,
  uniqueCaptures: readonly string[],
  enclosingLoops: readonly LoopContext[],
  allScopeEntries: readonly ScopeEntry[],
  loopBodyVarDecls: LoopBodyVarDeclMap
): void {
  const immediateLoop = enclosingLoops[enclosingLoops.length - 1];

  const loopLocalSet = new Set<string>(immediateLoop.iterVars);
  const loopBodyDecls = loopBodyVarDecls.get(
    loopBodyKey(immediateLoop.loopBodyStart, immediateLoop.loopBodyEnd)
  );
  if (loopBodyDecls) {
    for (const d of loopBodyDecls) loopLocalSet.add(d.name);
  }
  for (const name of collectWhileLoopCounterCandidates(
    allScopeEntries,
    immediateLoop,
    extraction,
    true
  )) {
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

export function promoteEventHandlerCaptures(
  ctx: EventCaptureContext,
  globalDeclPositions: Map<string, number>
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
    if (extraction.ctxKind !== 'eventHandler') continue;
    if (extraction.isInlinedQrl) continue;

    // Capture analysis misses intermediate nested-function scopes (loop
    // callbacks), so re-detect against ALL enclosing scopes.
    const closureNode = closureNodes.get(extraction.symbolName);
    if (!closureNode) continue;
    const rawUndeclaredIds = ctx.closureFreeIdentifiers.get(closureNode);
    if (!rawUndeclaredIds) continue;
    const undeclaredIds = augmentUndeclaredIdsForLoops(
      extraction,
      rawUndeclaredIds,
      extractionLoopMap,
      allScopeEntries
    );
    if (undeclaredIds.length === 0) {
      applyEmptyCaptureLoopPadding(extraction, extractionLoopMap);
      continue;
    }

    const { allScopeIds, declPositions } = collectVisibleScopeBindings(extraction, ctx);
    for (const [name, pos] of declPositions) {
      if (!globalDeclPositions.has(name)) globalDeclPositions.set(name, pos);
    }

    const allCaptures = undeclaredIds.filter(
      (name) => allScopeIds.has(name) && !importedNames.has(name)
    );
    const uniqueCaptures = [...new Set(allCaptures)].sort(
      (a, b) => (declPositions.get(a) ?? 0) - (declPositions.get(b) ?? 0)
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
        loopBodyVarDecls
      );
    }
  }
}

function groupPromotedHandlersByParent(
  extractions: readonly ExtractionResult[],
  enclosingExtMap: ReadonlyMap<string, ExtractionResult>
): Map<string, ExtractionResult[]> {
  const handlersByParent = new Map<string, ExtractionResult[]>();
  for (const ext of extractions) {
    if (ext.ctxKind !== 'eventHandler') continue;
    if (ext.paramNames.length < 2 || ext.paramNames[0] !== '_' || ext.paramNames[1] !== '_1')
      continue;
    const parentExt = enclosingExtMap.get(ext.symbolName);
    if (!parentExt) continue;
    const existing = handlersByParent.get(parentExt.symbolName);
    if (existing) existing.push(ext);
    else handlersByParent.set(parentExt.symbolName, [ext]);
  }
  return handlersByParent;
}

function groupByContainingElement(
  handlers: readonly ExtractionResult[],
  repairedCode: string
): Map<number, ExtractionResult[]> {
  const elementGroups = new Map<number, ExtractionResult[]>();
  for (const h of handlers) {
    let pos = h.callStart - 1;
    while (pos > 0 && repairedCode[pos] !== '<') pos--;
    const existing = elementGroups.get(pos);
    if (existing) existing.push(h);
    else elementGroups.set(pos, [h]);
  }
  return elementGroups;
}

function sortByGlobalDeclPosition(
  names: string[],
  globalDeclPositions: ReadonlyMap<string, number>
): void {
  names.sort((a, b) => (globalDeclPositions.get(a) ?? 0) - (globalDeclPositions.get(b) ?? 0));
}

function sortQpNamesForGroup(
  names: string[],
  group: readonly ExtractionResult[],
  extractionLoopMap: ReadonlyMap<string, LoopContext[]>,
  globalDeclPositions: ReadonlyMap<string, number>
): void {
  const anyInLoop = group.some((h) => (extractionLoopMap.get(h.symbolName)?.length ?? 0) > 0);
  if (anyInLoop) {
    sortByGlobalDeclPosition(names, globalDeclPositions);
  } else {
    names.sort((a, b) => a.localeCompare(b));
  }
}

export function unifyParameterSlots(
  ctx: EventCaptureContext,
  globalDeclPositions: Map<string, number>
): void {
  const { extractions, enclosingExtMap, extractionLoopMap, repairedCode } = ctx;
  const handlersByParent = groupPromotedHandlersByParent(extractions, enclosingExtMap);

  for (const [, handlers] of handlersByParent) {
    if (handlers.length < 2) continue;
    const elementGroups = groupByContainingElement(handlers, repairedCode);

    for (const [, group] of elementGroups) {
      if (group.length < 2) continue;

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

      for (const h of group) {
        const handlerCaptures = new Set<string>();
        for (let i = 2; i < h.paramNames.length; i++) {
          handlerCaptures.add(h.paramNames[i]);
        }
        if (handlerCaptures.size === 0) continue;
        const newParams = ['_', '_1'];
        let paddingCounter = 2;
        let lastCaptureIdx = -1;
        for (let idx = 0; idx < allLoopLocals.length; idx++) {
          if (handlerCaptures.has(allLoopLocals[idx])) lastCaptureIdx = idx;
        }
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
 * Optional `stripCtxName`/`stripEventHandlers` triggers a second pass for stripped event handlers
 * with captures: their bodies are null at runtime and can't consume captures positionally, so the
 * captures propagate to the parent JSX element's `q:p` var-prop instead.
 */
export function buildElementCaptureMap(
  ctx: EventCaptureContext,
  globalDeclPositions: Map<string, number>,
  stripCtxName?: readonly string[],
  stripEventHandlers?: boolean
): Map<string, string[]> {
  const { extractions, enclosingExtMap, extractionLoopMap, repairedCode } = ctx;
  const elementQpParamsMap = new Map<string, string[]>();

  const handlersByParent = groupPromotedHandlersByParent(extractions, enclosingExtMap);

  for (const [, handlers] of handlersByParent) {
    const elementGroups = groupByContainingElement(handlers, repairedCode);

    for (const [, group] of elementGroups) {
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

  if (stripCtxName || stripEventHandlers) {
    const strippedHandlers: ExtractionResult[] = [];
    for (const ext of extractions) {
      if (ext.ctxKind !== 'eventHandler') continue;
      if (!ext.captures || ext.captureNames.length === 0) continue;
      const isStripped =
        (stripCtxName && stripCtxName.some((v) => ext.ctxName.startsWith(v))) ||
        stripEventHandlers === true;
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
