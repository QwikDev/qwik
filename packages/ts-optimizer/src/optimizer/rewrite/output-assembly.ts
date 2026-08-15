import type MagicString from 'magic-string';
import { transformSync as oxcTransformSync, type TransformOptions } from 'oxc-transform';
import { createRegExp, exactly, wordBoundary } from 'magic-regexp';
import type { AstNode, AstProgram } from '../../ast-types.js';
import type { ExtractionResult } from '../extraction/extract.js';
import type { ImportInfo } from '../extraction/marker-detection.js';
import type { ModuleLevelDecl } from '../analysis/variable-migration.js';
import {
  buildQrlDeclaration,
  buildWorkerQrlDeclaration,
  getQrlImportSource,
  isWorkerExtraction,
  markMovedCaptures,
} from './rewrite-calls.js';
import { isLibModePreservedMarker } from '../qwik/qrl-naming.js';
import { escapeSymbol } from '../../hashing/naming.js';
import { buildQrlDevDeclaration, buildDevFilePath, formatDevMeta } from '../segment/dev-mode.js';
import {
  buildNoopQrlDeclaration,
  buildNoopQrlDevDeclaration,
  buildStrippedNoopQrl,
  buildStrippedNoopQrlDev,
  buildSCall,
  buildHoistConstDecl,
  buildHoistSCall,
  getSentinelCounter,
} from '../segment/inline-strategy.js';
import { rewriteFunctionSignature } from '../segment/segment-codegen.js';
import { collapseToLibInlinedQrl } from './lib-mode-collapse.js';
import { SignalHoister } from '../jsx/signal-analysis.js';
import { isRelativePathInsideBase } from '../../paths.js';
import { transformInlineSegmentBody } from './inline-body.js';
import { deriveIsDev } from './const-replacement.js';
import {
  hasUnderscorePlaceholderParams,
  isAnyComponentCtx,
  isStrippedExtraction,
  matchesRegCtxName,
} from './predicates.js';
import { injectUseHmrIntoInlineBody } from '../transform/module-cleanup.js';
import type { InlineSegmentJsxOptions } from './raw-props.js';
import type { RewriteContext } from './rewrite-context.js';
import {
  formatImportParts,
  formatImportStatement,
  formatNamedImportPart,
} from '../edit/import-format.js';

function isCustomInlined(ext: ExtractionResult, originalImports: Map<string, ImportInfo>): boolean {
  for (const [, info] of originalImports) {
    if (info.importedName === ext.calleeName) return false;
  }
  return true;
}

export function collectNeededImports(ctx: RewriteContext): void {
  const {
    neededImports,
    alreadyImported,
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

  if (isInline) {
    if (hasAnyNonSync) {
      const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
      if (!alreadyImported.has(noopSymbol)) {
        neededImports.set(noopSymbol, '@qwik.dev/core');
      }
    }
    const needsCapturesImport = extractions.some(
      (e) =>
        !e.isSync &&
        e.captureNames.length > 0 &&
        !(
          inlineOptions &&
          isStrippedExtraction(e, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers)
        )
    );
    if (needsCapturesImport && !alreadyImported.has('_captures')) {
      neededImports.set('_captures', '@qwik.dev/core');
    }
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
    const hasWorker = topLevel.some((e) => !e.isSync && isWorkerExtraction(e));
    const hasNonWorkerNonSync = topLevel.some((e) => !e.isSync && !isWorkerExtraction(e));
    if (hasWorker) {
      const chunkSymbol = isDevMode ? '_qrlWithChunkDEV' : '_qrlWithChunk';
      if (!alreadyImported.has(chunkSymbol)) neededImports.set(chunkSymbol, '@qwik.dev/core');
    }
    if (hasNonWorkerNonSync) {
      const qrlSymbol = isDevMode ? 'qrlDEV' : 'qrl';
      if (!alreadyImported.has(qrlSymbol)) neededImports.set(qrlSymbol, '@qwik.dev/core');
      const hasInlinedQrlLocal = topLevel.some(
        (e) => e.isInlinedQrl && !ctx.relPath.includes('node_modules')
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

  // Lib mode keeps the JSX runtime import available for downstream
  // consumers even when the parent module doesn't reference it.
  if (ctx.isLibMode && jsxResult && !alreadyImported.has('jsx')) {
    neededImports.set('jsx as _jsx', '@qwik.dev/core/jsx-runtime');
  }
}

export function buildQrlDeclarations(ctx: RewriteContext): void {
  const {
    extractions,
    inlineOptions,
    isDevMode,
    devFilePath,
    isInline,
    inlinedQrlSymbols,
    explicitExtensions,
    outputExtension,
    relPath,
  } = ctx;
  const topLevelNonSync = extractions.filter(
    (e) => !e.isSync && e.parent === null && !inlinedQrlSymbols.has(e.symbolName)
  );
  const allNonSync = extractions.filter((e) => !e.isSync && !inlinedQrlSymbols.has(e.symbolName));

  // A moved source-decl carries its `componentQrl(q_<sym>)` wrap into the
  // sibling segment, so the parent emits a bare `qrl(...)` registration
  // instead of `const q_<sym> = qrl(...)` — the binding is unreferenced here.
  const movedMarkerSymbols = new Set<string>();
  if (ctx.migrationDecisions && ctx.moduleLevelDecls) {
    const fileStem = relPath.split('/').pop() ?? relPath;
    for (const decision of ctx.migrationDecisions) {
      if (decision.action !== 'move') continue;
      const varName = escapeSymbol(decision.varName);
      const exact = `${fileStem}_${varName}`;
      const prefix = `${exact}_`;
      const bareVarPrefix = `${varName}_`;
      // A moved helper can own several extractions, so scan all — every one
      // loses its parent-side `q_<sym>` binding when the decl moves out.
      for (const e of extractions) {
        if (e.parent !== null) continue;
        if (
          e.displayName === exact ||
          e.displayName.startsWith(prefix) ||
          e.displayName === varName ||
          e.displayName.startsWith(bareVarPrefix)
        ) {
          movedMarkerSymbols.add(e.symbolName);
        }
      }
    }
  }

  let strippedCounter = 0;

  if (isInline) {
    for (const ext of allNonSync) {
      const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
      const stripped =
        !isRegCtx &&
        inlineOptions &&
        isStrippedExtraction(ext, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers);

      if (stripped) {
        const idx = strippedCounter++;
        if (isDevMode && devFilePath) {
          ctx.qrlDecls.push(
            markMovedCaptures(
              buildStrippedNoopQrlDev(ext.symbolName, idx, {
                file: devFilePath,
                lo: 0,
                hi: 0,
                displayName: ext.displayName,
              }),
              ext
            )
          );
        } else {
          ctx.qrlDecls.push(markMovedCaptures(buildStrippedNoopQrl(ext.symbolName, idx), ext));
        }
        const counter = 0xffff0000 + idx * 2;
        ctx.qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        if (isDevMode && devFilePath) {
          ctx.qrlDecls.push(
            markMovedCaptures(
              buildNoopQrlDevDeclaration(ext.symbolName, {
                file: devFilePath,
                lo: ext.argStart,
                hi: ext.argEnd,
                displayName: ext.displayName,
              }),
              ext
            )
          );
        } else {
          ctx.qrlDecls.push(markMovedCaptures(buildNoopQrlDeclaration(ext.symbolName), ext));
        }
        ctx.qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  } else if (inlineOptions && !inlineOptions.inline) {
    for (const ext of topLevelNonSync) {
      const stripped = isStrippedExtraction(
        ext,
        inlineOptions.stripCtxName,
        inlineOptions.stripEventHandlers
      );

      if (stripped) {
        const idx = strippedCounter++;
        if (isDevMode && devFilePath) {
          ctx.qrlDecls.push(
            markMovedCaptures(
              buildStrippedNoopQrlDev(ext.symbolName, idx, {
                file: devFilePath,
                lo: 0,
                hi: 0,
                displayName: ext.displayName,
              }),
              ext
            )
          );
        } else {
          ctx.qrlDecls.push(markMovedCaptures(buildStrippedNoopQrl(ext.symbolName, idx), ext));
        }
        const counter = 0xffff0000 + idx * 2;
        ctx.qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        if (isDevMode && devFilePath) {
          const devExt = explicitExtensions ? (outputExtension ?? '.js') : undefined;
          ctx.qrlDecls.push(
            markMovedCaptures(
              buildQrlDevDeclaration(
                ext.symbolName,
                ext.canonicalFilename,
                devFilePath,
                ext.loc[0],
                ext.loc[1],
                ext.displayName,
                devExt
              ),
              ext
            )
          );
        } else {
          ctx.qrlDecls.push(
            markMovedCaptures(
              buildQrlDeclaration(
                ext.symbolName,
                ext.canonicalFilename,
                explicitExtensions,
                ext.extension,
                outputExtension
              ),
              ext
            )
          );
        }
        ctx.qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  } else {
    const devExt = explicitExtensions ? (outputExtension ?? '.js') : undefined;
    for (const ext of topLevelNonSync) {
      if (isWorkerExtraction(ext)) {
        const varName =
          ctx.earlyQrlVarNames.get(ext.symbolName) ??
          `q_qrl_${getSentinelCounter(strippedCounter++)}`;
        const devMeta =
          isDevMode && devFilePath
            ? formatDevMeta({
                file: devFilePath,
                lo: ext.loc[0],
                hi: ext.loc[1],
                displayName: ext.displayName,
              })
            : undefined;
        ctx.qrlDecls.push(
          buildWorkerQrlDeclaration(
            varName,
            ext.symbolName,
            ext.canonicalFilename,
            explicitExtensions,
            outputExtension,
            devMeta
          )
        );
        ctx.qrlVarNames.set(ext.symbolName, varName);
        continue;
      }
      if (movedMarkerSymbols.has(ext.symbolName) && !(isDevMode && devFilePath)) {
        const fileExt = explicitExtensions ? (outputExtension ?? '.js') : '';
        ctx.qrlDecls.push(
          `qrl(()=>import("./${ext.canonicalFilename}${fileExt}"), "${ext.symbolName}");`
        );
        // Intentionally not registering `q_<sym>` in `qrlVarNames`: the
        // parent no longer declares it, so a stray reference should surface
        // as an error rather than be silently named.
        continue;
      }
      if (isDevMode && devFilePath) {
        ctx.qrlDecls.push(
          markMovedCaptures(
            buildQrlDevDeclaration(
              ext.symbolName,
              ext.canonicalFilename,
              devFilePath,
              ext.loc[0],
              ext.loc[1],
              ext.displayName,
              devExt
            ),
            ext
          )
        );
      } else if (ext.isInlinedQrl && !relPath.includes('node_modules')) {
        const inlinedDevFile = devFilePath ?? buildDevFilePath(relPath, '', undefined);
        ctx.qrlDecls.push(
          buildQrlDevDeclaration(
            ext.symbolName,
            ext.canonicalFilename,
            inlinedDevFile,
            ext.loc[0],
            ext.loc[1],
            ext.displayName,
            devExt
          )
        );
      } else {
        ctx.qrlDecls.push(
          markMovedCaptures(
            buildQrlDeclaration(
              ext.symbolName,
              ext.canonicalFilename,
              explicitExtensions,
              ext.extension,
              outputExtension
            ),
            ext
          )
        );
      }
      ctx.qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
    }
  }

  // Sort by segment symbol, not raw text — bare `qrl(...)` registrations
  // interleave with `const q_* = ...` declarations in symbol order.
  const declSortKey = (line: string): string => /"([^"]+)"\)?;?\s*$/.exec(line)?.[1] ?? line;
  ctx.qrlDecls.sort((a, b) => {
    const ka = declSortKey(a);
    const kb = declSortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

export function buildInlineSCalls(ctx: RewriteContext): void {
  if (!ctx.isInline) return;

  const {
    extractions,
    inlineOptions,
    jsxOptions,
    isDevMode,
    relPath,
    s,
    program,
    neededImports,
    alreadyImported,
    qrlVarNames,
    inlinedQrlSymbols,
    mode,
    transpileTs,
    migrationDecisions,
  } = ctx;
  const allNonSync = extractions.filter((e) => !e.isSync && !inlinedQrlSymbols.has(e.symbolName));

  // A migrated decl is reachable directly — module scope under inline/hoist,
  // or an `_auto_` import under segment-file — never via `_captures`, so
  // unpacking it from `_captures[N]` would deliver undefined. Exclude these.
  const migratedNames: ReadonlySet<string> = new Set(
    (migrationDecisions ?? [])
      .filter((d) => d.action === 'reexport' || d.action === 'move')
      .map((d) => d.varName)
  );

  const isHoist =
    inlineOptions?.entryType === 'hoist' ||
    (inlineOptions?.entryType === 'inline' &&
      !!transpileTs &&
      !!jsxOptions?.enableJsx &&
      mode !== 'dev');

  let inlineSegmentJsxOptions: InlineSegmentJsxOptions | undefined = jsxOptions?.enableJsx
    ? {
        enableJsx: true,
        importedNames: jsxOptions.importedNames,
        // JSX dev-info `fileName:` honors only an explicit user `devPath`,
        // otherwise falling back to `relPath` — not the composed `devFilePath`.
        devOptions: isDevMode ? { relPath: ctx.userDevPath ?? relPath } : undefined,
        source: isDevMode ? ctx.source : undefined,
        keyCounterStart: isHoist ? ctx.jsxKeyCounterValue : undefined,
        relPath,
      }
    : undefined;

  // The parent's JSX transform already hoisted `_hf` decls into module scope;
  // number past them.
  const parentHoistCount = ctx.jsxResult ? ctx.jsxResult.hoistedDeclarations.length / 2 : 0;
  const sharedHoister = jsxOptions?.enableJsx ? new SignalHoister(parentHoistCount) : undefined;
  // Separate from `sharedHoister` (which gets reordered) so emitted `_hf<n>`
  // refs stay aligned with their decls.
  const sharedJsxCallHoister = new SignalHoister(parentHoistCount);

  const nestedExts: ExtractionResult[] = [];
  const topNonComponent: ExtractionResult[] = [];
  const topComponent: ExtractionResult[] = [];

  for (const ext of allNonSync) {
    const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
    const isStrippedExt =
      !isRegCtx &&
      inlineOptions &&
      isStrippedExtraction(ext, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers);
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
    const {
      transformedBody: rawBody,
      additionalImports,
      hoistedDeclarations,
      keyCounterValue,
    } = transformInlineSegmentBody(
      ext,
      extractions,
      qrlVarNames,
      inlineSegmentJsxOptions,
      inlineOptions?.regCtxName,
      sharedHoister,
      ctx.closureNodes,
      ctx.source,
      ctx.originalImports,
      ctx.relPath,
      ctx.jsxCallSkipKeyBases?.get(ext.argStart) ?? ctx.jsxKeyCounterValue,
      migratedNames,
      inlineOptions?.stripCtxName,
      inlineOptions?.stripEventHandlers,
      // Lib output serves both environments — never fold env consts (rust parity).
      ctx.isLibMode ? undefined : ctx.isServer,
      deriveIsDev(ctx.mode),
      sharedJsxCallHoister,
      ctx.elementQpParamsMap
    );

    let sigRewrittenBody = rawBody;
    if (hasUnderscorePlaceholderParams(ext.paramNames, ext.movedCaptures)) {
      sigRewrittenBody = rewriteFunctionSignature(rawBody, ext.paramNames);
    }

    if (ctx.mode === 'hmr' && ctx.devFilePath && isAnyComponentCtx(ext.ctxName)) {
      sigRewrittenBody = injectUseHmrIntoInlineBody(sigRewrittenBody, ctx.devFilePath);
      neededImports.set('_useHmr', '@qwik.dev/core');
    }

    const isRegCtxMatch = matchesRegCtxName(ext, inlineOptions?.regCtxName);
    let transformedBody = sigRewrittenBody;
    if (isRegCtxMatch) {
      transformedBody = `/*#__PURE__*/ _regSymbol(${rawBody}, "${ext.hash}")`;
      neededImports.set('_regSymbol', '@qwik.dev/core');
    }

    // A body numbered from a reserved base must not rewind the shared counter.
    const usedReservedBase = ctx.jsxCallSkipKeyBases?.has(ext.argStart) === true;
    if (isHoist && keyCounterValue !== undefined && inlineSegmentJsxOptions && !usedReservedBase) {
      ctx.jsxKeyCounterValue = keyCounterValue;
      inlineSegmentJsxOptions = {
        ...inlineSegmentJsxOptions,
        keyCounterStart: ctx.jsxKeyCounterValue,
      };
    } else if (keyCounterValue !== undefined && !usedReservedBase) {
      // The JSX key counter is shared across every `.s(body)` block; without
      // threading it, the next body's keys would restart at 0.
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
      // For a bare-identifier body referencing a module-level decl
      // (`useStyle$(STYLES)`), the hoist const-decl wrapper is redundant —
      // emit `q_X.s(STYLES)` and route to `ctx.sCalls` so `placeSCalls`
      // positions it after the referenced decl (declared later otherwise → TDZ).
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
          // Parenthesize so an object-literal body parses as an expression,
          // not a block with labeled statements.
          const stripped = oxcTransformSync('__body__.tsx', `(${hoistBody})`);
          if (stripped.code && !stripped.errors?.length) {
            let code = stripped.code;
            if (code.endsWith(';\n')) code = code.slice(0, -2);
            else if (code.endsWith(';')) code = code.slice(0, -1);
            if (code.startsWith('(') && code.endsWith(')')) code = code.slice(1, -1);
            hoistBody = code;
          }
        } catch {
          // strip failed — keep the un-stripped body
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

  const jsxCallDecls = sharedJsxCallHoister.getDeclarations();
  if (sharedHoister || jsxCallDecls.length > 0) {
    ctx.inlineHoistedDeclarations.length = 0;
    if (sharedHoister) ctx.inlineHoistedDeclarations.push(...sharedHoister.getDeclarations());
    ctx.inlineHoistedDeclarations.push(...jsxCallDecls);
  }
}

/**
 * Marks an export whose init is QRL-wrapped (`component$`/`componentQrl`) — the sCall placement
 * anchor: self-referencing sCalls must follow it to avoid TDZ at module load.
 */
function isMarkerLikeCall(init: AstNode | null | undefined): boolean {
  if (!init || init.type !== 'CallExpression' || init.callee?.type !== 'Identifier') return false;
  const name = init.callee.name;
  return name.endsWith('$') || name.endsWith('Qrl');
}

function findExportedMarkerNames(program: AstProgram): Set<string> {
  const names = new Set<string>();
  for (const stmt of program.body) {
    if (stmt.type !== 'ExportNamedDeclaration' || stmt.declaration?.type !== 'VariableDeclaration')
      continue;
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
    if (stmt.type !== 'ExportNamedDeclaration' || stmt.declaration?.type !== 'VariableDeclaration')
      continue;
    if (isMarkerLikeCall(stmt.declaration.declarations?.[0]?.init)) {
      return { start: stmt.start, end: stmt.end };
    }
  }
  return null;
}

/**
 * Names are JS identifiers whose only regex-significant char is `$`; the raw concatenation must
 * preserve existing behavior on `$`-containing names — don't silently "fix" it.
 */
const wordBoundaryTesterCache = new Map<string, RegExp>();

function wordBoundaryTester(name: string): RegExp {
  let tester = wordBoundaryTesterCache.get(name);
  if (!tester) {
    tester = new RegExp('\\b' + name + '\\b');
    wordBoundaryTesterCache.set(name, tester);
  }
  return tester;
}

function findLastReferencedDeclEnd(
  sCalls: readonly string[],
  decls: readonly ModuleLevelDecl[]
): number | null {
  let maxEnd = -1;
  for (const decl of decls) {
    if (decl.declEnd <= maxEnd) continue;
    const wb = wordBoundaryTester(decl.name);
    if (sCalls.some((sc) => wb.test(sc))) maxEnd = decl.declEnd;
  }
  return maxEnd >= 0 ? maxEnd : null;
}

/**
 * Detects a TDZ-sensitive forward dependency: the latest decl an sCall references that is declared
 * _after_ `threshold` (e.g. `q_useStyle.s(STYLES)` where `const STYLES` follows the marker export).
 * `placeSCalls` uses it to position the sCall after that decl instead of before it. Null when
 * none.
 */
function findForwardReferencedDeclEnd(
  sCall: string,
  decls: readonly ModuleLevelDecl[],
  threshold: number
): number | null {
  let maxEnd = -1;
  for (const decl of decls) {
    if (decl.declStart <= threshold) continue;
    if (decl.declEnd <= maxEnd) continue;
    if (wordBoundaryTester(decl.name).test(sCall)) maxEnd = decl.declEnd;
  }
  return maxEnd >= 0 ? maxEnd : null;
}

function partitionSCallsBySelfRef(
  sCalls: readonly string[],
  exportedNames: ReadonlySet<string>
): { beforeExport: string[]; afterExport: string[] } {
  const beforeExport: string[] = [];
  const afterExport: string[] = [];
  for (const sCall of sCalls) {
    const refsExport = [...exportedNames].some((n) => wordBoundaryTester(n).test(sCall));
    (refsExport ? afterExport : beforeExport).push(sCall);
  }
  return { beforeExport, afterExport };
}

/**
 * Places each sCall at one `MagicString` offset. A per-sCall forward dependency (references a decl
 * declared after the marker anchor) is spliced right after that decl to avoid TDZ; the rest group
 * at the marker anchor — self-referencing sCalls after the export, others before — else after the
 * last referenced decl, else appended at end of file.
 */
function placeSCalls(
  s: MagicString,
  program: AstProgram,
  sCalls: readonly string[],
  moduleLevelDecls: readonly ModuleLevelDecl[] | undefined
): void {
  if (sCalls.length === 0) return;

  const markerAnchor = findLastMarkerExportAnchor(program);
  const decls = moduleLevelDecls ?? [];

  const groupedSCalls: string[] = [];
  for (const sCall of sCalls) {
    const forwardDeclEnd =
      markerAnchor && decls.length > 0
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

  const lastDeclEnd = decls.length > 0 ? findLastReferencedDeclEnd(groupedSCalls, decls) : null;
  if (lastDeclEnd !== null) {
    s.appendRight(lastDeclEnd, '\n' + groupedSCalls.join('\n'));
    return;
  }

  s.append('\n' + groupedSCalls.join('\n'));
}

export function assembleOutput(ctx: RewriteContext): string {
  const {
    s,
    source,
    program,
    neededImports,
    survivingUserImports,
    jsxResult,
    inlineHoistedDeclarations,
    qrlDecls,
    sCalls,
    migrationDecisions,
    moduleLevelDecls,
    jsxOptions,
    transpileTs,
  } = ctx;

  const importStatements = Array.from(neededImports.entries()).map(
    ([symbol, src]) => `import { ${symbol} } from "${src}";`
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

  const autoExported = new Set<string>();
  if (migrationDecisions && !ctx.isLibMode) {
    // `_auto_X` re-exports make module-level decls importable by segment
    // files. Lib mode emits a single module (no segment files), so they're
    // unnecessary and omitted.
    for (const decision of migrationDecisions) {
      if (decision.action === 'reexport') {
        const decl = moduleLevelDecls?.find((d) => d.name === decision.varName);
        if (decl?.isExported) continue;
        autoExported.add(decision.varName);
        s.append(`\nexport { ${decision.varName} as _auto_${decision.varName} };`);
      }
    }
  }

  if (!ctx.isLibMode && moduleLevelDecls) {
    // The router discovers loaders/actions by scanning route-module exports,
    // so un-exported `routeLoader$`/`routeAction$` results must still surface
    // as `_auto_X` exports (rust parity) or their middleware never runs.
    const routerMarkerInit =
      /=\s*(?:routeLoader\$|routeLoaderQrl|routeAction\$|routeActionQrl|globalAction\$|globalActionQrl)\s*\(/;
    const names = moduleLevelDecls
      .filter(
        (decl) =>
          !decl.isExported && !autoExported.has(decl.name) && routerMarkerInit.test(decl.declText)
      )
      .map((decl) => decl.name)
      .sort();
    for (const name of names) {
      s.append(`\nexport { ${name} as _auto_${name} };`);
    }
  }

  if (migrationDecisions && moduleLevelDecls) {
    const removedRanges = new Set<string>();
    for (const decision of migrationDecisions) {
      if (decision.action !== 'move' && decision.action !== 'drop') continue;
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

  if (ctx.isLibMode) {
    finalCode = collapseToLibInlinedQrl(finalCode);
  }

  if (transpileTs) {
    // Only strip explicit type imports: liveness decisions (unused value
    // imports, side-effect downgrades) belong to the pipeline's AST prune.
    const tsStripOptions: TransformOptions = { typescript: { onlyRemoveTypeImports: true } };
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
