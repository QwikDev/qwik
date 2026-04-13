/**
 * Segment module code generation.
 *
 * Generates the source code for extracted segment modules. Each segment
 * module contains only the imports it references plus the exported segment body.
 */

import { createRegExp, exactly, oneOrMore, maybe, anyOf, wordChar, wordBoundary, whitespace, charNotIn, global } from 'magic-regexp';
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { walk, getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import { rewriteImportSource } from './rewrite-imports.js';
import { getQrlImportSource, buildSyncTransform, needsPureAnnotation } from './rewrite-calls.js';
import { applyRawPropsTransform, consolidateRawPropsInWCalls, inlineConstCaptures } from './rewrite-parent.js';
import type { ExtractionResult } from './extract.js';
import { transformAllJsx, collectConstIdents } from './jsx-transform.js';

// original: /\/\*\s*@qwik-disable-next-line\s+\w+\s*\*\/\s*\n?/g
const qwikDisableDirective = createRegExp(
  exactly('/*').and(whitespace.times.any()).and('@qwik-disable-next-line')
    .and(oneOrMore(whitespace)).and(oneOrMore(wordChar))
    .and(whitespace.times.any()).and('*/').and(whitespace.times.any()).and(maybe(exactly('\n'))),
  [global],
);

// original: /const\s+(q_\S+)/
const qrlConstName = createRegExp(
  exactly('const').and(oneOrMore(whitespace)).and(exactly('q_').and(oneOrMore(charNotIn(' \t\n\r'))).grouped()),
);

// original: /\b(\w+Qrl)\b/g
const qrlSuffixPattern = createRegExp(
  wordBoundary.and(oneOrMore(wordChar).and('Qrl').grouped()).and(wordBoundary),
  [global],
);

// original: /^(\s*function\s*\w*\s*)\(([^)]*)\)/
const funcSignaturePattern = createRegExp(
  whitespace.times.any().and('function').and(whitespace.times.any()).and(wordChar.times.any()).and(whitespace.times.any()).grouped()
    .and('(').and(charNotIn(')').times.any().grouped()).and(')').at.lineStart(),
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
   * The segment body should replace bare references to these fields with _rawProps.key.
   */
  propsFieldCaptures?: Map<string, string>;
  /**
   * Map from captured variable name to its literal source text.
   * When set, these const literal captures are inlined into the segment body
   * and removed from captureNames (matching SWC behavior).
   */
  constLiterals?: Map<string, string>;
}

/**
 * Additional import context from transform.ts for post-transform import re-collection.
 * After body transforms (JSX, nested calls, sync$), the segment body may reference
 * identifiers not in the original segmentImports.
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
  importedName: string; // 'default', '*', or the original exported name
}

// ── Shared helper: insert an import before the first '//' separator ──

function insertImportBeforeSeparator(parts: string[], importStmt: string): void {
  const sepIdx = parts.indexOf('//');
  if (sepIdx >= 0) {
    parts.splice(sepIdx, 0, importStmt);
  } else {
    parts.unshift(importStmt);
  }
}

function partsHaveImport(parts: string[], symbol: string): boolean {
  return parts.some(p =>
    p.includes(`{ ${symbol} }`) || p.includes(`{ ${symbol},`) ||
    p.includes(`, ${symbol} }`) || p.includes(`, ${symbol},`) ||
    p.includes(`as ${symbol}`) || p.includes(`* as ${symbol}`),
  );
}

// ── Props field reference replacement ──

/**
 * Replace bare references to destructured prop field names with _rawProps.field
 * in a segment body. Uses AST-based replacement to avoid replacing property keys,
 * member expression properties, or other non-reference positions.
 */
function replacePropsFieldReferences(bodyText: string, fieldMap: Map<string, string>): string {
  const wrappedSource = `(${bodyText})`;
  let parseResult;
  try {
    parseResult = parseSync('__rpf__.tsx', wrappedSource, { experimentalRawTransfer: true } as any);
  } catch {
    return bodyText;
  }
  if (!parseResult.program || parseResult.errors?.length) return bodyText;

  const replacements: Array<{ start: number; end: number; key: string; isShorthand?: boolean }> = [];
  const offset = 1; // account for leading `(`

  function walkNode(node: any, parentKey?: string, parentNode?: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Identifier' && fieldMap.has(node.name)) {
      const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
      const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression');
      const isParam = parentKey === 'params';
      const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
      const isShorthandValue = parentKey === 'value' &&
        (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
        parentNode?.shorthand === true;

      if (isShorthandValue) {
        replacements.push({
          start: node.start - offset, end: node.end - offset,
          key: fieldMap.get(node.name)!, isShorthand: true,
        });
      } else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclaratorId) {
        replacements.push({
          start: node.start - offset, end: node.end - offset,
          key: fieldMap.get(node.name)!,
        });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      const val = node[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') walkNode(item, key, node);
          }
        } else if (typeof val.type === 'string') {
          walkNode(val, key, node);
        }
      }
    }
  }

  walkNode(parseResult.program);
  if (replacements.length === 0) return bodyText;

  replacements.sort((a, b) => b.start - a.start);
  let result = bodyText;
  for (const r of replacements) {
    const accessor = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(r.key)
      ? '_rawProps.' + r.key
      : `_rawProps["${r.key}"]`;
    if (r.isShorthand) {
      result = result.slice(0, r.start) + r.key + ': ' + accessor + result.slice(r.end);
    } else {
      result = result.slice(0, r.start) + accessor + result.slice(r.end);
    }
  }

  return result;
}

// ── Captures unpacking ──

/**
 * Inject _captures unpacking into a function body text.
 * For expression bodies (`=> expr`), converts to `=> { return expr; }` first.
 */
export function injectCapturesUnpacking(bodyText: string, captureNames: string[]): string {
  if (captureNames.length === 0) return bodyText;

  const unpackParts = captureNames.map((name, i) => `${name} = _captures[${i}]`);
  const unpackLine = `const ${unpackParts.join(', ')};`;

  const arrowIdx = findArrowIndex(bodyText);
  if (arrowIdx === -1) return injectIntoBlockBody(bodyText, unpackLine);

  let afterArrow = arrowIdx + 2;
  while (afterArrow < bodyText.length && /\s/.test(bodyText[afterArrow])) {
    afterArrow++;
  }

  if (bodyText[afterArrow] === '{') {
    return bodyText.slice(0, afterArrow + 1) + '\n' + unpackLine + bodyText.slice(afterArrow + 1);
  }

  // Expression body: convert to block body with return
  const expr = bodyText.slice(afterArrow);
  const prefix = bodyText.slice(0, arrowIdx + 2);
  return prefix + ' {\n' + unpackLine + '\nreturn ' + expr + ';\n}';
}

/**
 * Find the index of the `=>` arrow in a function text, skipping over
 * parenthesized parameter lists and type annotations.
 */
function findArrowIndex(text: string): number {
  let depth = 0;
  let inString: string | null = null;

  for (let i = 0; i < text.length - 1; i++) {
    const ch = text[i];

    if (inString) {
      if (ch === inString && text[i - 1] !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '<') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '>') { depth--; continue; }
    if (depth === 0 && ch === '=' && text[i + 1] === '>') return i;
  }

  return -1;
}

function injectIntoBlockBody(bodyText: string, line: string): string {
  const braceIdx = bodyText.indexOf('{');
  if (braceIdx === -1) return bodyText;
  return bodyText.slice(0, braceIdx + 1) + '\n' + line + bodyText.slice(braceIdx + 1);
}

// ── Arrow-body scanning helpers (for .w() hoisting) ──

/**
 * Scan backwards from `pos` to find an enclosing arrow whose parameter list
 * includes `capturedVarName`, returning the injection position inside the body.
 */
function findEnclosingArrowBodyForCapture(text: string, pos: number, capturedVarName: string): number {
  let i = pos - 1;
  while (i >= 1) {
    if (text[i] !== '(' && text[i] !== '{') { i--; continue; }

    let j = i - 1;
    while (j >= 0 && /\s/.test(text[j])) j--;
    if (!(j >= 1 && text[j] === '>' && text[j - 1] === '=')) { i--; continue; }

    // Found `=> (` or `=> {` -- extract the parameter list
    let paramEnd = j - 2;
    while (paramEnd >= 0 && /\s/.test(text[paramEnd])) paramEnd--;

    let paramText = '';
    if (text[paramEnd] === ')') {
      let depth = 1;
      let pStart = paramEnd - 1;
      while (pStart >= 0 && depth > 0) {
        if (text[pStart] === ')') depth++;
        else if (text[pStart] === '(') depth--;
        pStart--;
      }
      pStart++;
      paramText = text.slice(pStart + 1, paramEnd);
    } else if (/\w/.test(text[paramEnd])) {
      let pStart = paramEnd;
      while (pStart > 0 && /\w/.test(text[pStart - 1])) pStart--;
      paramText = text.slice(pStart, paramEnd + 1);
    }

    const params = paramText.split(',').map(p => p.trim());
    if (params.includes(capturedVarName)) return i + 1;

    // Check if the captured variable is declared as a local inside this arrow body
    const bodyStart = i + 1;
    const bodySlice = text.slice(bodyStart, pos);
    const localDeclPattern = new RegExp(`\\b(?:const|let|var)\\s+${capturedVarName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (localDeclPattern.test(bodySlice)) return bodyStart;

    i--;
  }
  return -1;
}

/**
 * Find the end position (after the semicolon) of a variable declaration
 * for the given variable name, searching forward from startPos.
 */
function findVarDeclarationEnd(text: string, startPos: number, varName: string): number {
  const pattern = new RegExp(`\\b(?:const|let|var)\\s+${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  const searchText = text.slice(startPos);
  const match = pattern.exec(searchText);
  if (!match) return -1;

  const declStart = startPos + match.index;
  const semiIdx = text.indexOf(';', declStart + match[0].length);
  if (semiIdx < 0) return -1;

  let endPos = semiIdx + 1;
  if (text[endPos] === '\n') endPos++;
  return endPos;
}

// ── Post-transform identifier collection ──

/**
 * Parse a body text string and extract all referenced Identifier and JSXIdentifier names.
 * Used to determine which imports a segment body needs after all transforms.
 */
function collectBodyIdentifiers(bodyText: string): Set<string> {
  const ids = new Set<string>();
  try {
    const wrapped = `(${bodyText})`;
    const parsed = parseSync('segment.tsx', wrapped, { experimentalRawTransfer: true } as any);

    let funcNode: any = null;
    walk(parsed.program, {
      enter(node: any) {
        if (!funcNode && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression')) {
          funcNode = node;
        }
        if (node.type === 'JSXIdentifier' && node.name && node.name[0] >= 'A' && node.name[0] <= 'Z') {
          ids.add(node.name);
        }
      }
    });

    if (funcNode) {
      const undeclared = getUndeclaredIdentifiersInFunction(funcNode);
      for (const name of undeclared) ids.add(name);
    } else {
      walk(parsed.program, {
        enter(node: any) {
          if (node.type === 'Identifier' && node.name) ids.add(node.name);
        }
      });
    }
  } catch {
    const identRegex = /\b([A-Z_$][a-zA-Z0-9_$]*)\b/g;
    let match;
    while ((match = identRegex.exec(bodyText)) !== null) ids.add(match[1]);
  }
  return ids;
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
  // _captures import -- skip for inlinedQrl (skipCaptureInjection) since body
  // already references _captures directly via segmentImports from the parent.
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

  // Sort alphabetically to match Rust optimizer ordering
  const sortedDecls = [...nestedQrlDecls].sort((a, b) => {
    const nameA = a.match(qrlConstName)?.[1] ?? a;
    const nameB = b.match(qrlConstName)?.[1] ?? b;
    return nameA.localeCompare(nameB);
  });
  for (const decl of sortedDecls) parts.push(decl);
  parts.push('//');
}

// ── Nested call site rewriting ──

/**
 * Rewrite nested $() calls and $-suffixed JSX attrs in the body text,
 * replacing them with QRL variable references. Returns the modified body text.
 *
 * MUST run before any other text modifications because it uses original source positions.
 */
function rewriteNestedCallSitesInline(
  bodyText: string,
  nestedCallSites: NestedCallSiteInfo[],
  bodyOffset: number,
): string {
  const sorted = [...nestedCallSites].sort((a, b) => {
    const aStart = a.isJsxAttr ? (a.attrStart ?? a.callStart) : a.callStart;
    const bStart = b.isJsxAttr ? (b.attrStart ?? b.callStart) : b.callStart;
    return bStart - aStart;
  });

  let componentScopeWDecls: string[] | undefined;
  const hoistDeclarations: Array<{ position: number; declaration: string }> = [];

  for (const site of sorted) {
    if (site.isJsxAttr && site.attrStart !== undefined && site.attrEnd !== undefined && site.transformedPropName) {
      const propValueRef = site.hoistedSymbolName ?? site.qrlVarName;
      const relStart = site.attrStart - bodyOffset;
      const relEnd = site.attrEnd - bodyOffset;
      if (relStart >= 0 && relEnd <= bodyText.length) {
        bodyText = bodyText.slice(0, relStart) +
          `${site.transformedPropName}={${propValueRef}}` +
          bodyText.slice(relEnd);
      }

      if (site.hoistedSymbolName && site.hoistedCaptureNames && site.hoistedCaptureNames.length > 0) {
        const capturedVar = site.hoistedCaptureNames[0];
        const enclosingPos = findEnclosingArrowBodyForCapture(bodyText, relStart, capturedVar);
        // Top-level function body (< 20 chars from start) means component-scoped captures
        const isLoopCallback = enclosingPos >= 0 && enclosingPos > 20;
        if (isLoopCallback) {
          const captureList = site.hoistedCaptureNames.join(',\n        ');
          const decl = `const ${site.hoistedSymbolName} = ${site.qrlVarName}.w([\n            ${captureList}\n        ]);`;
          let latestDeclPos = -1;
          for (const capVar of site.hoistedCaptureNames) {
            const varDeclPos = findVarDeclarationEnd(bodyText, enclosingPos, capVar);
            if (varDeclPos > latestDeclPos) latestDeclPos = varDeclPos;
          }
          hoistDeclarations.push({ position: latestDeclPos >= 0 ? latestDeclPos : enclosingPos, declaration: decl });
        } else {
          if (!componentScopeWDecls) componentScopeWDecls = [];
          const captureList = site.hoistedCaptureNames.join(',\n        ');
          const decl = `const ${site.hoistedSymbolName} = ${site.qrlVarName}.w([\n        ${captureList}\n    ]);`;
          componentScopeWDecls.push(decl);
        }
      }
    } else {
      const relStart = site.callStart - bodyOffset;
      const relEnd = site.callEnd - bodyOffset;
      if (relStart >= 0 && relEnd <= bodyText.length) {
        let qrlRef = site.qrlVarName;
        if (site.captureNames && site.captureNames.length > 0) {
          qrlRef += '.w([\n        ' + site.captureNames.join(',\n        ') + '\n    ])';
        }
        if (site.qrlCallee) {
          const purePrefix = needsPureAnnotation(site.qrlCallee) ? '/*#__PURE__*/ ' : '';
          bodyText = bodyText.slice(0, relStart) + `${purePrefix}${site.qrlCallee}(${qrlRef})` + bodyText.slice(relEnd);
        } else {
          bodyText = bodyText.slice(0, relStart) + qrlRef + bodyText.slice(relEnd);
        }
      }
    }
  }

  bodyText = injectHoistDeclarations(bodyText, hoistDeclarations);
  bodyText = injectComponentScopeWDecls(bodyText, componentScopeWDecls);
  return bodyText;
}

/** Inject .w() hoisting declarations, converting expression bodies to block bodies as needed. */
function injectHoistDeclarations(
  bodyText: string,
  hoistDeclarations: Array<{ position: number; declaration: string }>,
): string {
  if (hoistDeclarations.length === 0) return bodyText;

  // SWC groups .w() declarations in the same scope together at the max position
  if (hoistDeclarations.length > 1) {
    const maxPos = Math.max(...hoistDeclarations.map(h => h.position));
    const minPos = Math.min(...hoistDeclarations.map(h => h.position));
    if (maxPos - minPos < 500) {
      for (const h of hoistDeclarations) h.position = maxPos;
    }
  }

  hoistDeclarations.sort((a, b) => b.position - a.position);
  for (const hoist of hoistDeclarations) {
    const pos = hoist.position;
    const charBefore = bodyText[pos - 1];
    if (charBefore === '(') {
      // Expression body: `=> (expr)` -- convert to block body
      let depth = 1;
      let closeIdx = pos;
      while (closeIdx < bodyText.length && depth > 0) {
        if (bodyText[closeIdx] === '(') depth++;
        else if (bodyText[closeIdx] === ')') depth--;
        closeIdx++;
      }
      closeIdx--;
      const exprContent = bodyText.slice(pos, closeIdx).replace(/^\s+/, '');
      const blockBody = `{\n        ${hoist.declaration}\n        return ${exprContent};\n    }`;
      bodyText = bodyText.slice(0, pos - 1) + blockBody + bodyText.slice(closeIdx + 1);
    } else if (charBefore === '{') {
      bodyText = bodyText.slice(0, pos) +
        '\n        ' + hoist.declaration +
        bodyText.slice(pos);
    } else {
      // Mid-block injection: detect indentation from the next non-empty line
      let indent = '\t';
      const nextNewline = bodyText.indexOf('\n', pos);
      if (nextNewline >= 0) {
        const nextLine = bodyText.slice(nextNewline + 1);
        const indentMatch = nextLine.match(/^(\s+)/);
        if (indentMatch) indent = indentMatch[1];
      }
      bodyText = bodyText.slice(0, pos) +
        indent + hoist.declaration + '\n' +
        bodyText.slice(pos);
    }
  }
  return bodyText;
}

/** Inject component-scope .w() declarations before the return statement. */
function injectComponentScopeWDecls(bodyText: string, decls: string[] | undefined): string {
  if (!decls || decls.length === 0) return bodyText;

  const returnIdx = bodyText.indexOf('return ');
  if (returnIdx < 0) return bodyText;

  let lineStart = returnIdx - 1;
  while (lineStart >= 0 && bodyText[lineStart] !== '\n') lineStart--;
  const indent = bodyText.slice(lineStart + 1, returnIdx);
  const declBlock = decls.join('\n' + indent) + '\n' + indent;
  return bodyText.slice(0, returnIdx) + declBlock + bodyText.slice(returnIdx);
}

// ── Body transform helpers ──

/** Inline TS enum member references (e.g., Thing.A -> 0). */
function inlineEnumReferences(bodyText: string, enumValueMap: Map<string, Map<string, string>>): string {
  for (const [enumName, members] of enumValueMap) {
    for (const [memberName, value] of members) {
      const pattern = new RegExp(`\\b${enumName}\\.${memberName}\\b`, 'g');
      bodyText = bodyText.replace(pattern, value);
    }
  }
  return bodyText;
}

/** Apply _rawProps transform for component$ segments, add _restProps import if needed. */
function applyRawPropsIfComponent(
  bodyText: string,
  extraction: ExtractionResult,
  parts: string[],
): string {
  const isComponentSegment = extraction.ctxName === 'component$' || extraction.ctxName === 'componentQrl';
  if (!isComponentSegment) return bodyText;

  const result = applyRawPropsTransform(bodyText);
  if (result === bodyText) return bodyText;

  bodyText = consolidateRawPropsInWCalls(result);
  if (bodyText.includes('_restProps(') && !parts.some(p => p.includes('_restProps'))) {
    insertImportBeforeSeparator(parts, `import { _restProps } from "@qwik.dev/core";`);
  }
  return bodyText;
}

/**
 * Strip diagnostic comments and passive/preventdefault JSX directives.
 * Must run AFTER nested call site rewriting (which uses original positions).
 */
function stripDiagnosticsAndDirectives(bodyText: string): string {
  bodyText = bodyText.replace(qwikDisableDirective, '');

  // Strip passive:* and matching preventdefault:* PER-ELEMENT.
  // Cannot strip preventdefault:click globally just because passive:click
  // exists on some other element.
  bodyText = bodyText.replace(/<(\w+)([^>]*?)>/g, (_match, tagName, attrsStr) => {
    const elementPassive = new Set<string>();
    for (const m of attrsStr.matchAll(/passive:(\w+)/g)) {
      elementPassive.add(m[1]);
    }
    let cleaned = attrsStr.replace(/\s*passive:\w+/g, '');
    if (elementPassive.size > 0) {
      cleaned = cleaned.replace(/\s*preventdefault:(\w+)/g, (pdFull: string, eventName: string) => {
        return elementPassive.has(eventName) ? '' : pdFull;
      });
    }
    return `<${tagName}${cleaned}>`;
  });

  return bodyText;
}

// ── JSX transformation ──

/**
 * Transform JSX in the segment body, returning the new body text and key counter.
 * Updates `parts` with any needed imports/hoisted declarations.
 */
function transformSegmentJsx(
  bodyText: string,
  parts: string[],
  jsxOptions: SegmentJsxOptions,
  nestedCallSites: NestedCallSiteInfo[] | undefined,
  captureInfo: SegmentCaptureInfo | undefined,
): { bodyText: string; keyCounterValue?: number } {
  // Fast check: skip parseSync for segments without actual JSX
  if (!(/(?:<[A-Z_a-z\/]|JSX)/.test(bodyText))) return { bodyText };

  try {
    const wrappedBody = `(${bodyText})`;
    const bodyParse = parseSync('segment.tsx', wrappedBody, { experimentalRawTransfer: true } as any);
    const bodyS = new MagicString(wrappedBody);

    const qrlsWithCaptures = buildQrlsWithCapturesSet(nestedCallSites);
    const qpOverrides = buildQpOverrides(nestedCallSites, bodyParse.program);

    // QRL variable names (q_xxx) are NOT added to constIdents because SWC
    // collects const_idents before JSX transformation. This means QRL vars
    // get classified as 'var' by classifyProp, matching SWC behavior.
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
  program: any,
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

  function walkAst(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walkAst); return; }
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
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      walkAst(node[key]);
    }
  }

  walkAst(program);
  return qpOverrides.size > 0 ? qpOverrides : undefined;
}

// ── sync$ transformation ──

/** Transform sync$() calls to _qrlSync() with minified string argument. */
function transformSyncCalls(bodyText: string, parts: string[]): string {
  if (!bodyText.includes('sync$(')) return bodyText;

  let result = '';
  let i = 0;
  while (i < bodyText.length) {
    const syncIdx = bodyText.indexOf('sync$(', i);
    if (syncIdx === -1) { result += bodyText.slice(i); break; }

    // Word boundary check
    if (syncIdx > 0 && /[\w$]/.test(bodyText[syncIdx - 1])) {
      result += bodyText.slice(i, syncIdx + 6);
      i = syncIdx + 6;
      continue;
    }

    result += bodyText.slice(i, syncIdx);
    const openParen = syncIdx + 5;
    let depth = 1;
    let j = openParen + 1;
    while (j < bodyText.length && depth > 0) {
      const ch = bodyText[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        j++;
        while (j < bodyText.length) {
          if (bodyText[j] === '\\') { j += 2; continue; }
          if (bodyText[j] === quote) break;
          j++;
        }
      }
      j++;
    }
    result += buildSyncTransform(bodyText.slice(openParen + 1, j - 1));
    i = j;
  }

  bodyText = result;
  const syncSepIdx = parts.indexOf('//');
  if (syncSepIdx >= 0 && !parts.some(p => p.includes('_qrlSync'))) {
    parts.splice(syncSepIdx, 0, `import { _qrlSync } from "@qwik.dev/core";`);
  }
  return bodyText;
}

// ── Ensure core symbol imports ──

/** Add imports for core symbols referenced in body but not yet imported. */
function ensureCoreImports(bodyText: string, parts: string[]): void {
  const coreSymbols = ['_jsxSorted', '_jsxSplit', '_fnSignal', '_wrapProp', '_restProps', '_getVarProps', '_getConstProps'];
  const sepIdx = parts.indexOf('//');
  if (sepIdx < 0) return;

  for (const sym of coreSymbols) {
    if (bodyText.includes(sym) && !parts.some(p => p.startsWith('import') && p.includes(sym))) {
      parts.splice(sepIdx, 0, `import { ${sym} } from "@qwik.dev/core";`);
    }
  }
  if (bodyText.includes('_Fragment') && !parts.some(p => p.startsWith('import') && p.includes('_Fragment'))) {
    parts.splice(parts.indexOf('//'), 0, `import { Fragment as _Fragment } from "@qwik.dev/core/jsx-runtime";`);
  }
}

// ── Post-transform import re-collection ──

/**
 * Scan the final body text for identifiers that need imports not already present.
 * Catches same-file components, namespace imports, _auto_ migration imports,
 * and Qrl-suffixed runtime imports from nested call rewriting.
 */
function recollectPostTransformImports(
  bodyText: string,
  parts: string[],
  importContext: SegmentImportContext,
  importsBySource: Map<string, SegmentImportSpec[]>,
  capturedNames: Set<string>,
  nestedCallSites: NestedCallSiteInfo[] | undefined,
): void {
  const bodyIdentifiers = collectBodyIdentifiers(bodyText);

  for (const id of bodyIdentifiers) {
    if (capturedNames.has(id)) continue;

    let alreadyImported = false;
    for (const specs of importsBySource.values()) {
      if (specs.some(s => s.localName === id)) { alreadyImported = true; break; }
    }
    if (alreadyImported) continue;
    if (partsHaveImport(parts, id)) continue;

    const moduleImp = importContext.moduleImports.find(m => m.localName === id);
    if (moduleImp) {
      let importStmt = buildModuleImportStatement(moduleImp);
      if (moduleImp.importAttributes) {
        const attrs = Object.entries(moduleImp.importAttributes).map(([k, v]) => `${k}: "${v}"`).join(', ');
        importStmt = importStmt.replace('";', `" with { ${attrs} };`);
      }
      insertImportBeforeSeparator(parts, importStmt);
      continue;
    }

    if (importContext.sameFileExports.has(id)) {
      addSameFileImport(parts, id, importContext);
    }
  }

  addQrlCalleeImports(parts, bodyText, nestedCallSites, importContext);
}

function buildModuleImportStatement(imp: { localName: string; importedName: string; source: string }): string {
  const rewrittenSource = rewriteImportSource(imp.source);
  if (imp.importedName === '*') return `import * as ${imp.localName} from "${rewrittenSource}";`;
  if (imp.importedName === 'default') return `import ${imp.localName} from "${rewrittenSource}";`;
  if (imp.importedName !== imp.localName) return `import { ${imp.importedName} as ${imp.localName} } from "${rewrittenSource}";`;
  return `import { ${imp.localName} } from "${rewrittenSource}";`;
}

function addSameFileImport(parts: string[], id: string, importContext: SegmentImportContext): void {
  const migrationDecision = importContext.migrationDecisions.find(d => d.varName === id);
  if (migrationDecision && migrationDecision.action === 'move') return;

  let importStmt: string;
  if (migrationDecision && migrationDecision.action === 'reexport' && !migrationDecision.isExported) {
    importStmt = `import { _auto_${id} as ${id} } from "${importContext.parentModulePath}";`;
  } else if (importContext.defaultExportedNames?.has(id)) {
    importStmt = `import { default as ${id} } from "${importContext.parentModulePath}";`;
  } else if (importContext.renamedExports?.has(id)) {
    const exportedAs = importContext.renamedExports.get(id)!;
    importStmt = `import { ${exportedAs} as ${id} } from "${importContext.parentModulePath}";`;
  } else {
    importStmt = `import { ${id} } from "${importContext.parentModulePath}";`;
  }
  insertImportBeforeSeparator(parts, importStmt);
}

function addQrlCalleeImports(
  parts: string[],
  bodyText: string,
  nestedCallSites: NestedCallSiteInfo[] | undefined,
  _importContext: SegmentImportContext,
): void {
  if (nestedCallSites) {
    const addedQrlCallees = new Set<string>();
    for (const site of nestedCallSites) {
      if (!site.qrlCallee || addedQrlCallees.has(site.qrlCallee)) continue;
      addedQrlCallees.add(site.qrlCallee);
      if (parts.some(p => p.includes(site.qrlCallee!))) continue;
      const importSource = getQrlImportSource(site.qrlCallee!, site.importSource);
      insertImportBeforeSeparator(parts, `import { ${site.qrlCallee} } from "${importSource}";`);
    }
  } else {
    qrlSuffixPattern.lastIndex = 0;
    const qrlSuffixRegex = qrlSuffixPattern;
    let qrlMatch;
    while ((qrlMatch = qrlSuffixRegex.exec(bodyText)) !== null) {
      const qrlName = qrlMatch[1];
      if (parts.some(p => p.includes(qrlName))) continue;
      if (qrlName.startsWith('use') || qrlName[0] === qrlName[0].toLowerCase()) {
        insertImportBeforeSeparator(parts, `import { ${qrlName} } from "@qwik.dev/core";`);
      }
    }
  }
}

// ── Separator normalization ──

/**
 * Rebuild parts with correct '//' separators between sections.
 * Layout: [imports] // [hoisted _hf decls] // [qrl const q_ decls] // [other]
 */
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
 *
 * Output layout:
 * 1. Import lines (only imports the segment references)
 * 2. "//" separator
 * 3. Hoisted signal declarations (_hf) if any
 * 4. Nested QRL declarations (const q_*) if any, with "//" separator
 * 5. `export const {symbolName} = {bodyText};`
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

  // Phase 4: Transform body text (order matters -- nested call site rewriting
  // uses original source positions, so it MUST run before any text modifications)
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

  // Phase 7: Normalize separators (two passes needed because post-transform
  // import re-collection may insert imports after the first normalization)
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

// ── Dead const literal elimination ──

/**
 * Remove `const X = literal;` declarations from a function body when X is
 * no longer referenced anywhere else in the body. Only removes declarations
 * with simple literal initializers to ensure no side effects are dropped.
 */
export function removeDeadConstLiterals(bodyText: string): string {
  const wrapper = `const __dce__ = ${bodyText}`;
  let parsed: any;
  try {
    parsed = parseSync('__dce__.tsx', wrapper, { experimentalRawTransfer: true } as any);
  } catch {
    return bodyText;
  }
  if (!parsed?.program?.body?.[0]) return bodyText;

  const decl = parsed.program.body[0];
  const init = decl.declarations?.[0]?.init;
  if (!init) return bodyText;

  let fnBody: any;
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    fnBody = init.body;
  }
  if (!fnBody || fnBody.type !== 'BlockStatement') return bodyText;

  const offset = 'const __dce__ = '.length;
  const stmts = fnBody.body;
  if (!stmts || stmts.length === 0) return bodyText;

  interface DeadCandidate {
    name: string;
    stmtStart: number;
    stmtEnd: number;
  }
  const candidates: DeadCandidate[] = [];

  for (const stmt of stmts) {
    if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
    if (stmt.declarations.length !== 1) continue;
    const d = stmt.declarations[0];
    if (d.id?.type !== 'Identifier') continue;
    const initNode = d.init;
    if (!initNode) continue;
    const isLiteral = initNode.type === 'StringLiteral' ||
      initNode.type === 'NumericLiteral' ||
      initNode.type === 'BooleanLiteral' ||
      initNode.type === 'NullLiteral' ||
      (initNode.type === 'Literal' && typeof initNode.value !== 'object');
    if (!isLiteral) continue;

    candidates.push({ name: d.id.name, stmtStart: stmt.start - offset, stmtEnd: stmt.end - offset });
  }

  if (candidates.length === 0) return bodyText;

  const toRemove: DeadCandidate[] = [];
  for (const c of candidates) {
    const rest = bodyText.slice(0, c.stmtStart) + bodyText.slice(c.stmtEnd);
    const re = new RegExp(`(?<![\\w$])${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`);
    if (!re.test(rest)) toRemove.push(c);
  }

  if (toRemove.length === 0) return bodyText;

  toRemove.sort((a, b) => b.stmtStart - a.stmtStart);
  let result = bodyText;
  for (const c of toRemove) {
    let end = c.stmtEnd;
    while (end < result.length && (result[end] === '\n' || result[end] === '\r' || result[end] === ';')) end++;
    let start = c.stmtStart;
    while (start > 0 && (result[start - 1] === '\t' || result[start - 1] === ' ')) start--;
    result = result.slice(0, start) + result.slice(end);
  }

  return result;
}

// ── Function signature rewriting ──

/**
 * Rewrite a function's parameter list to use the given paramNames.
 * Handles both arrow functions and function expressions.
 */
export function rewriteFunctionSignature(bodyText: string, paramNames: string[]): string {
  const paramList = paramNames.join(', ');

  const arrowIdx = findArrowIndex(bodyText);
  if (arrowIdx !== -1) {
    let parenEnd = arrowIdx - 1;
    while (parenEnd >= 0 && /\s/.test(bodyText[parenEnd])) parenEnd--;

    if (bodyText[parenEnd] === ')') {
      let depth = 1;
      let parenStart = parenEnd - 1;
      while (parenStart >= 0 && depth > 0) {
        if (bodyText[parenStart] === ')') depth++;
        else if (bodyText[parenStart] === '(') depth--;
        parenStart--;
      }
      parenStart++;
      return bodyText.slice(0, parenStart + 1) + paramList + bodyText.slice(parenEnd);
    }

    // Single param without parens
    let identStart = parenEnd;
    while (identStart > 0 && /\w/.test(bodyText[identStart - 1])) identStart--;
    return bodyText.slice(0, identStart) + '(' + paramList + ')' + bodyText.slice(parenEnd + 1);
  }

  const funcMatch = bodyText.match(funcSignaturePattern);
  if (funcMatch) {
    return funcMatch[1]! + '(' + paramList + ')' + bodyText.slice(funcMatch[0]!.length);
  }

  return bodyText;
}
