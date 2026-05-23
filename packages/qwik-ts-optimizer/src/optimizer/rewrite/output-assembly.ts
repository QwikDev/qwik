/**
 * Output assembly phases for parent module rewriting.
 *
 * Contains QRL declaration building, needed import collection,
 * unused import filtering, inline .s() call generation, and
 * final output assembly with TS type stripping.
 */

import type MagicString from 'magic-string';
import { transformSync as oxcTransformSync, type TransformOptions } from 'oxc-transform';
import { createRegExp, exactly, wordBoundary } from 'magic-regexp';
import type { AstNode, AstProgram } from '../../ast-types.js';
import type { ExtractionResult } from '../extract.js';
import type { ImportInfo } from '../marker-detection.js';
import type { ModuleLevelDecl } from '../variable-migration.js';
import {
  buildQrlDeclaration,
  getQrlImportSource,
} from '../rewrite-calls.js';
import { buildQrlDevDeclaration, buildDevFilePath } from '../dev-mode.js';
import {
  buildNoopQrlDeclaration,
  buildNoopQrlDevDeclaration,
  buildStrippedNoopQrl,
  buildStrippedNoopQrlDev,
  buildSCall,
  buildHoistConstDecl,
  buildHoistSCall,
} from '../inline-strategy.js';
import { rewriteFunctionSignature } from '../segment-codegen.js';
import { collapseToLibInlinedQrl } from './lib-mode-collapse.js';
import { SignalHoister } from '../signal-analysis.js';
import { isRelativePathInsideBase } from '../path-utils.js';
import { transformInlineSegmentBody } from './inline-body.js';
import {
  hasUnderscorePlaceholderParams,
  isStrippedSegment,
  matchesRegCtxName,
} from './predicates.js';
import type { InlineSegmentJsxOptions } from './raw-props.js';
import type { RewriteContext } from './rewrite-context.js';

function isCustomInlined(
  ext: ExtractionResult,
  originalImports: Map<string, ImportInfo>,
): boolean {
  for (const [, info] of originalImports) {
    if (info.importedName === ext.calleeName) return false;
  }
  return true;
}

export function collectNeededImports(ctx: RewriteContext): void {
  const { neededImports, alreadyImported, topLevel, extractions,
    inlineOptions, isDevMode, isInline, inlinedQrlSymbols,
    noArgQrlCallees, eventHandlerExtraImports, jsxResult, originalImports } = ctx;
  const hasTopLevelNonSync = topLevel.some((e) => !e.isSync);
  const hasAnyNonSync = extractions.some((e) => !e.isSync);

  if (isInline) {
    if (hasAnyNonSync) {
      const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
      if (!alreadyImported.has(noopSymbol)) {
        neededImports.set(noopSymbol, '@qwik.dev/core');
      }
    }
    const needsCapturesImport = extractions.some(
      (e) => !e.isSync && e.captureNames.length > 0 && !(inlineOptions && isStrippedSegment(
        e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      )),
    );
    if (needsCapturesImport && !alreadyImported.has('_captures')) {
      neededImports.set('_captures', '@qwik.dev/core');
    }
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
      if (hasNonStripped) {
        const qrlSymbol = isDevMode ? 'qrlDEV' : 'qrl';
        if (!alreadyImported.has(qrlSymbol)) neededImports.set(qrlSymbol, '@qwik.dev/core');
      }
      if (hasStripped) {
        const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
        if (!alreadyImported.has(noopSymbol)) neededImports.set(noopSymbol, '@qwik.dev/core');
      }
    }
  } else {
    if (hasTopLevelNonSync) {
      const qrlSymbol = isDevMode ? 'qrlDEV' : 'qrl';
      if (!alreadyImported.has(qrlSymbol)) neededImports.set(qrlSymbol, '@qwik.dev/core');
      const hasInlinedQrlLocal = topLevel.some(
        (e) => e.isInlinedQrl && !ctx.relPath.includes('node_modules'),
      );
      if (hasInlinedQrlLocal && !isDevMode && !alreadyImported.has('qrlDEV')) {
        neededImports.set('qrlDEV', '@qwik.dev/core');
      }
    }
  }

  for (const ext of topLevel) {
    if (ext.isSync) {
      if (!alreadyImported.has('_qrlSync')) neededImports.set('_qrlSync', '@qwik.dev/core');
      continue;
    }
    if (ext.isBare) {
      if (inlinedQrlSymbols.has(ext.symbolName) && !alreadyImported.has('qrl')) {
        neededImports.set('qrl', '@qwik.dev/core');
      }
      continue;
    }

    const qrlCallee = ext.qrlCallee;
    if (qrlCallee && !alreadyImported.has(qrlCallee)) {
      if (!isCustomInlined(ext, originalImports)) {
        neededImports.set(qrlCallee, getQrlImportSource(qrlCallee, ext.importSource));
      }
    }
  }

  for (const { callee, source } of noArgQrlCallees) {
    if (!neededImports.has(callee)) {
      neededImports.set(callee, getQrlImportSource(callee, source));
    }
  }
  for (const { sym, src } of eventHandlerExtraImports) {
    if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
      neededImports.set(sym, src);
    }
  }

  if (jsxResult) {
    for (const sym of jsxResult.neededImports) {
      if (!alreadyImported.has(sym)) neededImports.set(sym, '@qwik.dev/core');
    }
    if (jsxResult.needsFragment && !alreadyImported.has('_Fragment')) {
      neededImports.set('Fragment as _Fragment', '@qwik.dev/core/jsx-runtime');
    }
  }
}

export function buildQrlDeclarations(ctx: RewriteContext): void {
  const { extractions, inlineOptions, isDevMode, devFilePath, isInline,
    inlinedQrlSymbols, explicitExtensions, outputExtension, relPath } = ctx;
  const topLevelNonSync = extractions.filter((e) => !e.isSync && e.parent === null && !inlinedQrlSymbols.has(e.symbolName));
  const allNonSync = extractions.filter((e) => !e.isSync && !inlinedQrlSymbols.has(e.symbolName));

  // Symbols whose source-decl is being `move`d into a sibling segment's file.
  // For these, the parent skips the usual `const q_<sym> = qrl(...)` declaration
  // and instead emits a bare `qrl(...);` expression statement — runtime preload
  // registration only, since `q_<sym>` is no longer referenced in the parent
  // (the `componentQrl(q_<sym>)` wrap got moved out alongside the source decl).
  const movedMarkerSymbols = new Set<string>();
  if (ctx.migrationDecisions && ctx.moduleLevelDecls) {
    const fileStem = relPath.split('/').pop() ?? relPath;
    for (const decision of ctx.migrationDecisions) {
      if (decision.action !== 'move') continue;
      const exact = `${fileStem}_${decision.varName}`;
      const prefix = `${exact}_`;
      for (const e of extractions) {
        if (e.parent !== null) continue;
        if (e.isInlinedQrl) continue;
        if (e.displayName === exact || e.displayName.startsWith(prefix)) {
          movedMarkerSymbols.add(e.symbolName);
          break;
        }
      }
    }
  }

  let strippedCounter = 0;

  if (isInline) {
    for (const ext of allNonSync) {
      const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
      const stripped = !isRegCtx && inlineOptions && isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );

      if (stripped) {
        const idx = strippedCounter++;
        if (isDevMode && devFilePath) {
          ctx.qrlDecls.push(buildStrippedNoopQrlDev(ext.symbolName, idx, {
            file: devFilePath, lo: 0, hi: 0, displayName: ext.displayName,
          }));
        } else {
          ctx.qrlDecls.push(buildStrippedNoopQrl(ext.symbolName, idx));
        }
        const counter = 0xffff0000 + idx * 2;
        ctx.qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        if (isDevMode && devFilePath) {
          ctx.qrlDecls.push(buildNoopQrlDevDeclaration(ext.symbolName, {
            file: devFilePath, lo: ext.argStart, hi: ext.argEnd, displayName: ext.displayName,
          }));
        } else {
          ctx.qrlDecls.push(buildNoopQrlDeclaration(ext.symbolName));
        }
        ctx.qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  } else if (inlineOptions && !inlineOptions.inline) {
    for (const ext of topLevelNonSync) {
      const stripped = isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );

      if (stripped) {
        const idx = strippedCounter++;
        if (isDevMode && devFilePath) {
          ctx.qrlDecls.push(buildStrippedNoopQrlDev(ext.symbolName, idx, {
            file: devFilePath, lo: 0, hi: 0, displayName: ext.displayName,
          }));
        } else {
          ctx.qrlDecls.push(buildStrippedNoopQrl(ext.symbolName, idx));
        }
        const counter = 0xffff0000 + idx * 2;
        ctx.qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        if (isDevMode && devFilePath) {
          const devExt = explicitExtensions ? (outputExtension ?? '.js') : undefined;
          ctx.qrlDecls.push(buildQrlDevDeclaration(
            ext.symbolName, ext.canonicalFilename, devFilePath,
            ext.loc[0], ext.loc[1], ext.displayName, devExt,
          ));
        } else {
          ctx.qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename, explicitExtensions, ext.extension, outputExtension));
        }
        ctx.qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  } else {
    const devExt = explicitExtensions ? (outputExtension ?? '.js') : undefined;
    for (const ext of topLevelNonSync) {
      if (movedMarkerSymbols.has(ext.symbolName)) {
        const fileExt = explicitExtensions ? (outputExtension ?? '.js') : '';
        ctx.qrlDecls.push(
          `qrl(()=>import("./${ext.canonicalFilename}${fileExt}"), "${ext.symbolName}");`,
        );
        // Intentionally not adding `q_<sym>` to `qrlVarNames`: the
        // parent no longer declares this binding, so any stray reference
        // should surface as a downstream error rather than be silently named.
        continue;
      }
      if (isDevMode && devFilePath) {
        ctx.qrlDecls.push(buildQrlDevDeclaration(
          ext.symbolName, ext.canonicalFilename, devFilePath,
          ext.loc[0], ext.loc[1], ext.displayName, devExt,
        ));
      } else if (ext.isInlinedQrl && !relPath.includes('node_modules')) {
        const inlinedDevFile = devFilePath ?? buildDevFilePath(relPath, '', undefined);
        ctx.qrlDecls.push(buildQrlDevDeclaration(
          ext.symbolName, ext.canonicalFilename, inlinedDevFile,
          ext.loc[0], ext.loc[1], ext.displayName, devExt,
        ));
      } else {
        ctx.qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename, explicitExtensions, ext.extension, outputExtension));
      }
      ctx.qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
    }
  }

  ctx.qrlDecls.sort();
}

export function buildInlineSCalls(ctx: RewriteContext): void {
  if (!ctx.isInline) return;

  const { extractions, inlineOptions, jsxOptions, isDevMode, relPath,
    s, program, neededImports, alreadyImported, qrlVarNames, inlinedQrlSymbols, mode, transpileTs,
    migrationDecisions } = ctx;
  const allNonSync = extractions.filter((e) => !e.isSync && !inlinedQrlSymbols.has(e.symbolName));

  // Names migration is reexporting (`_auto_<name>`) or moving — same filter
  // `addCaptureWrapping` (`rewrite/index.ts:657`) applies at the `.w(...)`
  // emission site. Body-side capture unpacking must filter symmetrically:
  // the migrated decl is in module scope under inline/hoist (body stays in
  // parent) or imported via `_auto_` under segment-file, so `_captures[N]`
  // indirection is unwanted and would deliver undefined.
  const migratedNames: ReadonlySet<string> = new Set(
    (migrationDecisions ?? [])
      .filter((d) => d.action === 'reexport' || d.action === 'move')
      .map((d) => d.varName),
  );

  const isHoist = inlineOptions?.entryType === 'hoist' ||
    (inlineOptions?.entryType === 'inline' && !!transpileTs && !!jsxOptions?.enableJsx && mode !== 'dev');

  let inlineSegmentJsxOptions: InlineSegmentJsxOptions | undefined = jsxOptions?.enableJsx
    ? {
        enableJsx: true,
        importedNames: jsxOptions.importedNames,
        devOptions: isDevMode ? { relPath } : undefined,
        keyCounterStart: isHoist ? ctx.jsxKeyCounterValue : undefined,
        relPath,
      }
    : undefined;

  const sharedHoister = jsxOptions?.enableJsx ? new SignalHoister() : undefined;

  const nestedExts: ExtractionResult[] = [];
  const topNonComponent: ExtractionResult[] = [];
  const topComponent: ExtractionResult[] = [];

  for (const ext of allNonSync) {
    const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
    const isStrippedExt = !isRegCtx && inlineOptions && isStrippedSegment(
      ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
    );
    if (isStrippedExt) continue;

    if (ext.parent !== null) {
      nestedExts.push(ext);
    } else if (ext.ctxName === 'component') {
      topComponent.push(ext);
    } else {
      topNonComponent.push(ext);
    }
  }

  const extContainingStmtStart = new Map<string, number>();
  if (isHoist) {
    for (const ext of allNonSync) {
      for (const stmt of program.body) {
        if (stmt.type === 'ImportDeclaration') continue;
        if (ext.callStart >= stmt.start && ext.callStart < stmt.end) {
          extContainingStmtStart.set(ext.symbolName, stmt.start);
          break;
        }
      }
    }
  }

  const processExtraction = (ext: ExtractionResult) => {
    const varName = qrlVarNames.get(ext.symbolName) ?? `q_${ext.symbolName}`;
    const { transformedBody: rawBody, additionalImports, hoistedDeclarations, keyCounterValue } = transformInlineSegmentBody(
      ext, extractions, qrlVarNames, inlineSegmentJsxOptions, inlineOptions?.regCtxName, sharedHoister,
      ctx.closureNodes, ctx.source, ctx.originalImports, ctx.relPath, ctx.jsxKeyCounterValue,
      migratedNames,
    );

    let sigRewrittenBody = rawBody;
    if (hasUnderscorePlaceholderParams(ext.paramNames)) {
      sigRewrittenBody = rewriteFunctionSignature(rawBody, ext.paramNames);
    }

    const isRegCtxMatch = matchesRegCtxName(ext, inlineOptions?.regCtxName);
    let transformedBody = sigRewrittenBody;
    if (isRegCtxMatch) {
      transformedBody = `/*#__PURE__*/ _regSymbol(${rawBody}, "${ext.hash}")`;
      neededImports.set('_regSymbol', '@qwik.dev/core');
    }

    if (isHoist && keyCounterValue !== undefined && inlineSegmentJsxOptions) {
      ctx.jsxKeyCounterValue = keyCounterValue;
      inlineSegmentJsxOptions = { ...inlineSegmentJsxOptions, keyCounterStart: ctx.jsxKeyCounterValue };
    } else if (keyCounterValue !== undefined) {
      // OSS-405: under inline strategy, jsx-call rewrites in `.s(body)` blocks
      // advance the JSX key counter shared across all `.s(body)` calls in the
      // module. Without this, body2's keys would restart at 0.
      ctx.jsxKeyCounterValue = keyCounterValue;
    }
    ctx.inlineHoistedDeclarations.push(...hoistedDeclarations);
    for (const [sym, src] of additionalImports) {
      if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
        neededImports.set(sym, src);
      }
    }

    const forceInlineForRegCtx = isRegCtxMatch && inlineOptions?.entryType === 'inline';
    if (isHoist && !forceInlineForRegCtx) {
      // OSS-407 Fix A: when body is a bare identifier referring to a
      // module-level decl (`useStyle$(STYLES)` shape — body slice = "STYLES"),
      // the const-decl wrapping that Hoist normally emits is redundant. SWC
      // emits `q_X.s(STYLES)` directly. Route to `ctx.sCalls` so `placeSCalls`
      // can place it relative to the referenced decl (which may be declared
      // AFTER the extraction's containing statement — TDZ otherwise; see
      // OSS-407 Fix C in placeSCalls).
      const moduleDeclNames = ctx.moduleLevelDecls
        ? new Set(ctx.moduleLevelDecls.map((d) => d.name))
        : undefined;
      const trimmedBody = transformedBody.trim();
      const bareIdentMatch = /^[A-Za-z_$][\w$]*$/.exec(trimmedBody);
      if (
        !isRegCtxMatch &&
        moduleDeclNames &&
        bareIdentMatch !== null &&
        moduleDeclNames.has(trimmedBody)
      ) {
        ctx.sCalls.push(buildSCall(varName, trimmedBody));
      } else {
        let hoistBody = transformedBody;
        try {
          const stripped = oxcTransformSync('__body__.tsx', hoistBody);
          if (stripped.code && !stripped.errors?.length) {
            hoistBody = stripped.code;
            if (hoistBody.endsWith(';\n')) hoistBody = hoistBody.slice(0, -2);
            else if (hoistBody.endsWith(';')) hoistBody = hoistBody.slice(0, -1);
          }
        } catch {
          // TS stripping failed, use original
        }
        const constDecl = buildHoistConstDecl(ext.symbolName, hoistBody);
        const sCall = buildHoistSCall(varName, ext.symbolName);
        const stmtStart = extContainingStmtStart.get(ext.symbolName);
        if (stmtStart !== undefined) {
          s.appendLeft(stmtStart, constDecl + '\n' + sCall + '\n');
        } else {
          ctx.sCalls.push(constDecl);
          ctx.sCalls.push(sCall);
        }
      }
    } else {
      ctx.sCalls.push(buildSCall(varName, transformedBody));
    }
  };

  for (const ext of nestedExts) processExtraction(ext);
  for (const ext of topNonComponent) processExtraction(ext);
  for (const ext of topComponent) processExtraction(ext);

  if (sharedHoister) {
    ctx.inlineHoistedDeclarations.length = 0;
    ctx.inlineHoistedDeclarations.push(...sharedHoister.getDeclarations());
  }
}

/**
 * Remove specifiers from surviving user imports that are only used inside
 * segment bodies (no longer referenced in the parent module).
 */
export function filterUnusedImports(ctx: RewriteContext): void {
  const { survivingUserImports, survivingImportInfos, s, qrlDecls, sCalls,
    inlineHoistedDeclarations, isInline, inlineOptions, relPath } = ctx;

  if (survivingUserImports.length === 0 || survivingImportInfos.length === 0) return;

  const bodyText = s.toString();
  const allPreambleText = [...qrlDecls, ...sCalls, ...inlineHoistedDeclarations].join('\n');
  const fullRefText = bodyText + '\n' + allPreambleText;

  for (let idx = survivingUserImports.length - 1; idx >= 0; idx--) {
    const info = survivingImportInfos[idx];
    if (info.isSideEffect || info.nsPart || info.preservedAll) continue;

    let defaultUsed = false;
    if (info.defaultPart) {
      defaultUsed = createRegExp(wordBoundary, exactly(info.defaultPart), wordBoundary).test(fullRefText);
    }

    const usedNamed: { local: string; imported: string }[] = [];
    for (const np of info.namedParts) {
      if (createRegExp(wordBoundary, exactly(np.local), wordBoundary).test(fullRefText)) {
        usedNamed.push(np);
      }
    }

    if (!defaultUsed && usedNamed.length === 0 && !info.nsPart) {
      const src = info.source;
      const hasStripping = !!(inlineOptions?.stripCtxName?.length || inlineOptions?.stripEventHandlers);
      if (isInline && hasStripping && isRelativePathInsideBase(src, relPath)) {
        survivingUserImports[idx] = `import ${info.quote}${src}${info.quote};`;
        survivingImportInfos[idx] = { ...info, namedParts: [], defaultPart: '', isSideEffect: true };
        continue;
      }
      survivingUserImports.splice(idx, 1);
      survivingImportInfos.splice(idx, 1);
      continue;
    }

    if (usedNamed.length < info.namedParts.length) {
      const namedStrs = usedNamed.map(np =>
        np.imported !== np.local ? `${np.imported} as ${np.local}` : np.local
      );
      let importParts = '';
      const dp = defaultUsed ? info.defaultPart : '';
      if (namedStrs.length > 0) {
        importParts = dp
          ? `${dp}, { ${namedStrs.join(', ')} }`
          : `{ ${namedStrs.join(', ')} }`;
      } else if (dp) {
        importParts = dp;
      }
      if (importParts) {
        survivingUserImports[idx] = `import ${importParts} from ${info.quote}${info.source}${info.quote};`;
        survivingImportInfos[idx] = { ...info, namedParts: usedNamed, defaultPart: dp };
      } else {
        survivingUserImports.splice(idx, 1);
        survivingImportInfos.splice(idx, 1);
      }
    }
  }
}

/**
 * `export const X = component$(...)` pre-rewrite or `export const X = componentQrl(...)`
 * post-rewrite. Either suffix identifies an export whose init is being QRL-wrapped —
 * the OSS-404 F1c anchor for sCall placement (self-referencing sCalls must go after
 * such exports to avoid TDZ at module load).
 */
function isMarkerLikeCall(init: AstNode | null | undefined): boolean {
  if (!init || init.type !== 'CallExpression' || init.callee?.type !== 'Identifier') return false;
  const name = init.callee.name;
  return name.endsWith('$') || name.endsWith('Qrl');
}

function findExportedMarkerNames(program: AstProgram): Set<string> {
  const names = new Set<string>();
  for (const stmt of program.body) {
    if (stmt.type !== 'ExportNamedDeclaration' || stmt.declaration?.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declaration.declarations ?? []) {
      if (decl.id?.type !== 'Identifier' || !isMarkerLikeCall(decl.init)) continue;
      names.add(decl.id.name);
    }
  }
  return names;
}

function findLastMarkerExportAnchor(program: AstProgram): { start: number; end: number } | null {
  for (let i = program.body.length - 1; i >= 0; i--) {
    const stmt = program.body[i];
    if (stmt.type === 'ExportDefaultDeclaration') return { start: stmt.start, end: stmt.end };
    if (stmt.type !== 'ExportNamedDeclaration' || stmt.declaration?.type !== 'VariableDeclaration') continue;
    if (isMarkerLikeCall(stmt.declaration.declarations?.[0]?.init)) {
      return { start: stmt.start, end: stmt.end };
    }
  }
  return null;
}

function findLastReferencedDeclEnd(
  sCalls: readonly string[],
  decls: readonly ModuleLevelDecl[],
): number | null {
  let maxEnd = -1;
  for (const decl of decls) {
    if (decl.declEnd <= maxEnd) continue;
    const wb = new RegExp('\\b' + decl.name + '\\b');
    if (sCalls.some((sc) => wb.test(sc))) maxEnd = decl.declEnd;
  }
  return maxEnd >= 0 ? maxEnd : null;
}

/**
 * For a single sCall, find the last (latest by `declEnd`) module-level decl
 * the sCall body references AND whose `declStart` is strictly after `threshold`.
 *
 * Used by `placeSCalls` to detect TDZ-sensitive forward dependencies: an sCall
 * that references a decl declared *after* the marker-export anchor (e.g.
 * `q_useStyle.s(STYLES)` where `const STYLES = '...'` follows `export const
 * Works = component$(...)` in source). The marker-anchor partitioning otherwise
 * places such sCalls before the export — referencing STYLES before it's
 * declared. Returns null when no forward dep exists.
 */
function findForwardReferencedDeclEnd(
  sCall: string,
  decls: readonly ModuleLevelDecl[],
  threshold: number,
): number | null {
  let maxEnd = -1;
  for (const decl of decls) {
    if (decl.declStart <= threshold) continue;
    if (decl.declEnd <= maxEnd) continue;
    if (new RegExp('\\b' + decl.name + '\\b').test(sCall)) maxEnd = decl.declEnd;
  }
  return maxEnd >= 0 ? maxEnd : null;
}

function partitionSCallsBySelfRef(
  sCalls: readonly string[],
  exportedNames: ReadonlySet<string>,
): { beforeExport: string[]; afterExport: string[] } {
  const beforeExport: string[] = [];
  const afterExport: string[] = [];
  for (const sCall of sCalls) {
    const refsExport = [...exportedNames].some((n) => new RegExp('\\b' + n + '\\b').test(sCall));
    (refsExport ? afterExport : beforeExport).push(sCall);
  }
  return { beforeExport, afterExport };
}

/**
 * Splice sCalls into the parent module via `MagicString` offsets. Each sCall
 * lands at exactly one position; the chosen position depends on its body's
 * references against the anchors below.
 *
 * Anchor priority:
 *   1. Forward decl dependency (OSS-407, per-sCall): when a marker-export
 *      anchor exists AND the sCall references a module-level decl declared
 *      *after* the anchor. Place AFTER that decl to avoid TDZ at module
 *      load (e.g. `q_useStyle.s(STYLES)` where `const STYLES` follows
 *      `export const Works = component$(...)`). Per-sCall because the same
 *      module may mix forward-dep sCalls with anchor-relative ones.
 *   2. Marker-call export anchor (OSS-404 F1c port, group): remaining
 *      sCalls partition by self-ref to any exported marker name. Self-
 *      referencing sCalls go AFTER the export to avoid TDZ on the
 *      reference; non-referencing go BEFORE.
 *   3. No marker anchor (OSS-405, group): last module-decl any remaining
 *      sCall body references — peer-tool `inlinedQrl` input uses plain
 *      `export { name }`, no marker init to anchor against.
 *   4. No anchor at all → append at end of file.
 *
 * The "group" placements preserve OSS-404/OSS-405's behaviour of keeping
 * adjacent sCalls together. Only the TDZ-sensitive forward-dep case splits
 * out of the group.
 */
function placeSCalls(
  s: MagicString,
  program: AstProgram,
  sCalls: readonly string[],
  moduleLevelDecls: readonly ModuleLevelDecl[] | undefined,
): void {
  if (sCalls.length === 0) return;

  const markerAnchor = findLastMarkerExportAnchor(program);
  const decls = moduleLevelDecls ?? [];

  // Pull out OSS-407 forward-dep sCalls per-sCall; the rest stays grouped.
  const groupedSCalls: string[] = [];
  for (const sCall of sCalls) {
    const forwardDeclEnd = markerAnchor && decls.length > 0
      ? findForwardReferencedDeclEnd(sCall, decls, markerAnchor.end)
      : null;
    if (forwardDeclEnd !== null) s.appendRight(forwardDeclEnd, '\n' + sCall);
    else groupedSCalls.push(sCall);
  }
  if (groupedSCalls.length === 0) return;

  if (markerAnchor) {
    const exportedNames = findExportedMarkerNames(program);
    const { beforeExport, afterExport } = partitionSCallsBySelfRef(groupedSCalls, exportedNames);
    if (beforeExport.length > 0) s.appendLeft(markerAnchor.start, beforeExport.join('\n') + '\n');
    if (afterExport.length > 0) s.appendRight(markerAnchor.end, '\n' + afterExport.join('\n'));
    return;
  }

  const lastDeclEnd = decls.length > 0
    ? findLastReferencedDeclEnd(groupedSCalls, decls)
    : null;
  if (lastDeclEnd !== null) {
    s.appendRight(lastDeclEnd, '\n' + groupedSCalls.join('\n'));
    return;
  }

  s.append('\n' + groupedSCalls.join('\n'));
}

export function assembleOutput(ctx: RewriteContext): string {
  const { s, source, program, neededImports, survivingUserImports, jsxResult,
    inlineHoistedDeclarations, qrlDecls, sCalls, migrationDecisions,
    moduleLevelDecls, jsxOptions, transpileTs } = ctx;

  const importStatements = Array.from(neededImports.entries()).map(
    ([symbol, src]) => `import { ${symbol} } from "${src}";`,
  );

  const preamble: string[] = [];
  if (importStatements.length > 0) preamble.push(...importStatements);
  if (survivingUserImports.length > 0) preamble.push(...survivingUserImports);

  const allHoistedDecls: string[] = [];
  if (jsxResult && jsxResult.hoistedDeclarations.length > 0) {
    allHoistedDecls.push(...jsxResult.hoistedDeclarations);
  }
  if (inlineHoistedDeclarations.length > 0) {
    allHoistedDecls.push(...inlineHoistedDeclarations);
  }
  if (allHoistedDecls.length > 0) {
    preamble.push('//');
    preamble.push(...allHoistedDecls);
  }
  if (qrlDecls.length > 0) {
    preamble.push('//');
    preamble.push(...qrlDecls);
  }
  if (sCalls.length === 0) {
    preamble.push('//');
  }

  s.prepend(preamble.join('\n') + '\n');

  if (migrationDecisions && !ctx.isLibMode) {
    // OSS-421: `_auto_X` re-exports exist to make module-level decls
    // available to segment-file imports. Lib mode emits a single-module
    // output (no segment files), so the re-exports are unnecessary and
    // diverge from SWC's lib emit which omits them.
    for (const decision of migrationDecisions) {
      if (decision.action === 'reexport') {
        const decl = moduleLevelDecls?.find(d => d.name === decision.varName);
        if (decl?.isExported) continue;
        s.append(`\nexport { ${decision.varName} as _auto_${decision.varName} };`);
      }
    }
  }

  if (migrationDecisions && moduleLevelDecls) {
    const removedRanges = new Set<string>();
    for (const decision of migrationDecisions) {
      if (decision.action !== 'move') continue;
      const decl = moduleLevelDecls.find((d) => d.name === decision.varName);
      if (!decl) continue;
      const rangeKey = `${decl.declStart}:${decl.declEnd}`;
      if (removedRanges.has(rangeKey)) continue;
      removedRanges.add(rangeKey);
      let end = decl.declEnd;
      if (end < source.length && source[end] === '\n') end++;
      s.remove(decl.declStart, end);
    }
  }

  placeSCalls(s, program, sCalls, moduleLevelDecls);

  let finalCode = s.toString();

  // OSS-421: lib-mode collapse runs on the assembled inline-strategy
  // output. Transforms `_noopQrl(name) + q_X.s(body)` triples into inline
  // `inlinedQrl(body, name, [captures])` literals at every reference site.
  // Re-uses the inline pipeline's body emission + capture wiring; only the
  // final emission shape differs.
  if (ctx.isLibMode) {
    finalCode = collapseToLibInlinedQrl(finalCode);
  }

  if (transpileTs) {
    const tsStripOptions: TransformOptions = { typescript: { onlyRemoveTypeImports: false } };
    if (!jsxOptions?.enableJsx) {
      tsStripOptions.jsx = 'preserve';
    }
    const stripped = oxcTransformSync('output.tsx', finalCode, tsStripOptions);
    if (stripped.code) {
      finalCode = stripped.code;
    }
  }

  return finalCode;
}
