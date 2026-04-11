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
import { rewriteImportSource } from './rewrite-imports.js';
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

    if (nsSpec) {
      parts.push(`import * as ${nsSpec.localName} from "${source}";`);
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
          parts.push(`import ${specParts.join(', ')} from "${source}";`);
        } else {
          parts.push(`import { ${namedStr} } from "${source}";`);
        }
      } else if (defaultSpec) {
        parts.push(`import ${defaultSpec.localName} from "${source}";`);
      }
    }
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

    for (const site of sorted) {
      if (site.isJsxAttr && site.attrStart !== undefined && site.attrEnd !== undefined && site.transformedPropName) {
        // JSX $-suffixed attribute: replace entire attribute with transformed prop name and QRL ref
        // e.g., onClick$={() => ...} -> q-e:click={q_symbolName}
        const relStart = site.attrStart - bodyOffset;
        const relEnd = site.attrEnd - bodyOffset;
        if (relStart >= 0 && relEnd <= bodyText.length) {
          bodyText = bodyText.slice(0, relStart) +
            `${site.transformedPropName}={${site.qrlVarName}}` +
            bodyText.slice(relEnd);
        }
      } else {
        // Regular $() call: replace call expression with QRL variable
        const relStart = site.callStart - bodyOffset;
        const relEnd = site.callEnd - bodyOffset;
        if (relStart >= 0 && relEnd <= bodyText.length) {
          bodyText = bodyText.slice(0, relStart) + site.qrlVarName + bodyText.slice(relEnd);
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
      const jsxResult = transformAllJsx(wrappedBody, bodyS, bodyParse.program, jsxOptions.importedNames);
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
    } catch {
      // If JSX parsing fails, use the original body text
    }
  }

  parts.push(`export const ${extraction.symbolName} = ${bodyText};`);

  return parts.join('\n');
}
