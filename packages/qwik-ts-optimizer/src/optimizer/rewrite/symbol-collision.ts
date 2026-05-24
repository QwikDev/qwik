/**
 * User-symbol collision detection + renaming (OSS-432 Bug A).
 *
 * When the optimizer injects runtime imports (`qrl`, `componentQrl`,
 * `_jsxSorted`, etc.) whose names collide with user-declared top-level
 * symbols (a local `const componentQrl = …`, an `import { qrl } from
 * '@qwik.dev/core/what'`), the synthetic and user-side bindings would
 * shadow each other in the emitted module — wrong runtime semantics.
 *
 * SWC's reference optimizer handles this via `private_ident!` and
 * hygiene-context-driven printer mangling: the user-side ends up with a
 * numeric suffix (`qrl` → `qrl1`). We have no hygiene system in this
 * pipeline, so we do the rename explicitly:
 *   1. Build the set of names we will inject from `ctx.neededImports`.
 *   2. Scan top-level user symbols (surviving import locals + module-level
 *      decls). Each collision plans a fresh-suffix rename.
 *   3. Apply edits:
 *      - Survived import specifier: alias-extend `{ qrl }` → `{ qrl as qrl1 }`
 *        (the original import source has already been removed from the
 *        MagicString accumulator — we rewrite the structured `namedParts`
 *        and rebuild the import string in `survivingUserImports[idx]`).
 *      - Module-level decl identifier: overwrite via MagicString.
 *      - References to the renamed binding in user-survived code: AST walk
 *        with a scope stack; overwrite Identifier nodes that resolve to
 *        the renamed top-level binding (skipping property keys, member
 *        property names, and any inner-scope shadow).
 *   4. Update tracking maps so downstream phases see the renamed names.
 *
 * Surfacing fixture: `example_qwik_conflict`. User declares
 * `const componentQrl = …` AND `import { qrl } from '@qwik.dev/core/what'`;
 * the optimizer also injects `componentQrl` (for `component$` markers) and
 * `qrl` (for the `q_<symbol>` runtime loader).
 */

import type { AstNode, AstProgram } from '../../ast-types.js';
import { forEachAstChild } from '../utils/ast.js';
import type { RewriteContext } from './rewrite-context.js';
import type { ImportInfo } from '../marker-detection.js';
import { isStrippedSegment } from './predicates.js';
import { getQrlImportSource } from '../rewrite-calls.js';

/**
 * Parse the local name from a `neededImports` map key. The map stores
 * specifier strings — bare `'qrl'` or aliased `'Fragment as _Fragment'`.
 * In the aliased form the local binding is the right-hand side.
 */
function localNameOfNeeded(key: string): string {
  const asIdx = key.indexOf(' as ');
  if (asIdx === -1) return key;
  return key.slice(asIdx + ' as '.length).trim();
}

/**
 * Compute the universe of `{ localName → expectedSource }` the optimizer
 * would inject for this parent module. Mirrors `collectNeededImports`
 * but ignores the `alreadyImported` mask — collision detection needs to
 * see names that the mask would otherwise hide (a same-named user
 * import from a *different* source still produces a real collision).
 *
 * Stays in sync with `collectNeededImports`. If a new emission is added
 * there, mirror it here.
 */
export function computeWouldInjectNames(
  ctx: RewriteContext,
): Map<string, string> {
  const result = new Map<string, string>();
  const { topLevel, extractions, inlineOptions, isDevMode, isInline,
    inlinedQrlSymbols, noArgQrlCallees, eventHandlerExtraImports, jsxResult,
    originalImports } = ctx;
  const hasTopLevelNonSync = topLevel.some((e) => !e.isSync);
  const hasAnyNonSync = extractions.some((e) => !e.isSync);

  const add = (key: string, source: string): void => {
    if (!result.has(key)) result.set(key, source);
  };

  if (isInline) {
    if (hasAnyNonSync) add(isDevMode ? '_noopQrlDEV' : '_noopQrl', '@qwik.dev/core');
    const needsCapturesImport = extractions.some(
      (e) => !e.isSync && e.captureNames.length > 0 && !(inlineOptions && isStrippedSegment(
        e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      )),
    );
    if (needsCapturesImport) add('_captures', '@qwik.dev/core');
  } else if (inlineOptions && !inlineOptions.inline) {
    if (hasTopLevelNonSync) {
      const hasNonStripped = topLevel.some(
        (e) => !e.isSync && !isStrippedSegment(
          e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
        ),
      );
      const hasStripped = topLevel.some(
        (e) => !e.isSync && isStrippedSegment(
          e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
        ),
      );
      if (hasNonStripped) add(isDevMode ? 'qrlDEV' : 'qrl', '@qwik.dev/core');
      if (hasStripped) add(isDevMode ? '_noopQrlDEV' : '_noopQrl', '@qwik.dev/core');
    }
  } else {
    if (hasTopLevelNonSync) {
      add(isDevMode ? 'qrlDEV' : 'qrl', '@qwik.dev/core');
      const hasInlinedQrlLocal = topLevel.some(
        (e) => e.isInlinedQrl && !ctx.relPath.includes('node_modules'),
      );
      if (hasInlinedQrlLocal && !isDevMode) add('qrlDEV', '@qwik.dev/core');
    }
  }

  for (const ext of topLevel) {
    if (ext.isSync) { add('_qrlSync', '@qwik.dev/core'); continue; }
    if (ext.isBare) {
      if (inlinedQrlSymbols.has(ext.symbolName)) add('qrl', '@qwik.dev/core');
      continue;
    }
    const qrlCallee = ext.qrlCallee;
    if (qrlCallee) {
      let isCustom = true;
      for (const [, info] of originalImports) {
        if (info.importedName === ext.calleeName) { isCustom = false; break; }
      }
      if (!isCustom) add(qrlCallee, getQrlImportSource(qrlCallee, ext.importSource));
    }
  }

  for (const { callee, source } of noArgQrlCallees) {
    add(callee, getQrlImportSource(callee, source));
  }
  for (const { sym, src } of eventHandlerExtraImports) {
    add(sym, src);
  }

  if (jsxResult) {
    for (const sym of jsxResult.neededImports) add(sym, '@qwik.dev/core');
    if (jsxResult.needsFragment) add('Fragment as _Fragment', '@qwik.dev/core/jsx-runtime');
  }
  if (ctx.isLibMode && jsxResult) add('jsx as _jsx', '@qwik.dev/core/jsx-runtime');

  return result;
}

interface UserSymbolImport {
  readonly kind: 'import';
  readonly importIdx: number;
  readonly partIdx: number;
}

interface UserSymbolDecl {
  readonly kind: 'decl';
  /** Source position of the binding identifier (for MagicString overwrite). */
  readonly idStart: number;
  readonly idEnd: number;
}

type UserSymbol = UserSymbolImport | UserSymbolDecl;

/**
 * Pick a fresh suffix-renamed name not already used by any user symbol or
 * injected name. Mirrors SWC's hygiene-context mangling ordering by
 * starting at `1` and incrementing.
 */
function pickFreshName(
  base: string,
  taken: ReadonlySet<string>,
): string {
  for (let i = 1; i < 10_000; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Defensive: practically unreachable. A defect, not a recoverable state.
  throw new Error(`OSS-432: pickFreshName exhausted suffixes for ${base}`);
}

function findBindingIdentifierPositions(
  program: AstProgram,
  name: string,
): { start: number; end: number } | null {
  for (const node of program.body) {
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.id.type === 'Identifier' && decl.id.name === name) {
          return { start: decl.id.start, end: decl.id.end };
        }
      }
      continue;
    }
    if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier' && node.id.name === name) {
      return { start: node.id.start, end: node.id.end };
    }
    if (node.type === 'ClassDeclaration' && node.id?.type === 'Identifier' && node.id.name === name) {
      return { start: node.id.start, end: node.id.end };
    }
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      const decl = node.declaration;
      if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          if (d.id.type === 'Identifier' && d.id.name === name) {
            return { start: d.id.start, end: d.id.end };
          }
        }
      } else if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') &&
                 decl.id?.type === 'Identifier' && decl.id.name === name) {
        return { start: decl.id.start, end: decl.id.end };
      }
    }
  }
  return null;
}

/** Collect binding names introduced by a function/arrow's params. */
function collectParamBindings(params: readonly AstNode[], out: Set<string>): void {
  for (const param of params) collectPatternBindings(param, out);
}

function collectPatternBindings(node: AstNode | null | undefined, out: Set<string>): void {
  if (!node) return;
  switch (node.type) {
    case 'Identifier':
      out.add(node.name);
      return;
    case 'ObjectPattern':
      for (const prop of node.properties ?? []) {
        if (prop.type === 'RestElement') collectPatternBindings(prop.argument, out);
        else if (prop.type === 'Property') collectPatternBindings(prop.value, out);
      }
      return;
    case 'ArrayPattern':
      for (const elem of node.elements ?? []) {
        if (elem) collectPatternBindings(elem, out);
      }
      return;
    case 'RestElement':
      collectPatternBindings(node.argument, out);
      return;
    case 'AssignmentPattern':
      collectPatternBindings(node.left, out);
      return;
  }
}

/** Collect var/let/const + function/class decl names from a block's statement list. */
function collectBlockBindings(statements: readonly AstNode[], out: Set<string>): void {
  for (const stmt of statements) {
    if (stmt.type === 'VariableDeclaration') {
      for (const d of stmt.declarations) collectPatternBindings(d.id, out);
    } else if (stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') {
      if (stmt.id?.type === 'Identifier') out.add(stmt.id.name);
    }
  }
}

/**
 * Walk the program AST and rewrite every Identifier that references a
 * renamed top-level binding via MagicString. Scope stack tracks inner
 * shadows so we never rewrite an inner same-named binding's references.
 */
function rewriteReferences(
  ctx: RewriteContext,
  renameMap: ReadonlyMap<string, string>,
  excludedPositions: ReadonlySet<number>,
): void {
  const { program, s } = ctx;
  const scopeStack: Array<Set<string>> = [];

  function isShadowed(name: string): boolean {
    for (const scope of scopeStack) if (scope.has(name)) return true;
    return false;
  }

  function walk(
    node: AstNode | null | undefined,
    parentKey?: string,
    parentNode?: AstNode,
  ): void {
    if (!node) return;

    // ImportDeclaration ranges are owned by processImports (already
    // s.remove'd; surviving form is rebuilt in survivingUserImports
    // strings, handled separately by applyImportSpecifierRename). An
    // overwrite inside a removed range re-introduces the snippet — skip
    // the whole subtree so MagicString can't leak `qrl1;`-style residue.
    if (node.type === 'ImportDeclaration') return;

    if (node.type === 'Identifier') {
      const newName = renameMap.get(node.name);
      if (newName !== undefined && !isShadowed(node.name)) {
        const isPropertyKey = parentKey === 'key' &&
          parentNode?.type === 'Property' && !parentNode.computed;
        const isMemberProp = parentKey === 'property' &&
          parentNode?.type === 'MemberExpression' && !parentNode.computed;
        // Skip the renamed binding's *own* declaration identifier — the
        // direct decl rewrite above already handled it. Other identifier
        // positions that share the same name (e.g. an inner shadow's
        // VariableDeclarator id) are blocked by `isShadowed` above.
        const isDeclId = excludedPositions.has(node.start);
        // Skip shorthand property values: a Property with shorthand=true
        // has `key === value` pointing at the same Identifier; rewriting
        // would silently drop the property name. Conservative leave-alone
        // — no fixture exercises this case for the injected-name set.
        const isShorthandValue = parentKey === 'value' &&
          parentNode?.type === 'Property' && parentNode.shorthand === true;
        if (!isPropertyKey && !isMemberProp && !isDeclId && !isShorthandValue) {
          s.overwrite(node.start, node.end, newName);
        }
      }
      return;
    }

    const pushedScope = pushScopeIfFunctionLike(node);
    if (pushedScope) scopeStack.push(pushedScope);

    const pushedBlock = pushScopeIfBlock(node);
    if (pushedBlock) scopeStack.push(pushedBlock);

    forEachAstChild(node, (child, key, parent) => {
      walk(child, key, parent);
    });

    if (pushedBlock) scopeStack.pop();
    if (pushedScope) scopeStack.pop();
  }

  function pushScopeIfFunctionLike(node: AstNode): Set<string> | null {
    if (
      node.type !== 'FunctionDeclaration' &&
      node.type !== 'FunctionExpression' &&
      node.type !== 'ArrowFunctionExpression'
    ) {
      return null;
    }
    const scope = new Set<string>();
    collectParamBindings(node.params ?? [], scope);
    return scope;
  }

  function pushScopeIfBlock(node: AstNode): Set<string> | null {
    // Block statements introduce a lexical scope for let/const/function/class.
    // Function bodies are BlockStatement too — the function-like push above
    // covers params; this push covers the body's hoisted decls and lexicals.
    if (node.type !== 'BlockStatement') return null;
    const scope = new Set<string>();
    collectBlockBindings(node.body ?? [], scope);
    return scope;
  }

  walk(program);
}

/**
 * Apply renames to surviving user-import specifiers by editing the
 * structured `namedParts` and the assembled import string. The source
 * import declarations have already been `s.remove`d by `processImports`,
 * so editing MagicString positions wouldn't take effect — the rebuilt
 * string in `survivingUserImports[importIdx]` is what gets prepended in
 * `assembleOutput`.
 */
function applyImportSpecifierRename(
  ctx: RewriteContext,
  importIdx: number,
  partIdx: number,
  newLocal: string,
): void {
  const info = ctx.survivingImportInfos[importIdx];
  const part = info.namedParts[partIdx];
  const updatedPart = { imported: part.imported, local: newLocal };
  info.namedParts[partIdx] = updatedPart;

  // Rebuild the named-parts segment and the full import string.
  const namedStrs = info.namedParts.map(np =>
    np.imported !== np.local ? `${np.imported} as ${np.local}` : np.local,
  );
  let importParts: string;
  if (info.nsPart) {
    importParts = info.defaultPart ? `${info.defaultPart}, ${info.nsPart}` : info.nsPart;
  } else if (namedStrs.length > 0) {
    importParts = info.defaultPart
      ? `${info.defaultPart}, { ${namedStrs.join(', ')} }`
      : `{ ${namedStrs.join(', ')} }`;
  } else {
    importParts = info.defaultPart;
  }
  ctx.survivingUserImports[importIdx] =
    `import ${importParts} from ${info.quote}${info.source}${info.quote};`;
}

/**
 * Detect collisions between optimizer-injected import names and
 * user-side top-level symbols, then rename the user side via a fresh
 * numeric suffix. See module docstring for the algorithm.
 *
 * Runs AFTER all body rewrites (rewriteCallSites, JSX transform) but
 * BEFORE `collectNeededImports`. The universe of would-inject names is
 * computed independently of `alreadyImported` so a same-named user
 * import from a *different* source is correctly identified as a
 * collision (the surfacing fixture is `example_qwik_conflict`'s
 * `import { qrl } from '@qwik.dev/core/what'` paired with the
 * optimizer's `qrl` from `@qwik.dev/core`).
 */
export function detectAndRenameCollisions(ctx: RewriteContext): void {
  // 1. Compute the universe of would-inject names + their sources.
  const wouldInject = computeWouldInjectNames(ctx);
  if (wouldInject.size === 0) return;

  // Map by local name (key string includes "as <local>" for aliases).
  const wouldInjectByLocal = new Map<string, string>();
  for (const [key, source] of wouldInject) {
    wouldInjectByLocal.set(localNameOfNeeded(key), source);
  }

  // 2a. User-side import locals (from survived imports).
  const userSymbols = new Map<string, UserSymbol>();
  const userImportSources = new Map<string, string>();
  for (let importIdx = 0; importIdx < ctx.survivingImportInfos.length; importIdx++) {
    const info = ctx.survivingImportInfos[importIdx];
    if (info.preservedAll) continue;
    for (let partIdx = 0; partIdx < info.namedParts.length; partIdx++) {
      const local = info.namedParts[partIdx].local;
      if (!userSymbols.has(local)) {
        userSymbols.set(local, { kind: 'import', importIdx, partIdx });
        userImportSources.set(local, info.source);
      }
    }
  }

  // 2b. User-side module-level decl names.
  if (ctx.moduleLevelDecls) {
    for (const decl of ctx.moduleLevelDecls) {
      if (userSymbols.has(decl.name)) continue;
      const pos = findBindingIdentifierPositions(ctx.program, decl.name);
      if (!pos) continue;
      userSymbols.set(decl.name, { kind: 'decl', idStart: pos.start, idEnd: pos.end });
    }
  }

  // 3. Plan renames for colliding user symbols.
  //   - Decl collision: always rename (decl shadows the injected import).
  //   - Import collision with same source: skip (user is doing what the
  //     optimizer would do; assume intentional and leave alone — the
  //     existing `alreadyImported` mask in collectNeededImports handles
  //     the dedup correctly here).
  //   - Import collision with different source: rename (two distinct
  //     bindings with the same name in the same scope is illegal).
  const renameMap = new Map<string, string>();
  const taken = new Set<string>([
    ...userSymbols.keys(),
    ...wouldInjectByLocal.keys(),
  ]);
  for (const [name, sym] of userSymbols) {
    const expectedSource = wouldInjectByLocal.get(name);
    if (expectedSource === undefined) continue;
    if (sym.kind === 'import') {
      const userSource = userImportSources.get(name);
      if (userSource === expectedSource) continue;
    }
    const newName = pickFreshName(name, taken);
    renameMap.set(name, newName);
    taken.add(newName);
  }
  if (renameMap.size === 0) return;

  // 4a. Decl rewrites — collect exclusion positions so the reference
  // walker leaves the renamed binding's own decl-id alone.
  const declExclusions = new Set<number>();
  for (const [oldName, newName] of renameMap) {
    const sym = userSymbols.get(oldName);
    if (sym?.kind !== 'decl') continue;
    ctx.s.overwrite(sym.idStart, sym.idEnd, newName);
    declExclusions.add(sym.idStart);
  }

  // 4b. Import specifier rewrites (string-level edit on rebuilt import).
  for (const [oldName, newName] of renameMap) {
    const sym = userSymbols.get(oldName);
    if (sym?.kind !== 'import') continue;
    applyImportSpecifierRename(ctx, sym.importIdx, sym.partIdx, newName);
  }

  // 4c. Reference rewrites via AST walk with scope tracking.
  rewriteReferences(ctx, renameMap, declExclusions);

  // 5. Update tracking maps.
  for (const [oldName, newName] of renameMap) {
    if (ctx.alreadyImported.has(oldName)) {
      ctx.alreadyImported.delete(oldName);
      ctx.alreadyImported.add(newName);
    }
    const info = ctx.originalImports.get(oldName);
    if (info) {
      ctx.originalImports.delete(oldName);
      const updated: ImportInfo = { ...info, localName: newName };
      ctx.originalImports.set(newName, updated);
    }
    if (ctx.moduleLevelDecls) {
      for (const decl of ctx.moduleLevelDecls) {
        // ModuleLevelDecl.name is readonly per OSS-387; cast through to
        // mutate the rename target (FFI-boundary-style pattern, scoped
        // to this rename pass).
        if (decl.name === oldName) {
          (decl as { name: string }).name = newName;
        }
      }
    }
  }

  // 6. Ensure the optimizer-side import for each renamed name is
  // present in `neededImports`. We run AFTER `collectNeededImports`, so
  // any name it skipped via the `alreadyImported` mask (now stale post-
  // rename) wouldn't appear in `neededImports`. The `wouldInject` map
  // computed earlier has the authoritative key+source for each.
  for (const [renamedUserName] of renameMap) {
    for (const [key, source] of wouldInject) {
      if (localNameOfNeeded(key) !== renamedUserName) continue;
      if (!ctx.neededImports.has(key)) {
        ctx.neededImports.set(key, source);
      }
    }
  }

  // 7. Drop stale entries from each extraction's `segmentImports`.
  // These were populated during extraction (before rename) by scanning
  // the segment body's identifier set against the user's import set.
  // Post-rename the user's import for `oldName` is gone (it's `newName`
  // now), so any `{localName: oldName, ...}` entry is stale: the body
  // either references `oldName` as a local binding (no import needed —
  // local shadows) or as the old outer-scope reference (which is now
  // dead after the rename). Either way, no import should be emitted at
  // the `oldName` local. `recollectPostTransformImports` in
  // segment-codegen re-derives any genuinely-needed imports from the
  // post-transform body; if the body actually does reference `newName`
  // (the renamed user binding), it'll re-emit from the updated
  // originalImports.
  for (const ext of ctx.extractions) {
    if (ext.segmentImports.length === 0) continue;
    const filtered = ext.segmentImports.filter(imp => !renameMap.has(imp.localName));
    if (filtered.length !== ext.segmentImports.length) {
      // ExtractionResult.segmentImports is `readonly ImportInfo[]` per
      // OSS-387; cast through to mutate (FFI-boundary pattern, scoped to
      // this rename pass).
      (ext as unknown as { segmentImports: ImportInfo[] }).segmentImports = filtered;
    }
  }
}

// Internal: re-export so unit tests can exercise individual pieces.
export const __internals = {
  localNameOfNeeded,
  pickFreshName,
  findBindingIdentifierPositions,
};
