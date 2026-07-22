import { createRegExp, exactly, oneOrMore, whitespace, charNotIn } from 'magic-regexp';
import { createTransformSession } from '../edit/transform-session.js';
import { rewriteImportSource } from '../rewrite/rewrite-imports.js';
import { inlineConstCaptures } from '../rewrite/index.js';
import { hasUnderscorePlaceholderParams } from '../rewrite/predicates.js';
import type { ConsolidatedSegment } from '../extraction/extract.js';
import { transformAllJsx, collectScopeAwareBindings, JsxKeyCounter, type DevSuffixOptions } from '../jsx/jsx.js';
import { transformJsxCalls, collectJsxFunctionNames } from '../jsx/jsx-call-transform.js';
import { SignalHoister } from '../jsx/signal-analysis.js';
import { computeKeyPrefix } from '../jsx/key-prefix.js';
import { rewritePropsFieldReferences } from '../rewrite/props-field-rewrite.js';
import { walkAstForQp } from '../jsx/qp-walk.js';
import { foldBodySimplifiableExpressions } from '../jsx/simplify.js';
import type { AstProgram } from '../../ast-types.js';

export {
  rewriteFunctionSignature,
  removeDeadConstLiterals,
  injectCapturesUnpacking,
  insertImportBeforeSeparator,
  partsHaveImport,
} from './body-transforms.js';

import {
  rewriteNestedCallSitesInline,
  applySelfRefIndirection,
  inlineEnumReferences,
  applyRawPropsToSegmentBody,
  stripDiagnosticsAndDirectives,
  transformSyncCalls,
  ensureCoreImports,
  removeDeadConstLiterals,
  rewriteFunctionSignature,
  injectCapturesUnpacking,
  insertImportBeforeSeparator,
  partsHaveImport,
} from './body-transforms.js';
import { recollectPostTransformImports } from './import-collection.js';

const qrlConstName = createRegExp(
  exactly('const').and(oneOrMore(whitespace)).and(exactly('q_').and(oneOrMore(charNotIn(' \t\n\r'))).grouped()),
);

/**
 * Capture/migration payloads for one segment. `skipCaptureInjection` means the
 * body already contains `_captures[i]` references (e.g. an `inlinedQrl`), so the
 * unpacking prologue is not re-injected. `propsFieldCaptures` are names
 * consolidated into `_rawProps` (field local → prop key); `propsFieldDefaults`
 * carries their destructure-time defaults so defaulted fields emit
 * `(_rawProps.<key> ?? <default>)`. `constLiterals` (captured name → literal
 * source) are inlined into the body.
 */
export interface SegmentCaptureInfo {
  captureNames: string[];
  autoImports: Array<{ varName: string; parentModulePath: string }>;
  movedDeclarations: Array<{ text: string; importDeps: Array<{ localName: string; importedName: string; source: string }> }>;
  skipCaptureInjection?: boolean;
  propsFieldCaptures?: Map<string, string>;
  propsFieldDefaults?: Map<string, string>;
  constLiterals?: Map<string, string>;
}

export interface SegmentImportData {
  moduleImports: Array<{ localName: string; importedName: string; source: string; importAttributes?: Record<string, string> }>;
  sameFileSymbols: Set<string>;
  defaultExportedNames?: Set<string>;
  renamedExports?: Map<string, string>;
  parentModulePath: string;
  migrationDecisions: Array<{ varName: string; action: string; isExported?: boolean }>;
}

/**
 * `source` (the original module string) and `bodyOriginOffset` (the body's byte
 * offset, `ext.loc[0]`) together yield source-relative dev-info positions:
 * default-strategy segments wrap the body as `(${bodyText})` before parsing, so
 * without them dev-info `lineNumber:` lands body-relative. Both are honored only
 * when `devOptions` is set.
 */
export interface SegmentJsxOptions {
  enableJsx: boolean;
  importedNames: Set<string>;
  paramNames?: Set<string>;
  relPath?: string;
  keyCounterStart?: number;
  devOptions?: DevSuffixOptions;
  source?: string;
  bodyOriginOffset?: number;
}

export interface NestedCallSiteInfo {
  qrlVarName: string;
  callStart: number;
  callEnd: number;
  isJsxAttr: boolean;
  attrStart?: number;
  attrEnd?: number;
  transformedPropName?: string;
  hoistedSymbolName?: string;
  hoistedCaptureNames?: string[];
  loopLocalParamNames?: string[];
  elementQpParams?: string[];
  qrlCallee?: string;
  captureNames?: string[];
  explicitCaptureItems?: string[];
  importSource?: string;
}

interface SegmentImportSpec {
  localName: string;
  importedName: string;
}

function replacePropsFieldReferences(
  bodyText: string,
  fieldMap: Map<string, string>,
  defaultValues?: ReadonlyMap<string, string>,
): string {
  return rewritePropsFieldReferences(bodyText, fieldMap, {
    memberPropertyMode: 'all',
    defaultValues,
  });
}

function buildSegmentImports(
  extraction: ConsolidatedSegment,
  capturedNames: Set<string>,
  importContext: SegmentImportData | undefined,
): { parts: string[]; importsBySource: Map<string, SegmentImportSpec[]> } {
  const parts: string[] = [];
  const importsBySource = new Map<string, SegmentImportSpec[]>();

  for (const imp of extraction.segmentImports) {
    if (capturedNames.has(imp.localName)) continue;

    const rewrittenSource = rewriteImportSource(imp.source);
    const existing = importsBySource.get(rewrittenSource);
    const spec: SegmentImportSpec = { localName: imp.localName, importedName: imp.importedName };
    if (existing) {
      if (!existing.some((s) => s.localName === imp.localName)) existing.push(spec);
    } else {
      importsBySource.set(rewrittenSource, [spec]);
    }
  }

  for (const [source, specs] of importsBySource) {
    const defaultSpec = specs.find((s) => s.importedName === 'default');
    const nsSpec = specs.find((s) => s.importedName === '*');
    const namedSpecs = specs.filter((s) => s.importedName !== 'default' && s.importedName !== '*');

    let importAttrsSuffix = '';
    if (importContext) {
      const anySpec = specs[0];
      const moduleImp = importContext.moduleImports.find(m => m.localName === anySpec.localName);
      if (moduleImp?.importAttributes) {
        const attrs = Object.entries(moduleImp.importAttributes)
          .map(([k, v]) => `${k}: "${v}"`)
          .join(', ');
        importAttrsSuffix = ` with {\n    ${attrs}\n}`;
      }
    }

    let importStmt = '';
    if (nsSpec) {
      importStmt = `import * as ${nsSpec.localName} from "${source}"${importAttrsSuffix};`;
    } else if (namedSpecs.length > 0) {
      const namedStr = namedSpecs
        .map((s) => s.importedName !== s.localName ? `${s.importedName} as ${s.localName}` : s.localName)
        .join(', ');
      if (defaultSpec) {
        importStmt = `import ${defaultSpec.localName}, { ${namedStr} } from "${source}"${importAttrsSuffix};`;
      } else {
        importStmt = `import { ${namedStr} } from "${source}"${importAttrsSuffix};`;
      }
    } else if (defaultSpec) {
      importStmt = `import ${defaultSpec.localName} from "${source}"${importAttrsSuffix};`;
    }
    if (importStmt) parts.push(importStmt);
  }

  return { parts, importsBySource };
}

function addCaptureAndMigrationImports(
  parts: string[],
  captureInfo: SegmentCaptureInfo | undefined,
): void {
  if (captureInfo && captureInfo.captureNames.length > 0 && !captureInfo.skipCaptureInjection) {
    const qwikCoreImportIdx = parts.findIndex((p) => p.includes('"@qwik.dev/core"'));
    if (qwikCoreImportIdx >= 0) {
      const existing = parts[qwikCoreImportIdx];
      const braceStart = existing.indexOf('{');
      if (braceStart >= 0) {
        parts[qwikCoreImportIdx] = existing.slice(0, braceStart + 2) + '_captures, ' + existing.slice(braceStart + 2);
      } else if (existing.includes('* as')) {
        parts.push(`import { _captures } from "@qwik.dev/core";`);
      } else {
        parts[qwikCoreImportIdx] = existing.replace(' from', ', { _captures } from');
      }
    } else {
      parts.push(`import { _captures } from "@qwik.dev/core";`);
    }
  }

  if (captureInfo && captureInfo.autoImports.length > 0) {
    for (const autoImp of captureInfo.autoImports) {
      parts.push(`import { _auto_${autoImp.varName} as ${autoImp.varName} } from "${autoImp.parentModulePath}";`);
    }
  }

  if (parts.length > 0) parts.push('//');

  if (captureInfo && captureInfo.movedDeclarations.length > 0) {
    for (const moved of captureInfo.movedDeclarations) {
      for (const dep of moved.importDeps) {
        const rewrittenSource = rewriteImportSource(dep.source);
        let importLine: string;
        if (dep.importedName === '*') {
          importLine = `import * as ${dep.localName} from "${rewrittenSource}";`;
        } else if (dep.importedName === dep.localName) {
          importLine = `import { ${dep.localName} } from "${rewrittenSource}";`;
        } else {
          importLine = `import { ${dep.importedName} as ${dep.localName} } from "${rewrittenSource}";`;
        }
        if (!parts.some(p => p.includes(`${dep.localName}`) && p.includes(`"${rewrittenSource}"`))) {
          insertImportBeforeSeparator(parts, importLine);
        }
      }
    }
    for (const moved of captureInfo.movedDeclarations) {
      parts.push(moved.text);
    }
  }
}

function addNestedQrlDeclarations(parts: string[], nestedQrlDecls: string[] | undefined): void {
  if (!nestedQrlDecls || nestedQrlDecls.length === 0) return;

  const neededSymbols: string[] = [];
  if (nestedQrlDecls.some(d => d.includes('qrlDEV(') && !d.includes('_noopQrlDEV('))) neededSymbols.push('qrlDEV');
  if (nestedQrlDecls.some(d => d.includes('qrl(') && !d.includes('_noopQrl(') && !d.includes('qrlDEV('))) neededSymbols.push('qrl');
  if (nestedQrlDecls.some(d => d.includes('_noopQrlDEV('))) neededSymbols.push('_noopQrlDEV');
  if (nestedQrlDecls.some(d => d.includes('_noopQrl(') && !d.includes('_noopQrlDEV('))) neededSymbols.push('_noopQrl');

  for (const sym of neededSymbols) {
    if (!partsHaveImport(parts, sym)) {
      const sepIdx = parts.indexOf('//');
      if (sepIdx >= 0) {
        parts.splice(sepIdx, 0, `import { ${sym} } from "@qwik.dev/core";`);
      } else {
        parts.push(`import { ${sym} } from "@qwik.dev/core";`);
        parts.push('//');
      }
    }
  }

  const sortedDecls = [...nestedQrlDecls].sort((a, b) => {
    const nameA = a.match(qrlConstName)?.[1] ?? a;
    const nameB = b.match(qrlConstName)?.[1] ?? b;
    return nameA.localeCompare(nameB);
  });
  for (const decl of sortedDecls) parts.push(decl);
  parts.push('//');
}

/**
 * Rewrites peer-tool `jsx(Tag, propsObj, ...)` calls (e.g. from `qwik-react`
 * codegen) into `_jsxSorted(...)` form — complementary to `transformSegmentJsx`
 * (which handles `<JSX/>` syntax), because peer tools pre-process JSX to `jsx()`
 * calls that the syntax-based pass skips.
 */
function transformSegmentJsxCalls(
  bodyText: string,
  parts: string[],
  relPath: string,
  importContext: SegmentImportData,
  keyCounterStartOverride: number | undefined,
  qpByQrl?: ReadonlyMap<string, readonly string[]>,
  paramNames?: readonly string[],
): { bodyText: string; keyCounterValue?: number } {
  // Cheap fast-path: only parse if the body even mentions a candidate
  // jsx-function name. Most segments don't.
  const jsxFunctions = collectJsxFunctionNames(importContext);
  if (jsxFunctions.size === 0) return { bodyText };

  let anyMatch = false;
  for (const name of jsxFunctions) {
    if (bodyText.includes(name + '(')) {
      anyMatch = true;
      break;
    }
  }
  if (!anyMatch) return { bodyText };

  try {
    const session = createTransformSession(bodyText, { tolerateErrors: true });
    if (!session) return { bodyText };

    const prefix = relPath ? computeKeyPrefix(relPath) : 'u6';
    const startAt = keyCounterStartOverride ?? 0;
    const keyCounter = new JsxKeyCounter(startAt, prefix);

    const neededImports = new Set<string>();
    const importedNames = new Set(importContext.moduleImports.map(m => m.localName));
    const signalHoister = new SignalHoister();
    transformJsxCalls(session.wrappedSource, session.edits, session.program, {
      jsxFunctions,
      keyCounter,
      neededImports,
      qpByQrl,
      importedNames,
      signalHoister,
      paramNames,
    });

    const newBodyText = session.toSource();

    if (newBodyText === bodyText) return { bodyText };

    for (const sym of neededImports) {
      if (!parts.some(p => p.includes(`{ ${sym} }`) || p.includes(`, ${sym}`))) {
        const sepIdx = parts.indexOf('//');
        if (sepIdx >= 0) {
          parts.splice(sepIdx, 0, `import { ${sym} } from "@qwik.dev/core";`);
        } else {
          parts.push(`import { ${sym} } from "@qwik.dev/core";`);
        }
      }
    }

    for (const decl of signalHoister.getDeclarations()) parts.push(decl);

    return { bodyText: newBodyText, keyCounterValue: keyCounter.current() };
  } catch {
    return { bodyText };
  }
}

function transformSegmentJsx(
  bodyText: string,
  parts: string[],
  jsxOptions: SegmentJsxOptions,
  nestedCallSites: NestedCallSiteInfo[] | undefined,
  captureInfo: SegmentCaptureInfo | undefined,
): { bodyText: string; keyCounterValue?: number } {
  if (!(/(?:<[A-Z_a-z\/]|JSX)/.test(bodyText))) return { bodyText };

  try {
    const session = createTransformSession(bodyText, { tolerateErrors: true });
    if (!session) return { bodyText };

    const qrlsWithCaptures = buildQrlsWithCapturesSet(nestedCallSites);
    const qpOverrides = buildQpOverrides(nestedCallSites, session.program);

    const segScopeBindings = collectScopeAwareBindings(session.program);
    if (captureInfo?.captureNames) {
      // Capture names are injected by `_captures[i]` unpacking at segment
      // body entry; they're runtime-const but have no AST declaration in
      // this body. Inject as program-scope consts so any reference in the
      // segment classifies as const (unless shadowed by an inner binding).
      for (const name of captureInfo.captureNames) segScopeBindings.bindings.addProgramScopeConst(name);
    }

    // The session wrapper adds a prefix; without `sourcePosition`
    // dev-info `lineNumber:` would be body-relative. Source-relative
    // requires the original module source + body's byte offset.
    let devOptionsForCall = jsxOptions.devOptions;
    if (
      devOptionsForCall &&
      jsxOptions.source != null &&
      jsxOptions.bodyOriginOffset != null
    ) {
      devOptionsForCall = {
        ...devOptionsForCall,
        sourcePosition: {
          source: jsxOptions.source,
          bodyOriginOffset: jsxOptions.bodyOriginOffset,
          wrapperPrefixLen: session.offset,
        },
      };
    }

    const jsxResult = transformAllJsx(
      { source: session.wrappedSource, s: session.edits, program: session.program, importedNames: jsxOptions.importedNames },
      {
        devOptions: devOptionsForCall,
        keyCounterStart: jsxOptions.keyCounterStart,
        qpOverrides,
        qrlsWithCaptures,
        paramNames: jsxOptions.paramNames,
        relPath: jsxOptions.relPath,
        precomputedScopeBindings: segScopeBindings,
      },
    );

    bodyText = session.toSource();

    for (const sym of jsxResult.neededImports) {
      if (!parts.some(p => p.includes(`{ ${sym} }`) || p.includes(`, ${sym}`))) {
        parts.splice(parts.indexOf('//'), 0, `import { ${sym} } from "@qwik.dev/core";`);
      }
    }
    if (jsxResult.needsFragment && !parts.some(p => p.includes('_Fragment'))) {
      parts.splice(parts.indexOf('//'), 0, `import { Fragment as _Fragment } from "@qwik.dev/core/jsx-runtime";`);
    }
    if (jsxResult.hoistedDeclarations) {
      for (const decl of jsxResult.hoistedDeclarations) parts.push(decl);
    }

    return { bodyText, keyCounterValue: jsxResult.keyCounterValue };
  } catch {
    return { bodyText };
  }
}

function buildQrlsWithCapturesSet(nestedCallSites: NestedCallSiteInfo[] | undefined): Set<string> | undefined {
  if (!nestedCallSites) return undefined;
  const result = new Set<string>();
  for (const site of nestedCallSites) {
    // Either form of cross-loop wiring contributes a "captures" qrl: the
    // explicit loop-local param case (`_, _1, iterVar`) and the
    // cross-scope-capture case (`hoistedSymbolName` set, no loop-local
    // padding). Both flow data per iteration; classifying the event
    // handler entry as var rather than const is correct for both.
    const hasLoopLocal =
      site.loopLocalParamNames && site.loopLocalParamNames.length > 0;
    const hasHoistedCaptures = !!site.hoistedSymbolName;
    if (hasLoopLocal || hasHoistedCaptures) {
      result.add(site.qrlVarName);
      if (site.hoistedSymbolName) result.add(site.hoistedSymbolName);
    }
  }
  return result.size > 0 ? result : undefined;
}

function buildQpOverrides(
  nestedCallSites: NestedCallSiteInfo[] | undefined,
  program: AstProgram,
): Map<number, string[]> | undefined {
  // Also fire when any nestedCallSite carries `elementQpParams` from
  // `buildElementCaptureMap` (covers the stripped-event-with-captures
  // case where there's no `loopLocalParamNames`, since stripped handlers
  // aren't required to be in a loop).
  if (
    !nestedCallSites ||
    !nestedCallSites.some(
      s =>
        (s.loopLocalParamNames && s.loopLocalParamNames.length > 0) ||
        (s.elementQpParams && s.elementQpParams.length > 0),
    )
  ) {
    return undefined;
  }

  const qpOverrides = new Map<number, string[]>();
  const qrlParamMap = new Map<string, string[]>();
  for (const site of nestedCallSites) {
    if (!site.loopLocalParamNames || site.loopLocalParamNames.length === 0) continue;
    qrlParamMap.set(site.qrlVarName, site.loopLocalParamNames);
    if (site.hoistedSymbolName) qrlParamMap.set(site.hoistedSymbolName, site.loopLocalParamNames);
  }

  // Per-attr site lookup (not a pre-merged map) so a site that matches by
  // name but carries no `elementQpParams` still falls back to the
  // loop-local params keyed under the same name.
  const resolveParams = (qrlName: string): readonly string[] | undefined => {
    const site = nestedCallSites.find(s => s.qrlVarName === qrlName || s.hoistedSymbolName === qrlName);
    return site?.elementQpParams ?? qrlParamMap.get(qrlName);
  };

  walkAstForQp(program, resolveParams, qpOverrides);
  return qpOverrides.size > 0 ? qpOverrides : undefined;
}

function normalizeSeparators(parts: string[]): void {
  const allParts = parts.filter(p => p !== '//');
  const imports: string[] = [];
  const hoisted: string[] = [];
  const qrlDecls: string[] = [];
  const other: string[] = [];

  for (const p of allParts) {
    if (p.startsWith('import ')) imports.push(p);
    else if (p.trimStart().startsWith('const _hf')) hoisted.push(p);
    else if (p.trimStart().startsWith('const q_')) qrlDecls.push(p);
    else other.push(p);
  }

  parts.length = 0;
  if (imports.length > 0) parts.push(...imports, '//');
  if (hoisted.length > 0) {
    parts.push(...hoisted);
    if (qrlDecls.length > 0) parts.push('//');
  }
  if (qrlDecls.length > 0) parts.push(...qrlDecls, '//');
  parts.push(...other);
}

function collectInitialImports(
  extraction: ConsolidatedSegment,
  capturedNames: Set<string>,
  captureInfo: SegmentCaptureInfo | undefined,
  nestedQrlDecls: string[] | undefined,
  importContext: SegmentImportData | undefined,
): { parts: string[]; importsBySource: Map<string, SegmentImportSpec[]> } {
  const { parts, importsBySource } = buildSegmentImports(extraction, capturedNames, importContext);
  addCaptureAndMigrationImports(parts, captureInfo);
  addNestedQrlDeclarations(parts, nestedQrlDecls);
  return { parts, importsBySource };
}

/**
 * Returns the updated `captureInfo` because const-literal inlining filters
 * inlined names out of `captureNames`; downstream phases (JSX, captures
 * unpacking) need that filtered view.
 */
function applyBodyTransforms(
  extraction: ConsolidatedSegment,
  parts: string[],
  captureInfo: SegmentCaptureInfo | undefined,
  nestedCallSites: NestedCallSiteInfo[] | undefined,
  enumValueMap: Map<string, Map<string, string>> | undefined,
): { bodyText: string; captureInfo: SegmentCaptureInfo | undefined } {
  // Internal helpers work on plain string; the BodyText brand applies only at
  // the ExtractionResult boundary.
  let bodyText: string = extraction.bodyText;

  if (nestedCallSites && nestedCallSites.length > 0) {
    bodyText = rewriteNestedCallSitesInline(bodyText, nestedCallSites, extraction.argStart);
    bodyText = applySelfRefIndirection(bodyText);
  }

  if (enumValueMap && enumValueMap.size > 0) {
    bodyText = inlineEnumReferences(bodyText, enumValueMap);
  }

  // `inlinedQrl` bodies are pre-compiled library code: their first arg is a
  // finished closure whose destructured first param (e.g. a `useTask$`'s
  // `({ track })` context) is NOT component props and must not be normalised to
  // `_rawProps`. Doing so renamed the param while the body still referenced the
  // original binding and dropped the closing brace, producing an unbalanced,
  // unparseable segment.
  if (!extraction.isInlinedQrl) {
    bodyText = applyRawPropsToSegmentBody(bodyText, parts);
  }
  bodyText = stripDiagnosticsAndDirectives(bodyText);

  const propsFieldCaptures = captureInfo?.propsFieldCaptures;
  if (propsFieldCaptures && propsFieldCaptures.size > 0) {
    // Pass `propsFieldDefaults` so defaulted fields emit
    // `(_rawProps.<key> ?? <default>)`.
    bodyText = replacePropsFieldReferences(
      bodyText,
      propsFieldCaptures,
      captureInfo?.propsFieldDefaults,
    );
  }

  let liveCaptureInfo = captureInfo;
  const constLiterals = captureInfo?.constLiterals;
  if (constLiterals && constLiterals.size > 0 && captureInfo) {
    bodyText = inlineConstCaptures(bodyText, constLiterals);
    liveCaptureInfo = {
      ...captureInfo,
      captureNames: captureInfo.captureNames.filter(n => !constLiterals.has(n)),
    };
  }

  if (
    liveCaptureInfo &&
    liveCaptureInfo.captureNames.length > 0 &&
    !liveCaptureInfo.skipCaptureInjection
  ) {
    bodyText = injectCapturesUnpacking(bodyText, liveCaptureInfo.captureNames);
  }

  return { bodyText, captureInfo: liveCaptureInfo };
}

export function generateSegmentCode(
  extraction: ConsolidatedSegment,
  nestedQrlDecls?: string[],
  captureInfo?: SegmentCaptureInfo,
  jsxOptions?: SegmentJsxOptions,
  nestedCallSites?: NestedCallSiteInfo[],
  importContext?: SegmentImportData,
  enumValueMap?: Map<string, Map<string, string>>,
): { code: string; keyCounterValue?: number } {
  const capturedNames = new Set<string>(captureInfo ? captureInfo.captureNames : []);

  const { parts, importsBySource } = collectInitialImports(
    extraction, capturedNames, captureInfo, nestedQrlDecls, importContext,
  );

  let { bodyText, captureInfo: liveCaptureInfo } = applyBodyTransforms(
    extraction, parts, captureInfo, nestedCallSites, enumValueMap,
  );

  let segmentKeyCounterValue: number | undefined;
  if (jsxOptions?.enableJsx) {
    const jsxResult = transformSegmentJsx(bodyText, parts, jsxOptions, nestedCallSites, liveCaptureInfo);
    bodyText = jsxResult.bodyText;
    segmentKeyCounterValue = jsxResult.keyCounterValue;
  }

  // Peer-tool JSX-call rewriting: `qwik-react` and similar peer codegen emit
  // `jsx(Tag, propsObj)` calls (pre-processed from JSX syntax) that Phase 5's
  // syntax transform skips, and Phase 5 may be skipped entirely when the source
  // isn't .tsx/.jsx (qwik-react ships as .mjs). Rewrite them to `_jsxSorted(...)`
  // here. Runs unconditionally — the fast-path in `transformSegmentJsxCalls`
  // skips when no jsx imports are present.
  if (importContext) {
    // Map each event-handler QRL var (`q_<sym>`) to its `q:p`/`q:ps` capture
    // params, so the peer-tool JSX-call rewriter can inject the prop onto the
    // owning element. Built from the nested call sites' `elementQpParams`.
    const qpByQrl = new Map<string, string[]>();
    for (const site of nestedCallSites ?? []) {
      if (site.elementQpParams && site.elementQpParams.length > 0) {
        qpByQrl.set(site.qrlVarName, site.elementQpParams);
      }
    }
    const jsxCallResult = transformSegmentJsxCalls(
      bodyText, parts, extraction.origin, importContext, segmentKeyCounterValue,
      qpByQrl.size > 0 ? qpByQrl : undefined,
      extraction.paramNames,
    );
    bodyText = jsxCallResult.bodyText;
    if (jsxCallResult.keyCounterValue !== undefined) {
      segmentKeyCounterValue = jsxCallResult.keyCounterValue;
    }
  }

  // Fold constant-foldable subtrees that survived earlier passes (typically
  // `?? <default>` RHS injected by raw-props in non-JSX positions). Runs AFTER
  // Phase 5/5b so `_hf<n>_str` is generated source-preserving and JSX-prop
  // positions are now `_fnSignal(...)` calls with no `?? <default>` left to fold.
  bodyText = foldBodySimplifiableExpressions(bodyText);

  // Include moved-decl text (already in `parts`) when scanning for core
  // helpers — a moved helper function with rewritten JSX may reference
  // `_jsxSplit` / `_getVarProps` / `_getConstProps` etc. that the segment's
  // main body doesn't. The `//` separator may not yet be present when
  // `ensureCoreImports` runs (added later by `normalizeSeparators`), so include
  // a separator before calling so the early-return path doesn't bail out.
  const scanText = bodyText + '\n' + parts
    .filter(p => !p.startsWith('import') && p !== '//')
    .join('\n');
  if (parts.indexOf('//') < 0) parts.push('//');
  ensureCoreImports(scanText, parts);
  bodyText = transformSyncCalls(bodyText, parts);

  normalizeSeparators(parts);

  if (hasUnderscorePlaceholderParams(extraction.paramNames)) {
    bodyText = rewriteFunctionSignature(bodyText, extraction.paramNames);
  }

  if (importContext) {
    recollectPostTransformImports(bodyText, parts, importContext, importsBySource, capturedNames, nestedCallSites);
  }
  normalizeSeparators(parts);

  if (nestedCallSites && nestedCallSites.length > 0) {
    bodyText = removeDeadConstLiterals(bodyText);
  }

  parts.push(`export const ${extraction.symbolName} = ${bodyText};`);
  return { code: parts.join('\n'), keyCounterValue: segmentKeyCounterValue };
}
