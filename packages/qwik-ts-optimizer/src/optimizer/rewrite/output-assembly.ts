/**
 * Output assembly phases for parent module rewriting.
 *
 * Contains QRL declaration building, needed import collection,
 * unused import filtering, inline .s() call generation, and
 * final output assembly with TS type stripping.
 */

import { transformSync as oxcTransformSync } from 'oxc-transform';
import { createRegExp, exactly, wordBoundary } from 'magic-regexp';
import type { ExtractionResult } from '../extract.js';
import type { ImportInfo } from '../marker-detection.js';
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
import { isStrippedSegment } from '../strip-ctx.js';
import { rewriteFunctionSignature } from '../segment-codegen.js';
import { SignalHoister } from '../signal-analysis.js';
import { isRelativePathInsideBase } from '../path-utils.js';
import { transformSCallBody } from './inline-body.js';
import type { SCallBodyJsxOptions } from './raw-props.js';
import type { RewriteContext } from './rewrite-context.js';

function matchesRegCtxName(ext: ExtractionResult, regCtxName?: string[]): boolean {
  if (!regCtxName || regCtxName.length === 0) return false;
  for (const name of regCtxName) {
    if (ext.calleeName === name + '$') return true;
  }
  return false;
}

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
    s, program, neededImports, alreadyImported, qrlVarNames, inlinedQrlSymbols, mode, transpileTs } = ctx;
  const allNonSync = extractions.filter((e) => !e.isSync && !inlinedQrlSymbols.has(e.symbolName));

  const isHoist = inlineOptions?.entryType === 'hoist' ||
    (inlineOptions?.entryType === 'inline' && !!transpileTs && !!jsxOptions?.enableJsx && mode !== 'dev');

  let sCallJsxOptions: SCallBodyJsxOptions | undefined = jsxOptions?.enableJsx
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
    const { transformedBody: rawBody, additionalImports, hoistedDeclarations, keyCounterValue } = transformSCallBody(
      ext, extractions, qrlVarNames, sCallJsxOptions, inlineOptions?.regCtxName, sharedHoister,
    );

    let sigRewrittenBody = rawBody;
    if (ext.paramNames.length >= 2 &&
        ext.paramNames[0] === '_' && ext.paramNames[1] === '_1') {
      sigRewrittenBody = rewriteFunctionSignature(rawBody, ext.paramNames);
    }

    const isRegCtxMatch = matchesRegCtxName(ext, inlineOptions?.regCtxName);
    let transformedBody = sigRewrittenBody;
    if (isRegCtxMatch) {
      transformedBody = `/*#__PURE__*/ _regSymbol(${rawBody}, "${ext.hash}")`;
      neededImports.set('_regSymbol', '@qwik.dev/core');
    }

    if (isHoist && keyCounterValue !== undefined && sCallJsxOptions) {
      ctx.jsxKeyCounterValue = keyCounterValue;
      sCallJsxOptions = { ...sCallJsxOptions, keyCounterStart: ctx.jsxKeyCounterValue };
    }
    ctx.inlineHoistedDeclarations.push(...hoistedDeclarations);
    for (const [sym, src] of additionalImports) {
      if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
        neededImports.set(sym, src);
      }
    }

    const forceInlineForRegCtx = isRegCtxMatch && inlineOptions?.entryType === 'inline';
    if (isHoist && !forceInlineForRegCtx) {
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

export function assembleOutput(ctx: RewriteContext): string {
  const { s, source, neededImports, survivingUserImports, jsxResult,
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

  if (migrationDecisions) {
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

  let finalCode = s.toString();
  if (sCalls.length > 0) {
    const lines = finalCode.split('\n');
    let insertIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trimStart();
      if (trimmed.startsWith('export default ') || trimmed.startsWith('export const ') || trimmed.startsWith('export {')) {
        if (trimmed.includes('Qrl(') || trimmed.includes('export default ')) {
          insertIdx = i;
          break;
        }
      }
    }
    if (insertIdx >= 0) {
      lines.splice(insertIdx, 0, ...sCalls);
    } else {
      lines.push(...sCalls);
    }
    finalCode = lines.join('\n');
  }

  if (transpileTs) {
    const tsStripOptions: Record<string, any> = { typescript: { onlyRemoveTypeImports: false } };
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
