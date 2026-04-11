/**
 * Segment module code generation.
 *
 * Generates the source code for extracted segment modules. Each segment
 * module contains only the imports it references plus the exported segment body.
 *
 * Implements: EXTRACT-04, CAPT-02
 */

import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { rewriteImportSource } from './rewrite-imports.js';
import { getQrlImportSource } from './rewrite-calls.js';
import { applyRawPropsTransform } from './rewrite-parent.js';
import type { ExtractionResult } from './extract.js';
import { transformAllJsx } from './jsx-transform.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Capture and migration info to inject into a segment module.
 */
export interface SegmentCaptureInfo {
  /** Variables received via _captures (scope-level captures). */
  captureNames: string[];
  /** _auto_VARNAME imports from parent module (module-level migration). */
  autoImports: Array<{ varName: string; parentModulePath: string }>;
  /** Declaration text physically moved into the segment. */
  movedDeclarations: string[];
}

/**
 * Additional import context passed from transform.ts for post-transform
 * import re-collection. After body transforms (JSX, nested calls, sync$),
 * the segment body may reference identifiers not in the original segmentImports.
 */
export interface SegmentImportContext {
  /** All imports from the parent module (for re-scanning after body transforms) */
  moduleImports: Array<{ localName: string; importedName: string; source: string; importAttributes?: Record<string, string> }>;
  /** Exported/declared names in the parent module (for self-referential imports) */
  sameFileExports: Set<string>;
  /** The parent module path (e.g., "./test") for self-referential imports */
  parentModulePath: string;
  /** Migration decisions for _auto_ import detection on JSX tags */
  migrationDecisions: Array<{ varName: string; action: string; isExported?: boolean }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inject _captures unpacking into a function body text.
 *
 * The bodyText is the raw source of the closure (e.g., `() => { ... }` or `(params) => expr`).
 * We find the opening `{` of the function body and insert the unpacking line right after it.
 * For expression bodies (`=> expr`), we convert to `=> { return expr; }` first.
 *
 * @param bodyText - The raw closure body text
 * @param captureNames - Alphabetically sorted capture variable names
 * @returns Modified body text with _captures unpacking injected
 */
export function injectCapturesUnpacking(bodyText: string, captureNames: string[]): string {
  if (captureNames.length === 0) return bodyText;

  // Build the unpacking line: const var1 = _captures[0], var2 = _captures[1];
  const unpackParts = captureNames.map((name, i) => `${name} = _captures[${i}]`);
  const unpackLine = `const ${unpackParts.join(', ')};`;

  // Find the arrow `=>` to determine if block or expression body
  const arrowIdx = findArrowIndex(bodyText);
  if (arrowIdx === -1) {
    // Not an arrow function — try function expression: function(...) { ... }
    return injectIntoBlockBody(bodyText, unpackLine);
  }

  // After `=>`, skip whitespace to find what follows
  let afterArrow = arrowIdx + 2;
  while (afterArrow < bodyText.length && /\s/.test(bodyText[afterArrow])) {
    afterArrow++;
  }

  if (bodyText[afterArrow] === '{') {
    // Block body: inject after the opening brace
    return bodyText.slice(0, afterArrow + 1) + '\n' + unpackLine + bodyText.slice(afterArrow + 1);
  } else {
    // Expression body: convert to block body with return
    const expr = bodyText.slice(afterArrow);
    const prefix = bodyText.slice(0, arrowIdx + 2);
    return prefix + ' {\n' + unpackLine + '\nreturn ' + expr + ';\n}';
  }
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

    // Track string literals
    if (inString) {
      if (ch === inString && text[i - 1] !== '\\') {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    // Track parentheses/brackets depth
    if (ch === '(' || ch === '[' || ch === '<') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '>') {
      depth--;
      continue;
    }

    // Look for `=>` at depth 0
    if (depth === 0 && ch === '=' && text[i + 1] === '>') {
      return i;
    }
  }

  return -1;
}

/**
 * Inject a line into the first `{` block body of a function expression.
 */
function injectIntoBlockBody(bodyText: string, line: string): string {
  const braceIdx = bodyText.indexOf('{');
  if (braceIdx === -1) return bodyText;
  return bodyText.slice(0, braceIdx + 1) + '\n' + line + bodyText.slice(braceIdx + 1);
}

/**
 * Find the body start position of the arrow function that provides the given
 * captured variable as a parameter.
 *
 * Scans backwards from `pos` to find `paramName =>` patterns, then returns
 * the position right after the body opener `(` or `{` where a declaration
 * can be injected.
 *
 * @param text - The body text to scan
 * @param pos - The position to start scanning backwards from
 * @param capturedVarName - The variable name that should be a parameter of the target arrow
 */
function findEnclosingArrowBodyForCapture(text: string, pos: number, capturedVarName: string): number {
  // Scan backwards to find `=> (` or `=> {` patterns
  let i = pos - 1;
  while (i >= 1) {
    // Look for `(` or `{` that follows `=>`
    if (text[i] === '(' || text[i] === '{') {
      let j = i - 1;
      while (j >= 0 && /\s/.test(text[j])) j--;
      if (j >= 1 && text[j] === '>' && text[j - 1] === '=') {
        // Found `=> (` or `=> {` -- check if the parameter list contains capturedVarName
        // Scan backwards past `=>` to find the parameter list
        let paramEnd = j - 2; // before `=>`
        while (paramEnd >= 0 && /\s/.test(text[paramEnd])) paramEnd--;

        // Extract parameter text
        let paramText = '';
        if (text[paramEnd] === ')') {
          // Parenthesized params: find matching `(`
          let depth = 1;
          let pStart = paramEnd - 1;
          while (pStart >= 0 && depth > 0) {
            if (text[pStart] === ')') depth++;
            else if (text[pStart] === '(') depth--;
            pStart--;
          }
          pStart++; // now at opening `(`
          paramText = text.slice(pStart + 1, paramEnd);
        } else if (/\w/.test(text[paramEnd])) {
          // Single identifier param without parens
          let pStart = paramEnd;
          while (pStart > 0 && /\w/.test(text[pStart - 1])) pStart--;
          paramText = text.slice(pStart, paramEnd + 1);
        }

        // Check if capturedVarName is one of the parameters
        const params = paramText.split(',').map(p => p.trim());
        if (params.includes(capturedVarName)) {
          return i + 1; // Position right after `(` or `{`
        }
      }
    }
    i--;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Post-transform import helpers
// ---------------------------------------------------------------------------

/**
 * Parse a body text string and extract all Identifier and JSXIdentifier names.
 * Used to determine which imports a segment body needs after all transforms.
 */
function collectBodyIdentifiers(bodyText: string): Set<string> {
  const ids = new Set<string>();
  try {
    const wrapped = `(${bodyText})`;
    const parsed = parseSync('segment.tsx', wrapped);
    walk(parsed.program, {
      enter(node: any) {
        if (node.type === 'Identifier' && node.name) {
          ids.add(node.name);
        }
        if (node.type === 'JSXIdentifier' && node.name) {
          ids.add(node.name);
        }
      }
    });
  } catch {
    // Fallback: regex-based identifier extraction for capital-letter identifiers
    // (components, namespaces) and known runtime functions
    const identRegex = /\b([A-Z_$][a-zA-Z0-9_$]*)\b/g;
    let match;
    while ((match = identRegex.exec(bodyText)) !== null) {
      ids.add(match[1]);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Options for JSX transformation in segment bodies.
 */
export interface SegmentJsxOptions {
  /** Whether to transform JSX in this segment's body */
  enableJsx: boolean;
  /** Set of imported identifier names (for prop classification) */
  importedNames: Set<string>;
}

/**
 * Info about a nested call site that needs to be rewritten in a segment body.
 */
export interface NestedCallSiteInfo {
  /** The QRL variable name to replace the call site with */
  qrlVarName: string;
  /** Start of the call expression in the ORIGINAL source */
  callStart: number;
  /** End of the call expression in the ORIGINAL source */
  callEnd: number;
  /** Whether this is a JSX $-suffixed attribute extraction (not a $() call) */
  isJsxAttr: boolean;
  /** For JSX attrs: the start of the JSXAttribute node in original source */
  attrStart?: number;
  /** For JSX attrs: the end of the JSXAttribute node in original source */
  attrEnd?: number;
  /** The transformed event prop name (e.g., "q-e:click") for JSX attr rewrites */
  transformedPropName?: string;
  /** For cross-scope loop captures: the symbol name (without q_ prefix) for .w() hoisting */
  hoistedSymbolName?: string;
  /** For cross-scope loop captures: the capture variable names for .w() */
  hoistedCaptureNames?: string[];
  /** Loop-local param names (paramNames minus _, _1 padding and _N gaps) for q:ps injection */
  loopLocalParamNames?: string[];
  /** Unified q:ps params for the entire element (all handlers combined, declaration order) */
  elementQpParams?: string[];
  /** The Qrl-suffixed callee name (e.g., "useTaskQrl") for named markers */
  qrlCallee?: string;
  /** Capture names from the nested extraction (for .w() chaining) */
  captureNames?: string[];
  /** The import source for the Qrl-suffixed callee (for import resolution) */
  importSource?: string;
}

/**
 * Generate the segment module source code for an extracted segment.
 *
 * Output structure:
 * 1. Import lines (only imports the segment references)
 * 2. _captures import (if scope-level captures exist)
 * 3. _auto_ imports (if module-level migration)
 * 4. "//" separator (if imports present)
 * 5. Moved declarations (if any)
 * 6. Nested QRL declarations (if any) + "//" separator
 * 7. `export const {symbolName} = {bodyText};` (with _captures unpacking if needed)
 *
 * @param extraction - The extraction result containing segment info
 * @param nestedQrlDecls - Optional nested QRL declarations (for Plan 04)
 * @param captureInfo - Optional capture/migration info for this segment
 * @param jsxOptions - Optional JSX transform options for segment body
 * @returns The segment module source code string
 */
export function generateSegmentCode(
  extraction: ExtractionResult,
  nestedQrlDecls?: string[],
  captureInfo?: SegmentCaptureInfo,
  jsxOptions?: SegmentJsxOptions,
  nestedCallSites?: NestedCallSiteInfo[],
  importContext?: SegmentImportContext,
  enumValueMap?: Map<string, Map<string, string>>,
): string {
  const parts: string[] = [];

  // Determine which identifiers the segment body actually uses.
  // If we have nested call site rewrites, the body changes -- some
  // original identifiers (like $) may no longer be used while new ones
  // (like qrl) are needed. We'll filter imports after body rewriting.
  // For now, collect all segment imports and filter later.

  // Group imports by source, tracking specifier form for each
  interface SegmentImportSpec {
    localName: string;
    importedName: string; // 'default', '*', or the original exported name
  }
  const importsBySource = new Map<string, SegmentImportSpec[]>();
  for (const imp of extraction.segmentImports) {
    const rewrittenSource = rewriteImportSource(imp.source);
    const existing = importsBySource.get(rewrittenSource);
    const spec: SegmentImportSpec = { localName: imp.localName, importedName: imp.importedName };
    if (existing) {
      if (!existing.some((s) => s.localName === imp.localName)) {
        existing.push(spec);
      }
    } else {
      importsBySource.set(rewrittenSource, [spec]);
    }
  }

  // Emit import statements with correct syntax per import kind
  for (const [source, specs] of importsBySource) {
    const defaultSpec = specs.find((s) => s.importedName === 'default');
    const nsSpec = specs.find((s) => s.importedName === '*');
    const namedSpecs = specs.filter((s) => s.importedName !== 'default' && s.importedName !== '*');

    // Check for import attributes from importContext (e.g., with { type: "json" })
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

    let importStmt: string;
    if (nsSpec) {
      importStmt = `import * as ${nsSpec.localName} from "${source}"${importAttrsSuffix};`;
    } else {
      const specParts: string[] = [];
      if (defaultSpec) specParts.push(defaultSpec.localName);
      if (namedSpecs.length > 0) {
        const namedStr = namedSpecs
          .map((s) =>
            s.importedName !== s.localName ? `${s.importedName} as ${s.localName}` : s.localName,
          )
          .join(', ');
        if (defaultSpec) {
          // default + named: import foo, { bar } from "source";
          specParts.push(`{ ${namedStr} }`);
          importStmt = `import ${specParts.join(', ')} from "${source}"${importAttrsSuffix};`;
        } else {
          importStmt = `import { ${namedStr} } from "${source}"${importAttrsSuffix};`;
        }
      } else if (defaultSpec) {
        importStmt = `import ${defaultSpec.localName} from "${source}"${importAttrsSuffix};`;
      } else {
        importStmt = '';
      }
    }
    if (importStmt) parts.push(importStmt);
  }

  // _captures import (scope-level captures)
  if (captureInfo && captureInfo.captureNames.length > 0) {
    // Check if @qwik.dev/core is already in imports — merge _captures into it
    const qwikCoreImportIdx = parts.findIndex((p) => p.includes('"@qwik.dev/core"'));
    if (qwikCoreImportIdx >= 0) {
      // Merge _captures into the existing @qwik.dev/core import
      const existing = parts[qwikCoreImportIdx];
      // Insert _captures into the named imports
      const braceStart = existing.indexOf('{');
      if (braceStart >= 0) {
        parts[qwikCoreImportIdx] = existing.slice(0, braceStart + 2) + '_captures, ' + existing.slice(braceStart + 2);
      } else {
        // Default import only — add named import
        parts[qwikCoreImportIdx] = existing.replace(' from', ', { _captures } from');
      }
    } else {
      parts.push(`import { _captures } from "@qwik.dev/core";`);
    }
  }

  // _auto_ imports (module-level migration)
  if (captureInfo && captureInfo.autoImports.length > 0) {
    for (const autoImp of captureInfo.autoImports) {
      parts.push(`import { _auto_${autoImp.varName} as ${autoImp.varName} } from "${autoImp.parentModulePath}";`);
    }
  }

  // Separator after imports
  if (parts.length > 0) {
    parts.push('//');
  }

  // Moved declarations (before nested QRL decls and export)
  if (captureInfo && captureInfo.movedDeclarations.length > 0) {
    for (const declText of captureInfo.movedDeclarations) {
      parts.push(declText);
    }
  }

  // Nested QRL declarations (Plan 04)
  if (nestedQrlDecls && nestedQrlDecls.length > 0) {
    // Add qrl import needed by nested QRL declarations
    if (!parts.some(p => p.includes('{ qrl }') || p.includes(', qrl '))) {
      // Insert before separator or at start
      const sepIdx = parts.indexOf('//');
      if (sepIdx >= 0) {
        parts.splice(sepIdx, 0, `import { qrl } from "@qwik.dev/core";`);
      } else {
        parts.push(`import { qrl } from "@qwik.dev/core";`);
        parts.push('//');
      }
    }
    for (const decl of nestedQrlDecls) {
      parts.push(decl);
    }
    parts.push('//');
  }

  // Exported segment body (with _captures unpacking if needed)
  let bodyText = extraction.bodyText;

  // Strip diagnostic comments (@qwik-disable-next-line) from segment bodies
  bodyText = bodyText.replace(/\/\*\s*@qwik-disable-next-line\s+\w+\s*\*\/\s*\n?/g, '');

  // Inline TS enum member references when transpileTs is enabled
  // e.g., Thing.A -> 0, Thing.B -> 1
  if (enumValueMap && enumValueMap.size > 0) {
    for (const [enumName, members] of enumValueMap) {
      for (const [memberName, value] of members) {
        const pattern = new RegExp(`\\b${enumName}\\.${memberName}\\b`, 'g');
        bodyText = bodyText.replace(pattern, value);
      }
    }
  }

  // Apply _rawProps destructuring optimization for component$ extractions
  // Must happen BEFORE nested call rewriting and JSX transform
  const rawPropsResult = applyRawPropsTransform(bodyText);
  if (rawPropsResult !== bodyText) {
    bodyText = rawPropsResult;
    // If _restProps was introduced by the transform, ensure its import is added
    if (bodyText.includes('_restProps(')) {
      const sepIdx = parts.indexOf('//');
      if (!parts.some(p => p.includes('_restProps'))) {
        const imp = `import { _restProps } from "@qwik.dev/core";`;
        if (sepIdx >= 0) {
          parts.splice(sepIdx, 0, imp);
        } else {
          parts.push(imp);
        }
      }
    }
  }

  // Rewrite nested call sites in the body text.
  // Nested $() calls and $-suffixed JSX attrs need to be replaced with QRL variable references.
  if (nestedCallSites && nestedCallSites.length > 0) {
    // Sort by descending start position so replacements don't shift earlier positions
    const sorted = [...nestedCallSites].sort((a, b) => {
      const aStart = a.isJsxAttr ? (a.attrStart ?? a.callStart) : a.callStart;
      const bStart = b.isJsxAttr ? (b.attrStart ?? b.callStart) : b.callStart;
      return bStart - aStart;
    });

    // Body text starts at extraction.argStart in the original source
    const bodyOffset = extraction.argStart;

    // Collect .w() hoisting declarations keyed by position for injection
    const hoistDeclarations: Array<{ position: number; declaration: string }> = [];

    for (const site of sorted) {
      if (site.isJsxAttr && site.attrStart !== undefined && site.attrEnd !== undefined && site.transformedPropName) {
        // Determine the QRL ref name used in the prop value
        const propValueRef = site.hoistedSymbolName ?? site.qrlVarName;

        // JSX $-suffixed attribute: replace entire attribute with transformed prop name and QRL ref
        // e.g., onClick$={() => ...} -> q-e:click={q_symbolName}
        const relStart = site.attrStart - bodyOffset;
        const relEnd = site.attrEnd - bodyOffset;
        if (relStart >= 0 && relEnd <= bodyText.length) {
          bodyText = bodyText.slice(0, relStart) +
            `${site.transformedPropName}={${propValueRef}}` +
            bodyText.slice(relEnd);
        }

        // If this site needs .w() hoisting, find the enclosing map callback body
        // and queue a declaration injection there
        if (site.hoistedSymbolName && site.hoistedCaptureNames && site.hoistedCaptureNames.length > 0) {
          // Find the enclosing arrow function body that provides the captured variable
          // by scanning backwards to find the arrow function with the captured var as param
          const searchStart = relStart;
          const enclosingPos = findEnclosingArrowBodyForCapture(bodyText, searchStart, site.hoistedCaptureNames[0]);
          if (enclosingPos >= 0) {
            const captureList = site.hoistedCaptureNames.join(',\n        ');
            const decl = `const ${site.hoistedSymbolName} = ${site.qrlVarName}.w([\n            ${captureList}\n        ]);`;
            hoistDeclarations.push({ position: enclosingPos, declaration: decl });
          }
        }
      } else {
        // Regular $() call: replace call expression with QRL variable or calleeQrl(qrlVar)
        const relStart = site.callStart - bodyOffset;
        const relEnd = site.callEnd - bodyOffset;
        if (relStart >= 0 && relEnd <= bodyText.length) {
          if (site.qrlCallee) {
            // Named marker (useTask$, useStyles$, etc.) -> calleeQrl(qrlVar)
            let qrlRef = site.qrlVarName;
            if (site.captureNames && site.captureNames.length > 0) {
              qrlRef += '.w([\n        ' + site.captureNames.join(',\n        ') + '\n    ])';
            }
            bodyText = bodyText.slice(0, relStart) + `${site.qrlCallee}(${qrlRef})` + bodyText.slice(relEnd);
          } else {
            // Bare $() call -- replace with QRL variable directly
            bodyText = bodyText.slice(0, relStart) + site.qrlVarName + bodyText.slice(relEnd);
          }
        }
      }
    }

    // Inject .w() hoisting declarations by converting arrow expression bodies to block bodies
    if (hoistDeclarations.length > 0) {
      hoistDeclarations.sort((a, b) => b.position - a.position);
      for (const hoist of hoistDeclarations) {
        const pos = hoist.position;
        // pos is right after `(` or `{` following `=>`
        // Check if this is an expression body (preceded by `=> (`) or block body (`=> {`)
        const charBefore = bodyText[pos - 1];
        if (charBefore === '(') {
          // Expression body: `=> (expr)` -- convert to block body `=> {\ndecl;\nreturn (expr);\n}`
          // Find the matching closing paren for this expression body
          let depth = 1;
          let closeIdx = pos;
          while (closeIdx < bodyText.length && depth > 0) {
            if (bodyText[closeIdx] === '(') depth++;
            else if (bodyText[closeIdx] === ')') depth--;
            closeIdx++;
          }
          closeIdx--; // now at the closing `)`

          // Replace: `(expr)` -> `{\ndecl;\nreturn expr;\n}`
          const exprContent = bodyText.slice(pos, closeIdx).replace(/^\s+/, '');
          const blockBody = `{\n        ${hoist.declaration}\n        return ${exprContent};\n    }`;
          bodyText = bodyText.slice(0, pos - 1) + blockBody + bodyText.slice(closeIdx + 1);
        } else if (charBefore === '{') {
          // Block body: just inject after the opening brace
          bodyText = bodyText.slice(0, pos) +
            '\n        ' + hoist.declaration +
            bodyText.slice(pos);
        }
      }
    }
  }

  if (captureInfo && captureInfo.captureNames.length > 0) {
    bodyText = injectCapturesUnpacking(bodyText, captureInfo.captureNames);
  }

  // JSX transformation in segment body (Phase 4)
  if (jsxOptions?.enableJsx && (bodyText.includes('<') || bodyText.includes('JSX'))) {
    try {
      // Wrap body in expression context for parsing
      const wrappedBody = `(${bodyText})`;
      const bodyParse = parseSync('segment.tsx', wrappedBody);
      const bodyS = new MagicString(wrappedBody);

      // Build set of QRL variable names that have loop-local captures (must be before qpOverrides)
      let qrlsWithCaptures: Set<string> | undefined;
      if (nestedCallSites) {
        const tempSet = new Set<string>();
        for (const site of nestedCallSites) {
          if (site.loopLocalParamNames && site.loopLocalParamNames.length > 0) {
            tempSet.add(site.qrlVarName);
          }
        }
        if (tempSet.size > 0) qrlsWithCaptures = tempSet;
      }

      // Build qpOverrides map: for each JSX element with event handler QRLs,
      // collect the union of loopLocalParamNames from all handlers on that element.
      let qpOverrides: Map<number, string[]> | undefined;
      if (nestedCallSites && nestedCallSites.some(s => s.loopLocalParamNames && s.loopLocalParamNames.length > 0)) {
        qpOverrides = new Map();
        // Build a map from QRL variable name to loopLocalParamNames
        const qrlParamMap = new Map<string, string[]>();
        for (const site of nestedCallSites) {
          if (site.loopLocalParamNames && site.loopLocalParamNames.length > 0) {
            qrlParamMap.set(site.qrlVarName, site.loopLocalParamNames);
          }
        }
        // Walk the parsed body to find JSX elements with q-e:* attributes referencing QRLs
        function walkAst(node: any): void {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach(walkAst); return; }
          if (node.type === 'JSXElement' && node.openingElement) {
            const attrs = node.openingElement.attributes || [];
            const elementParams: string[] = [];
            const seen = new Set<string>();
            for (const attr of attrs) {
              if (attr.type === 'JSXAttribute') {
                // Handle both JSXIdentifier and JSXNamespacedName (q-e:click is namespaced)
                let attrName: string | null = null;
                if (attr.name?.type === 'JSXIdentifier') {
                  attrName = attr.name.name;
                } else if (attr.name?.type === 'JSXNamespacedName') {
                  attrName = `${attr.name.namespace?.name}:${attr.name.name?.name}`;
                }
                if (attrName && (attrName.startsWith('q-e:') || attrName.startsWith('q-ep:') || attrName.startsWith('q-dp:') || attrName.startsWith('q-wp:'))) {
                  // Find the QRL ref in the value
                  if (attr.value?.type === 'JSXExpressionContainer' && attr.value.expression?.type === 'Identifier') {
                    const qrlName = attr.value.expression.name;
                    // Prefer elementQpParams (unified, declaration-ordered) over per-handler params
                    const site = nestedCallSites.find(s => s.qrlVarName === qrlName);
                    if (site?.elementQpParams) {
                      // Use the pre-computed unified params for the whole element
                      for (const p of site.elementQpParams) {
                        if (!seen.has(p)) { seen.add(p); elementParams.push(p); }
                      }
                    } else {
                      const params = qrlParamMap.get(qrlName);
                      if (params) {
                        for (const p of params) {
                          if (!seen.has(p)) { seen.add(p); elementParams.push(p); }
                        }
                      }
                    }
                  }
                }
              }
            }
            if (elementParams.length > 0) {
              qpOverrides!.set(node.start, elementParams);
            }
          }
          for (const key of Object.keys(node)) {
            if (key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
            walkAst(node[key]);
          }
        }
        walkAst(bodyParse.program);
      }

      const jsxResult = transformAllJsx(wrappedBody, bodyS, bodyParse.program, jsxOptions.importedNames,
        undefined, undefined, undefined, true, qpOverrides, qrlsWithCaptures);
      const transformedWrapped = bodyS.toString();
      // Unwrap the parentheses
      bodyText = transformedWrapped.slice(1, -1);

      // Add JSX imports needed by the segment body
      for (const sym of jsxResult.neededImports) {
        // Check if import already exists in parts
        if (!parts.some(p => p.includes(`{ ${sym} }`) || p.includes(`, ${sym}`))) {
          parts.splice(parts.indexOf('//'), 0, `import { ${sym} } from "@qwik.dev/core";`);
        }
      }
      if (jsxResult.needsFragment) {
        if (!parts.some(p => p.includes('_Fragment'))) {
          parts.splice(parts.indexOf('//'), 0, `import { Fragment as _Fragment } from "@qwik.dev/core/jsx-runtime";`);
        }
      }

      // Emit hoisted signal declarations (_hf functions) for segment-level signals
      if (jsxResult.hoistedDeclarations && jsxResult.hoistedDeclarations.length > 0) {
        for (const decl of jsxResult.hoistedDeclarations) {
          // Insert before the export statement (after separator)
          parts.push(decl);
        }
      }
    } catch (err: any) {
      // If JSX parsing fails, use the original body text
      // If JSX parsing/transform fails, use the original body text
    }
  }

  // Transform sync$() calls to _qrlSync() in segment bodies
  if (bodyText.includes('sync$(')) {
    bodyText = bodyText.replace(/\bsync\$\(/g, '_qrlSync(');
    // Ensure _qrlSync import is present
    const syncSepIdx = parts.indexOf('//');
    if (syncSepIdx >= 0 && !parts.some(p => p.includes('_qrlSync'))) {
      parts.splice(syncSepIdx, 0, `import { _qrlSync } from "@qwik.dev/core";`);
    }
  }

  // Ensure correct // separators between sections.
  // Expected layout: [imports] // [qrl-decls] // [hoisted-decls] [export body]
  // Remove all existing separators and rebuild with correct placement.
  const allParts = parts.filter(p => p !== '//');
  const importSection: string[] = [];
  const declSection: string[] = [];
  for (const p of allParts) {
    if (p.startsWith('import ')) {
      importSection.push(p);
    } else {
      declSection.push(p);
    }
  }
  parts.length = 0;
  if (importSection.length > 0) {
    parts.push(...importSection, '//');
  }
  if (declSection.length > 0) {
    // If there are QRL declarations (const q_... = ...), add separator after them
    const qrlDeclEnd = declSection.findLastIndex(p => p.trimStart().startsWith('const q_'));
    if (qrlDeclEnd >= 0) {
      parts.push(...declSection.slice(0, qrlDeclEnd + 1), '//', ...declSection.slice(qrlDeclEnd + 1));
    } else {
      parts.push(...declSection);
    }
  }

  // Rewrite function signature when paramNames has loop/q:p padding pattern
  if (extraction.paramNames.length >= 2 &&
      extraction.paramNames[0] === '_' &&
      extraction.paramNames[1] === '_1') {
    bodyText = rewriteFunctionSignature(bodyText, extraction.paramNames);
  }

  // Post-transform import re-collection: scan the final body text for identifiers
  // that need imports not already in the import list. This catches:
  // - Same-file component references (JSX tags referencing sibling components)
  // - Namespace imports (import * as ns)
  // - Import assertions (with { type: 'json' })
  // - _auto_ migration imports for JSX tags
  // - Self-referential component imports
  // - Qrl-suffixed runtime imports from nested call rewriting
  if (importContext) {
    const bodyIdentifiers = collectBodyIdentifiers(bodyText);

    for (const id of bodyIdentifiers) {
      // Skip if already imported
      let alreadyImported = false;
      for (const specs of importsBySource.values()) {
        if (specs.some(s => s.localName === id)) { alreadyImported = true; break; }
      }
      if (alreadyImported) continue;

      // Skip if already in parts as an import
      if (parts.some(p => p.includes(`{ ${id} }`) || p.includes(`{ ${id},`) || p.includes(`, ${id} }`) || p.includes(`, ${id},`) || p.includes(`as ${id}`) || p.includes(`* as ${id}`))) continue;

      // Check module imports from the parent
      const moduleImp = importContext.moduleImports.find(m => m.localName === id);
      if (moduleImp) {
        const rewrittenSource = rewriteImportSource(moduleImp.source);
        // Build import statement, preserving import attributes if present
        let importStmt: string;
        if (moduleImp.importedName === '*') {
          importStmt = `import * as ${moduleImp.localName} from "${rewrittenSource}";`;
        } else if (moduleImp.importedName === 'default') {
          importStmt = `import ${moduleImp.localName} from "${rewrittenSource}";`;
        } else if (moduleImp.importedName !== moduleImp.localName) {
          importStmt = `import { ${moduleImp.importedName} as ${moduleImp.localName} } from "${rewrittenSource}";`;
        } else {
          importStmt = `import { ${moduleImp.localName} } from "${rewrittenSource}";`;
        }
        // Add import attributes if present (e.g., with { type: "json" })
        if (moduleImp.importAttributes) {
          const attrs = Object.entries(moduleImp.importAttributes)
            .map(([k, v]) => `${k}: "${v}"`)
            .join(', ');
          importStmt = importStmt.replace('";', `" with { ${attrs} };`);
        }
        // Insert before separator
        const sepIdx = parts.indexOf('//');
        if (sepIdx >= 0) {
          parts.splice(sepIdx, 0, importStmt);
        } else {
          parts.unshift(importStmt);
        }
        continue;
      }

      // Check same-file exports (self-referential component imports)
      if (importContext.sameFileExports.has(id)) {
        // Check if this is a migrated variable needing _auto_ import
        // Variables that are already exported from the parent can be imported directly;
        // only non-exported variables need the _auto_ prefix re-export mechanism
        const migrationDecision = importContext.migrationDecisions.find(d => d.varName === id);
        let importStmt: string;
        if (migrationDecision && migrationDecision.action === 'reexport' && !migrationDecision.isExported) {
          importStmt = `import { _auto_${id} as ${id} } from "${importContext.parentModulePath}";`;
        } else {
          importStmt = `import { ${id} } from "${importContext.parentModulePath}";`;
        }
        const sepIdx = parts.indexOf('//');
        if (sepIdx >= 0) {
          parts.splice(sepIdx, 0, importStmt);
        } else {
          parts.unshift(importStmt);
        }
      }
    }

    // Add imports for Qrl-suffixed callees from nested call site rewriting
    // e.g., useTaskQrl from @qwik.dev/core, or custom package Qrl variants
    if (nestedCallSites) {
      const addedQrlCallees = new Set<string>();
      for (const site of nestedCallSites) {
        if (site.qrlCallee && !addedQrlCallees.has(site.qrlCallee)) {
          addedQrlCallees.add(site.qrlCallee);
          // Skip if already imported
          if (parts.some(p => p.includes(site.qrlCallee!))) continue;
          const importSource = getQrlImportSource(site.qrlCallee!, site.importSource);
          const sepIdx = parts.indexOf('//');
          const importStmt = `import { ${site.qrlCallee} } from "${importSource}";`;
          if (sepIdx >= 0) {
            parts.splice(sepIdx, 0, importStmt);
          } else {
            parts.unshift(importStmt);
          }
        }
      }
    } else {
      // Fallback: regex-based detection for Qrl-suffixed runtime imports
      const qrlSuffixRegex = /\b(\w+Qrl)\b/g;
      let qrlMatch;
      while ((qrlMatch = qrlSuffixRegex.exec(bodyText)) !== null) {
        const qrlName = qrlMatch[1];
        if (parts.some(p => p.includes(qrlName))) continue;
        if (qrlName.startsWith('use') || qrlName[0] === qrlName[0].toLowerCase()) {
          const sepIdx = parts.indexOf('//');
          const importStmt = `import { ${qrlName} } from "@qwik.dev/core";`;
          if (sepIdx >= 0) {
            parts.splice(sepIdx, 0, importStmt);
          } else {
            parts.unshift(importStmt);
          }
        }
      }
    }
  }

  parts.push(`export const ${extraction.symbolName} = ${bodyText};`);

  return parts.join('\n');
}

/**
 * Rewrite a function's parameter list to use the given paramNames.
 *
 * Handles arrow functions: `() => body` -> `(_, _1, loopVar) => body`
 * Handles function expressions: `function() { body }` -> `function(_, _1, loopVar) { body }`
 *
 * @param bodyText - The raw function body text
 * @param paramNames - The full parameter list to inject (e.g., ["_", "_1", "item"])
 * @returns Modified body text with rewritten function signature
 */
function rewriteFunctionSignature(bodyText: string, paramNames: string[]): string {
  const paramList = paramNames.join(', ');

  // Try arrow function first: find `=>` and the preceding param list
  const arrowIdx = findArrowIndex(bodyText);
  if (arrowIdx !== -1) {
    // Scan backwards from arrow to find the param list
    let parenEnd = arrowIdx - 1;
    while (parenEnd >= 0 && /\s/.test(bodyText[parenEnd])) parenEnd--;

    if (bodyText[parenEnd] === ')') {
      // Parenthesized params: find matching opening paren
      let depth = 1;
      let parenStart = parenEnd - 1;
      while (parenStart >= 0 && depth > 0) {
        if (bodyText[parenStart] === ')') depth++;
        else if (bodyText[parenStart] === '(') depth--;
        parenStart--;
      }
      parenStart++; // parenStart is now at the opening `(`
      return bodyText.slice(0, parenStart + 1) + paramList + bodyText.slice(parenEnd);
    } else {
      // Single param without parens: e.g., `x => body`
      // Find the start of the identifier
      let identEnd = parenEnd + 1;
      let identStart = parenEnd;
      while (identStart > 0 && /\w/.test(bodyText[identStart - 1])) identStart--;
      return bodyText.slice(0, identStart) + '(' + paramList + ')' + bodyText.slice(identEnd);
    }
  }

  // Try function expression: `function(...) {`
  const funcMatch = bodyText.match(/^(\s*function\s*\w*\s*)\(([^)]*)\)/);
  if (funcMatch) {
    const prefix = funcMatch[1];
    const matchLen = funcMatch[0].length;
    return prefix + '(' + paramList + ')' + bodyText.slice(matchLen);
  }

  return bodyText;
}
