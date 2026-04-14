/**
 * Segment module code generation.
 *
 * Generates the source code for extracted segment modules. Each segment
 * module contains only the imports it references plus the exported segment body.
 */

import { createRegExp, exactly, oneOrMore, whitespace, charNotIn } from 'magic-regexp';
import MagicString from 'magic-string';
import { isAstNode } from '../utils/ast.js';
import { parseWithRawTransfer } from '../utils/parse.js';
import { rewriteImportSource } from './rewrite-imports.js';
import { inlineConstCaptures } from './rewrite/index.js';
import type { ExtractionResult } from './extract.js';
import { transformAllJsx, collectConstIdents } from './transform/jsx.js';
import { rewritePropsFieldReferences } from './utils/props-field-rewrite.js';
import type { AstNode, AstProgram } from '../ast-types.js';

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
  inlineEnumReferences,
  applyRawPropsIfComponent,
  stripDiagnosticsAndDirectives,
  transformSyncCalls,
  ensureCoreImports,
  removeDeadConstLiterals,
  rewriteFunctionSignature,
  injectCapturesUnpacking,
  findArrowIndex,
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
   * Map from captured variable name to its literal source text.
   * When set, these const literal captures are inlined into the segment body.
   */
  constLiterals?: Map<string, string>;
}

/**
 * Additional import context from transform.ts for post-transform import re-collection.
 */
export interface SegmentImportContext {
  moduleImports: Array<{ localName: string; importedName: string; source: string; importAttributes?: Record<string, string> }>;
  sameFileExports: Set<string>;
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
  devOptions?: { relPath: string };
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

function replacePropsFieldReferences(bodyText: string, fieldMap: Map<string, string>): string {
  return rewritePropsFieldReferences(bodyText, fieldMap, {
    parseFilename: '__rpf__.tsx',
    wrapperPrefix: '(',
    wrapperSuffix: ')',
    memberPropertyMode: 'all',
  });
}

// ── Phase helpers for generateSegmentCode ──

/**
 * Phase 1: Build import statements from extraction.segmentImports,
 * grouping by source and filtering out captured names.
 */
function buildSegmentImports(
  extraction: ExtractionResult,
  capturedNames: Set<string>,
  importContext: SegmentImportContext | undefined,
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

    const segConstIdents = collectConstIdents(bodyParse.program);
    if (captureInfo?.captureNames) {
      for (const name of captureInfo.captureNames) segConstIdents.add(name);
    }

    const jsxResult = transformAllJsx(wrappedBody, bodyS, bodyParse.program, jsxOptions.importedNames,
      undefined, jsxOptions.devOptions, jsxOptions.keyCounterStart, true, qpOverrides, qrlsWithCaptures, jsxOptions.paramNames, jsxOptions.relPath,
      undefined, segConstIdents);

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
    if (site.loopLocalParamNames && site.loopLocalParamNames.length > 0) {
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
  if (!nestedCallSites || !nestedCallSites.some(s => s.loopLocalParamNames && s.loopLocalParamNames.length > 0)) {
    return undefined;
  }

  const qpOverrides = new Map<number, string[]>();
  const qrlParamMap = new Map<string, string[]>();
  for (const site of nestedCallSites) {
    if (!site.loopLocalParamNames || site.loopLocalParamNames.length === 0) continue;
    qrlParamMap.set(site.qrlVarName, site.loopLocalParamNames);
    if (site.hoistedSymbolName) qrlParamMap.set(site.hoistedSymbolName, site.loopLocalParamNames);
  }

  function walkAst(node: AstNode | null | undefined): void {
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

    const record = node as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (!value || typeof value !== 'object') continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isAstNode(item)) {
            walkAst(item as AstNode);
          }
        }
        continue;
      }
      if (isAstNode(value)) {
        walkAst(value as AstNode);
      }
    }
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

// ── Main entry point ──

/**
 * Generate the segment module source code for an extracted segment.
 */
export function generateSegmentCode(
  extraction: ExtractionResult,
  nestedQrlDecls?: string[],
  captureInfo?: SegmentCaptureInfo,
  jsxOptions?: SegmentJsxOptions,
  nestedCallSites?: NestedCallSiteInfo[],
  importContext?: SegmentImportContext,
  enumValueMap?: Map<string, Map<string, string>>,
): { code: string; keyCounterValue?: number } {
  const capturedNames = new Set<string>(captureInfo ? captureInfo.captureNames : []);
  let segmentKeyCounterValue: number | undefined;

  // Phase 1: Build import statements
  const { parts, importsBySource } = buildSegmentImports(extraction, capturedNames, importContext);

  // Phase 2: Add _captures, _auto_, and moved-declaration imports
  addCaptureAndMigrationImports(parts, captureInfo);

  // Phase 3: Add nested QRL declarations
  addNestedQrlDeclarations(parts, nestedQrlDecls);

  // Phase 4: Transform body text
  let bodyText = extraction.bodyText;

  if (nestedCallSites && nestedCallSites.length > 0) {
    bodyText = rewriteNestedCallSitesInline(bodyText, nestedCallSites, extraction.argStart);
  }

  if (enumValueMap && enumValueMap.size > 0) {
    bodyText = inlineEnumReferences(bodyText, enumValueMap);
  }

  bodyText = applyRawPropsIfComponent(bodyText, extraction, parts);
  bodyText = stripDiagnosticsAndDirectives(bodyText);

  if (captureInfo?.propsFieldCaptures && captureInfo.propsFieldCaptures.size > 0) {
    bodyText = replacePropsFieldReferences(bodyText, captureInfo.propsFieldCaptures);
  }

  if (captureInfo?.constLiterals && captureInfo.constLiterals.size > 0) {
    bodyText = inlineConstCaptures(bodyText, captureInfo.constLiterals);
    captureInfo = {
      ...captureInfo,
      captureNames: captureInfo.captureNames.filter(n => !captureInfo!.constLiterals!.has(n)),
    };
  }

  if (captureInfo && captureInfo.captureNames.length > 0 && !captureInfo.skipCaptureInjection) {
    bodyText = injectCapturesUnpacking(bodyText, captureInfo.captureNames);
  }

  // Phase 5: JSX transformation
  if (jsxOptions?.enableJsx) {
    const jsxResult = transformSegmentJsx(bodyText, parts, jsxOptions, nestedCallSites, captureInfo);
    bodyText = jsxResult.bodyText;
    segmentKeyCounterValue = jsxResult.keyCounterValue;
  }

  // Phase 6: Ensure core symbol imports and transform sync$ calls
  ensureCoreImports(bodyText, parts);
  bodyText = transformSyncCalls(bodyText, parts);

  // Phase 7: Normalize separators
  normalizeSeparators(parts);

  // Rewrite function signature when paramNames has loop/q:p padding pattern
  if (extraction.paramNames.length >= 2 &&
      extraction.paramNames[0] === '_' &&
      extraction.paramNames[1] === '_1') {
    bodyText = rewriteFunctionSignature(bodyText, extraction.paramNames);
  }

  // Phase 8: Post-transform import re-collection
  if (importContext) {
    recollectPostTransformImports(bodyText, parts, importContext, importsBySource, capturedNames, nestedCallSites);
  }

  // Final separator normalization after import re-collection
  normalizeSeparators(parts);

  // Phase 9: Dead code elimination and emit
  if (nestedCallSites && nestedCallSites.length > 0) {
    bodyText = removeDeadConstLiterals(bodyText);
  }

  parts.push(`export const ${extraction.symbolName} = ${bodyText};`);
  return { code: parts.join('\n'), keyCounterValue: segmentKeyCounterValue };
}
