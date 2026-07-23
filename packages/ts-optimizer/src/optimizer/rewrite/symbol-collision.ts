/**
 * When injected runtime imports (`qrl`, `componentQrl`, `_jsxSorted`, …) collide with user-declared
 * top-level symbols, the two bindings would shadow each other and break runtime semantics. This
 * pipeline has no hygiene pass, so colliding user-side bindings are renamed with a fresh numeric
 * suffix (`qrl` → `qrl1`) and every reference rewritten.
 */

import type { AstNode, AstProgram } from '../../ast-types.js';
import { forEachAstChild } from '../ast/guards.js';
import type { RewriteContext } from './rewrite-context.js';
import type { ImportInfo } from '../extraction/marker-detection.js';
import { isStrippedExtraction } from './predicates.js';
import { getQrlImportSource } from './rewrite-calls.js';

/**
 * A `neededImports` key is either `'qrl'` or `'Fragment as _Fragment'`; the local binding is the
 * part after `as`.
 */
function localNameOfNeeded(key: string): string {
  const asIdx = key.indexOf(' as ');
  if (asIdx === -1) return key;
  return key.slice(asIdx + ' as '.length).trim();
}

/**
 * The full set of `{ localName → expectedSource }` the optimizer would inject, computed WITHOUT the
 * `alreadyImported` mask — collision detection must see names the mask hides (a same-named user
 * import from a different source is still a real collision). Keep in sync with
 * `collectNeededImports`.
 */
export function computeWouldInjectNames(ctx: RewriteContext): Map<string, string> {
  const result = new Map<string, string>();
  const {
    topLevel,
    extractions,
    inlineOptions,
    isDevMode,
    isInline,
    inlinedQrlSymbols,
    noArgQrlCallees,
    eventHandlerExtraImports,
    jsxResult,
    originalImports,
  } = ctx;
  const hasTopLevelNonSync = topLevel.some((e) => !e.isSync);
  const hasAnyNonSync = extractions.some((e) => !e.isSync);

  const add = (key: string, source: string): void => {
    if (!result.has(key)) result.set(key, source);
  };

  if (isInline) {
    if (hasAnyNonSync) add(isDevMode ? '_noopQrlDEV' : '_noopQrl', '@qwik.dev/core');
    const needsCapturesImport = extractions.some(
      (e) =>
        !e.isSync &&
        e.captureNames.length > 0 &&
        !(
          inlineOptions &&
          isStrippedExtraction(e, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers)
        )
    );
    if (needsCapturesImport) add('_captures', '@qwik.dev/core');
  } else if (inlineOptions && !inlineOptions.inline) {
    if (hasTopLevelNonSync) {
      const hasNonStripped = topLevel.some(
        (e) =>
          !e.isSync &&
          !isStrippedExtraction(e, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers)
      );
      const hasStripped = topLevel.some(
        (e) =>
          !e.isSync &&
          isStrippedExtraction(e, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers)
      );
      if (hasNonStripped) add(isDevMode ? 'qrlDEV' : 'qrl', '@qwik.dev/core');
      if (hasStripped) add(isDevMode ? '_noopQrlDEV' : '_noopQrl', '@qwik.dev/core');
    }
  } else {
    if (hasTopLevelNonSync) {
      add(isDevMode ? 'qrlDEV' : 'qrl', '@qwik.dev/core');
      const hasInlinedQrlLocal = topLevel.some(
        (e) => e.isInlinedQrl && !ctx.relPath.includes('node_modules')
      );
      if (hasInlinedQrlLocal && !isDevMode) add('qrlDEV', '@qwik.dev/core');
    }
  }

  for (const ext of topLevel) {
    if (ext.isSync) {
      add('_qrlSync', '@qwik.dev/core');
      continue;
    }
    if (ext.isBare) {
      if (inlinedQrlSymbols.has(ext.symbolName)) add('qrl', '@qwik.dev/core');
      continue;
    }
    const qrlCallee = ext.qrlCallee;
    if (qrlCallee) {
      let isCustom = true;
      for (const [, info] of originalImports) {
        if (info.importedName === ext.calleeName) {
          isCustom = false;
          break;
        }
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
  readonly idStart: number;
  readonly idEnd: number;
}

type UserSymbol = UserSymbolImport | UserSymbolDecl;

function pickFreshName(base: string, taken: ReadonlySet<string>): string {
  for (let i = 1; i < 10_000; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`pickFreshName exhausted suffixes for ${base}`);
}

function findBindingIdentifierPositions(
  program: AstProgram,
  name: string
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
    if (
      node.type === 'FunctionDeclaration' &&
      node.id?.type === 'Identifier' &&
      node.id.name === name
    ) {
      return { start: node.id.start, end: node.id.end };
    }
    if (
      node.type === 'ClassDeclaration' &&
      node.id?.type === 'Identifier' &&
      node.id.name === name
    ) {
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
      } else if (
        (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') &&
        decl.id?.type === 'Identifier' &&
        decl.id.name === name
      ) {
        return { start: decl.id.start, end: decl.id.end };
      }
    }
  }
  return null;
}

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
 * Scope stack tracks inner shadows so a renamed top-level binding's references are rewritten but an
 * inner same-named binding's are left alone.
 */
function rewriteReferences(
  ctx: RewriteContext,
  renameMap: ReadonlyMap<string, string>,
  excludedPositions: ReadonlySet<number>
): void {
  const { program, s } = ctx;
  const scopeStack: Array<Set<string>> = [];

  function isShadowed(name: string): boolean {
    for (const scope of scopeStack) if (scope.has(name)) return true;
    return false;
  }

  function walk(node: AstNode | null | undefined, parentKey?: string, parentNode?: AstNode): void {
    if (!node) return;

    // Import ranges were already `s.remove`d elsewhere; overwriting inside
    // a removed range re-introduces text (`qrl1;` residue), so skip the
    // whole subtree — the surviving import is rebuilt separately.
    if (node.type === 'ImportDeclaration') return;

    if (node.type === 'Identifier') {
      const newName = renameMap.get(node.name);
      if (newName !== undefined && !isShadowed(node.name)) {
        const isPropertyKey =
          parentKey === 'key' && parentNode?.type === 'Property' && !parentNode.computed;
        const isMemberProp =
          parentKey === 'property' &&
          parentNode?.type === 'MemberExpression' &&
          !parentNode.computed;
        // The binding's own decl-id was already overwritten directly; skip
        // it here. Inner same-named decl-ids are blocked by `isShadowed`.
        const isDeclId = excludedPositions.has(node.start);
        // A shorthand Property has key === value (same Identifier);
        // rewriting it would silently drop the property name, so leave it.
        const isShorthandValue =
          parentKey === 'value' && parentNode?.type === 'Property' && parentNode.shorthand === true;
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
    // Function bodies are also BlockStatements: the function-like push
    // handles params, this one handles the body's own lexical decls.
    if (node.type !== 'BlockStatement') return null;
    const scope = new Set<string>();
    collectBlockBindings(node.body ?? [], scope);
    return scope;
  }

  walk(program);
}

/**
 * The source import was already `s.remove`d, so a MagicString overwrite wouldn't take — rename by
 * editing the rebuilt `survivingUserImports` string (and its structured `namedParts`) instead.
 */
function applyImportSpecifierRename(
  ctx: RewriteContext,
  importIdx: number,
  partIdx: number,
  newLocal: string
): void {
  const info = ctx.survivingImportInfos[importIdx];
  const part = info.namedParts[partIdx];
  const updatedPart = { imported: part.imported, local: newLocal };
  info.namedParts[partIdx] = updatedPart;

  const namedStrs = info.namedParts.map((np) =>
    np.imported !== np.local ? `${np.imported} as ${np.local}` : np.local
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
 * Runs AFTER all body rewrites but BEFORE `collectNeededImports`, so the would-inject universe is
 * computed independently of `alreadyImported` (a same-named user import from a different source is
 * still a collision).
 */
export function detectAndRenameCollisions(ctx: RewriteContext): void {
  const wouldInject = computeWouldInjectNames(ctx);
  if (wouldInject.size === 0) return;

  const wouldInjectByLocal = new Map<string, string>();
  for (const [key, source] of wouldInject) {
    wouldInjectByLocal.set(localNameOfNeeded(key), source);
  }

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

  if (ctx.moduleLevelDecls) {
    for (const decl of ctx.moduleLevelDecls) {
      if (userSymbols.has(decl.name)) continue;
      const pos = findBindingIdentifierPositions(ctx.program, decl.name);
      if (!pos) continue;
      userSymbols.set(decl.name, { kind: 'decl', idStart: pos.start, idEnd: pos.end });
    }
  }

  // A user import from the *same* source as the injected one is a deliberate
  // dedup, not a collision — skip it; only a different source (or a shadowing
  // decl) needs renaming.
  const renameMap = new Map<string, string>();
  const taken = new Set<string>([...userSymbols.keys(), ...wouldInjectByLocal.keys()]);
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

  const declExclusions = new Set<number>();
  for (const [oldName, newName] of renameMap) {
    const sym = userSymbols.get(oldName);
    if (sym?.kind !== 'decl') continue;
    ctx.s.overwrite(sym.idStart, sym.idEnd, newName);
    declExclusions.add(sym.idStart);
  }

  for (const [oldName, newName] of renameMap) {
    const sym = userSymbols.get(oldName);
    if (sym?.kind !== 'import') continue;
    applyImportSpecifierRename(ctx, sym.importIdx, sym.partIdx, newName);
  }

  rewriteReferences(ctx, renameMap, declExclusions);

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
        // `name` is readonly; cast through to mutate it for the rename.
        if (decl.name === oldName) {
          (decl as { name: string }).name = newName;
        }
      }
    }
  }

  // This runs after `collectNeededImports`, whose `alreadyImported` mask
  // is now stale post-rename; re-add each renamed name's import from the
  // authoritative `wouldInject` map so it isn't dropped.
  for (const [renamedUserName] of renameMap) {
    for (const [key, source] of wouldInject) {
      if (localNameOfNeeded(key) !== renamedUserName) continue;
      if (!ctx.neededImports.has(key)) {
        ctx.neededImports.set(key, source);
      }
    }
  }

  // `segmentImports` was built pre-rename; any entry keyed on `oldName` is
  // now stale (the import is `newName`, or the ref became a local shadow /
  // dead). Drop them — `recollectPostTransformImports` re-derives whatever
  // the post-transform body genuinely needs.
  for (const ext of ctx.extractions) {
    if (ext.segmentImports.length === 0) continue;
    const filtered = ext.segmentImports.filter((imp) => !renameMap.has(imp.localName));
    if (filtered.length !== ext.segmentImports.length) {
      // `segmentImports` is readonly; cast through to reassign the filtered list.
      (ext as unknown as { segmentImports: ImportInfo[] }).segmentImports = filtered;
    }
  }
}

export const __internals = {
  localNameOfNeeded,
  pickFreshName,
  findBindingIdentifierPositions,
};
