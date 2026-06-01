/**
 * Segment module code generation.
 *
 * Generates the source code for extracted segment modules. Each segment
 * module contains only the imports it references plus the exported segment body.
 */

import { createRegExp, exactly, oneOrMore, whitespace, charNotIn } from 'magic-regexp';
import MagicString from 'magic-string';
import { forEachAstChild, isAstNode } from './utils/ast.js';
import { parseWithRawTransfer } from './utils/parse.js';
import { rewriteImportSource } from './rewrite-imports.js';
import { inlineConstCaptures } from './rewrite/index.js';
import { hasUnderscorePlaceholderParams } from './rewrite/predicates.js';
import type { ConsolidatedSegment } from './extract.js';
import { transformAllJsx, collectScopeAwareBindings, JsxKeyCounter, type DevSuffixOptions } from './transform/jsx.js';
import { transformJsxCalls, collectJsxFunctionNames } from './transform/jsx-call-transform.js';
import { computeKeyPrefix } from './key-prefix.js';
import { rewritePropsFieldReferences } from './utils/props-field-rewrite.js';
import { foldBodySimplifiableExpressions } from './utils/simplify.js';
import type { AstMaybeNode, AstNode, AstProgram } from '../ast-types.js';

// Re-export from body-transforms for backward compatibility
export {
  rewriteFunctionSignature,
  removeDeadConstLiterals,
  injectCapturesUnpacking,
  insertImportBeforeSeparator,
  partsHaveImport,
} from './segment-codegen/body-transforms.js';

// Import helpers from split modules
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
} from './segment-codegen/body-transforms.js';
import { recollectPostTransformImports } from './segment-codegen/import-collection.js';

const qrlConstName = createRegExp(
  exactly('const').and(oneOrMore(whitespace)).and(exactly('q_').and(oneOrMore(charNotIn(' \t\n\r'))).grouped()),
);

export interface SegmentCaptureInfo {
  /** Variables received via _captures (scope-level captures). */
  captureNames: string[];
  /** _auto_VARNAME imports from parent module (module-level migration). */
  autoImports: Array<{ varName: string; parentModulePath: string }>;
  /** Declarations physically moved into the segment, with their import dependencies. */
  movedDeclarations: Array<{ text: string; importDeps: Array<{ localName: string; importedName: string; source: string }> }>;
  /** If true, skip _captures unpacking injection (body already has _captures refs, e.g. inlinedQrl). */
  skipCaptureInjection?: boolean;
  /**
   * Map from original prop field local name to prop key name.
   * When set, these captures have been consolidated into _rawProps.
   */
  propsFieldCaptures?: Map<string, string>;
  /**
   * OSS-409 bug 2: map from prop-field local name to destructure-time
   * default expression source text. When set alongside {@link propsFieldCaptures},
   * defaulted fields emit `(_rawProps.<key> ?? <default>)`.
   */
  propsFieldDefaults?: Map<string, string>;
  /**
   * Map from captured variable name to its literal source text.
   * When set, these const literal captures are inlined into the segment body.
   */
  constLiterals?: Map<string, string>;
}

/**
 * Additional import context from transform.ts for post-transform import re-collection.
 */
export interface SegmentImportData {
  moduleImports: Array<{ localName: string; importedName: string; source: string; importAttributes?: Record<string, string> }>;
  sameFileSymbols: Set<string>;
  defaultExportedNames?: Set<string>;
  /** Map from local variable name to its exported name when they differ */
  renamedExports?: Map<string, string>;
  parentModulePath: string;
  migrationDecisions: Array<{ varName: string; action: string; isExported?: boolean }>;
}

export interface SegmentJsxOptions {
  enableJsx: boolean;
  importedNames: Set<string>;
  paramNames?: Set<string>;
  relPath?: string;
  keyCounterStart?: number;
  devOptions?: DevSuffixOptions;
  /**
   * OSS-410: original module source string. Used together with
   * {@link bodyOriginOffset} to compute source-relative dev-info positions
   * (default-strategy segments wrap the body as `(${bodyText})` before
   * parsing; without this, dev-info `lineNumber:` lands body-relative).
   * Only honored when `devOptions` is set.
   */
  source?: string;
  /**
   * OSS-410: byte offset of the extraction's body in the original source
   * (`ext.loc[0]`). Used together with {@link source}.
   */
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
  importSource?: string;
}

interface SegmentImportSpec {
  localName: string;
  importedName: string;
}

// ── Props field reference replacement ──

function replacePropsFieldReferences(
  bodyText: string,
  fieldMap: Map<string, string>,
  defaultValues?: ReadonlyMap<string, string>,
): string {
  return rewritePropsFieldReferences(bodyText, fieldMap, {
    parseFilename: '__rpf__.tsx',
    wrapperPrefix: '(',
    wrapperSuffix: ')',
    memberPropertyMode: 'all',
    defaultValues,
  });
}

// ── Phase helpers for generateSegmentCode ──

/**
 * Phase 1: Build import statements from extraction.segmentImports,
 * grouping by source and filtering out captured names.
 */
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

/**
 * Phase 2: Merge _captures into @qwik.dev/core import or add a new one,
 * plus _auto_ imports and moved-declaration imports.
 */
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

/** Phase 3: Add nested QRL declarations and their required imports. */
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

// ── JSX transformation ──

/**
 * Phase 5b helper: rewrite peer-tool `jsx(Tag, propsObj, ...)` calls (e.g.
 * from `qwik-react` codegen) into `_jsxSorted(...)` form. Sits alongside
 * `transformSegmentJsx` (which handles `<JSX/>` syntax) — the two are
 * complementary because peer tools pre-process JSX to `jsx()` calls before
 * the optimizer sees the source, and the syntax-based pass skips them.
 *
 * Returns the rewritten body and (if any rewrites happened) the updated
 * key-counter value to thread back into `segmentKeyCounterValue`.
 */
function transformSegmentJsxCalls(
  bodyText: string,
  parts: string[],
  relPath: string,
  importContext: SegmentImportData,
  keyCounterStartOverride: number | undefined,
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
    const wrappedBody = `(${bodyText})`;
    const bodyParse = parseWithRawTransfer('segment.tsx', wrappedBody);
    const bodyS = new MagicString(wrappedBody);

    const prefix = relPath ? computeKeyPrefix(relPath) : 'u6';
    const startAt = keyCounterStartOverride ?? 0;
    const keyCounter = new JsxKeyCounter(startAt, prefix);

    const neededImports = new Set<string>();
    transformJsxCalls(wrappedBody, bodyS, bodyParse.program, {
      jsxFunctions,
      keyCounter,
      neededImports,
    });

    const transformedWrapped = bodyS.toString();
    const newBodyText = transformedWrapped.slice(1, -1);

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
    const wrappedBody = `(${bodyText})`;
    const bodyParse = parseWithRawTransfer('segment.tsx', wrappedBody);
    const bodyS = new MagicString(wrappedBody);

    const qrlsWithCaptures = buildQrlsWithCapturesSet(nestedCallSites);
    const qpOverrides = buildQpOverrides(nestedCallSites, bodyParse.program);

    const segScopeBindings = collectScopeAwareBindings(bodyParse.program);
    if (captureInfo?.captureNames) {
      // Capture names are injected by `_captures[i]` unpacking at segment
      // body entry; they're runtime-const but have no AST declaration in
      // this body. Inject as program-scope consts so any reference in the
      // segment classifies as const (unless shadowed by an inner binding).
      for (const name of captureInfo.captureNames) segScopeBindings.bindings.addProgramScopeConst(name);
    }

    // OSS-410: `wrappedBody` adds a single `(` prefix; without sourcePosition
    // dev-info `lineNumber:` would be body-relative. Source-relative requires
    // the original module source + body's byte offset.
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
          wrapperPrefixLen: 1,
        },
      };
    }

    const jsxResult = transformAllJsx(
      { source: wrappedBody, s: bodyS, program: bodyParse.program, importedNames: jsxOptions.importedNames },
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

    const transformedWrapped = bodyS.toString();
    bodyText = transformedWrapped.slice(1, -1);

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
  // OSS-438 Fix B: also fire when any nestedCallSite carries
  // `elementQpParams` from `buildElementCaptureMap` (covers the
  // stripped-event-with-captures case where there's no
  // `loopLocalParamNames`, since stripped handlers aren't required to be
  // in a loop — `example_strip_client_code`).
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

  function walkAst(node: AstMaybeNode): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement' && node.openingElement) {
      const attrs = node.openingElement.attributes || [];
      const elementParams: string[] = [];
      const seen = new Set<string>();
      for (const attr of attrs) {
        if (attr.type !== 'JSXAttribute') continue;

        let attrName: string | null = null;
        if (attr.name?.type === 'JSXIdentifier') {
          attrName = attr.name.name;
        } else if (attr.name?.type === 'JSXNamespacedName') {
          attrName = `${attr.name.namespace?.name}:${attr.name.name?.name}`;
        }
        const isEventAttr = attrName && (
          attrName.endsWith('$') ||
          attrName.startsWith('q-e:') || attrName.startsWith('q-ep:') ||
          attrName.startsWith('q-dp:') || attrName.startsWith('q-wp:') ||
          attrName.startsWith('q-d:') || attrName.startsWith('q-w:')
        );
        if (!isEventAttr) continue;
        if (attr.value?.type !== 'JSXExpressionContainer' || attr.value.expression?.type !== 'Identifier') continue;

        const qrlName = attr.value.expression.name;
        const site = nestedCallSites!.find(s => s.qrlVarName === qrlName || s.hoistedSymbolName === qrlName);
        const params = site?.elementQpParams ?? qrlParamMap.get(qrlName);
        if (params) {
          for (const p of params) {
            if (!seen.has(p)) { seen.add(p); elementParams.push(p); }
          }
        }
      }
      if (elementParams.length > 0) qpOverrides.set(node.start, elementParams);
    }

    forEachAstChild(node, (child) => walkAst(child));
  }

  walkAst(program);
  return qpOverrides.size > 0 ? qpOverrides : undefined;
}

// ── Separator normalization ──

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

// ── Phase helpers ──

/**
 * Phases 1–3: build the upfront `parts[]` (imports + capture/migration imports
 * + nested QRL declarations) and the `importsBySource` index that downstream
 * post-transform import re-collection (Phase 8) needs to merge into.
 */
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
 * Phase 4: apply the body-text-only transforms — nested call site rewriting,
 * self-ref indirection, enum inlining, raw-props normalisation, diagnostic
 * stripping, and the three capture-driven passes (props field rename,
 * const-literal inlining, captures unpacking).
 *
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
  // Locally mutable plain string for the body-transform pipeline below.
  // BodyText brand applies at the ExtractionResult boundary; internal
  // helpers work on string.
  let bodyText: string = extraction.bodyText;

  if (nestedCallSites && nestedCallSites.length > 0) {
    bodyText = rewriteNestedCallSitesInline(bodyText, nestedCallSites, extraction.argStart);
    bodyText = applySelfRefIndirection(bodyText);
  }

  if (enumValueMap && enumValueMap.size > 0) {
    bodyText = inlineEnumReferences(bodyText, enumValueMap);
  }

  bodyText = applyRawPropsToSegmentBody(bodyText, parts);
  bodyText = stripDiagnosticsAndDirectives(bodyText);

  // Destructure capture-driven payloads once so the conditional pass list
  // below doesn't re-probe `captureInfo?.x && captureInfo.x.size > 0` at
  // every step (that pattern was repeated three times in the original).
  const propsFieldCaptures = captureInfo?.propsFieldCaptures;
  if (propsFieldCaptures && propsFieldCaptures.size > 0) {
    // OSS-409 bug 2: pass propsFieldDefaults so defaulted fields emit
    // `(_rawProps.<key> ?? <default>)` matching SWC's NullishCoalescing.
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

// ── Main entry point ──

/**
 * Generate the segment module source code for an extracted segment.
 *
 * 9-phase sequencer. Phases 1–3 (imports) and Phase 4 (body transforms) are
 * extracted into named helpers above. Phases 5–9 stay inline because each is
 * already a short named-function call or a single conditional.
 */
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

  // Phases 1–3: upfront import declarations.
  const { parts, importsBySource } = collectInitialImports(
    extraction, capturedNames, captureInfo, nestedQrlDecls, importContext,
  );

  // Phase 4: body-text transforms (also yields the post-const-inline captureInfo).
  let { bodyText, captureInfo: liveCaptureInfo } = applyBodyTransforms(
    extraction, parts, captureInfo, nestedCallSites, enumValueMap,
  );

  // Phase 5: JSX transformation.
  let segmentKeyCounterValue: number | undefined;
  if (jsxOptions?.enableJsx) {
    const jsxResult = transformSegmentJsx(bodyText, parts, jsxOptions, nestedCallSites, liveCaptureInfo);
    bodyText = jsxResult.bodyText;
    segmentKeyCounterValue = jsxResult.keyCounterValue;
  }

  // Phase 5b: peer-tool JSX-call rewriting. `qwik-react` and similar peer
  // codegen emit `jsx(Tag, propsObj)` calls (already pre-processed from JSX
  // syntax). Phase 5's JSX-syntax transform skips them because they're not
  // `<JSX/>`, and the entire Phase 5 may be skipped when source isn't .tsx/
  // .jsx (qwik-react ships as .mjs). Rewrite them to `_jsxSorted(...)` here so
  // they merge into the optimizer's emit shape. Runs unconditionally — the
  // cheap fast-path inside `transformSegmentJsxCalls` skips when no jsx
  // imports are present. SWC's reference equivalent: `handle_jsx` at
  // `swc-reference-only/transform.rs:1163` gated by `jsx_functions` membership.
  if (importContext) {
    const jsxCallResult = transformSegmentJsxCalls(
      bodyText, parts, extraction.origin, importContext, segmentKeyCounterValue,
    );
    bodyText = jsxCallResult.bodyText;
    if (jsxCallResult.keyCounterValue !== undefined) {
      segmentKeyCounterValue = jsxCallResult.keyCounterValue;
    }
  }

  // OSS-415: fold constant-foldable subtrees that survived earlier passes
  // (typically `?? <default>` RHS injected by raw-props in non-JSX
  // positions). Runs AFTER Phase 5/5b so `_hf<n>_str` has been generated
  // source-preserving and JSX-prop positions are now `_fnSignal(...)` calls
  // with no `?? <default>` left to fold. Mirrors the same post-pass added
  // to the inline-strategy path (`rewrite/inline-body.ts`).
  bodyText = foldBodySimplifiableExpressions(bodyText);

  // Phase 6: core-symbol imports + sync$ call rewriting.
  // OSS-430: include moved-decl text (already in `parts`) when scanning
  // for core helpers — a moved helper function with rewritten JSX may
  // reference `_jsxSplit` / `_getVarProps` / `_getConstProps` etc. that
  // the segment's main body doesn't.
  // OSS-430: include moved-decl text (already in `parts`) when scanning
  // for core helpers — a moved helper function with rewritten JSX may
  // reference `_jsxSplit` / `_getVarProps` / `_getConstProps` etc. that
  // the segment's main body doesn't. The `//` separator may not yet be
  // present when ensureCoreImports runs (it's added later by
  // `normalizeSeparators`), so explicitly include a separator before
  // calling so the early-return path doesn't bail out.
  const scanText = bodyText + '\n' + parts
    .filter(p => !p.startsWith('import') && p !== '//')
    .join('\n');
  if (parts.indexOf('//') < 0) parts.push('//');
  ensureCoreImports(scanText, parts);
  bodyText = transformSyncCalls(bodyText, parts);

  // Phase 7: separator normalization (after core imports, before re-collection).
  normalizeSeparators(parts);

  // Function signature rewrite for loop-padding (_,_1,...) parameters.
  if (hasUnderscorePlaceholderParams(extraction.paramNames)) {
    bodyText = rewriteFunctionSignature(bodyText, extraction.paramNames);
  }

  // Phase 8: post-transform import re-collection + final separator normalization.
  if (importContext) {
    recollectPostTransformImports(bodyText, parts, importContext, importsBySource, capturedNames, nestedCallSites);
  }
  normalizeSeparators(parts);

  // Phase 9: dead-code elimination + emit.
  if (nestedCallSites && nestedCallSites.length > 0) {
    bodyText = removeDeadConstLiterals(bodyText);
  }

  parts.push(`export const ${extraction.symbolName} = ${bodyText};`);
  return { code: parts.join('\n'), keyCounterValue: segmentKeyCounterValue };
}
