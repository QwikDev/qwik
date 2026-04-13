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
import { walk, getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import { rewriteImportSource } from './rewrite-imports.js';
import { getQrlImportSource, buildSyncTransform, needsPureAnnotation } from './rewrite-calls.js';
import { applyRawPropsTransform, consolidateRawPropsInWCalls, inlineConstCaptures } from './rewrite-parent.js';
import type { ExtractionResult } from './extract.js';
import { transformAllJsx, collectConstIdents } from './jsx-transform.js';

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
  /** Declarations physically moved into the segment, with their import dependencies. */
  movedDeclarations: Array<{ text: string; importDeps: Array<{ localName: string; importedName: string; source: string }> }>;
  /** If true, skip _captures unpacking injection (body already has _captures refs, e.g. inlinedQrl). */
  skipCaptureInjection?: boolean;
  /**
   * Map from original prop field local name to prop key name.
   * When set, these captures have been consolidated into _rawProps.
   * The segment body should replace bare references to these fields with _rawProps.key.
   * e.g., { "foo": "foo", "bindValue": "bind:value" }
   */
  propsFieldCaptures?: Map<string, string>;
  /**
   * Map from captured variable name to its literal source text.
   * When set, these const literal captures are inlined into the segment body
   * and removed from captureNames (matching SWC behavior).
   * e.g., { "STEP_2": "2", "key": "\"A\"" }
   */
  constLiterals?: Map<string, string>;
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
  /** Names that are the default export (export default function Foo) -- need `import { default as Foo }` */
  defaultExportedNames?: Set<string>;
  /** Map from local variable name to its exported name when they differ (e.g., `internal` -> `expr2` for `export { internal as expr2 }`) */
  renamedExports?: Map<string, string>;
  /** The parent module path (e.g., "./test") for self-referential imports */
  parentModulePath: string;
  /** Migration decisions for _auto_ import detection on JSX tags */
  migrationDecisions: Array<{ varName: string; action: string; isExported?: boolean }>;
}

// ---------------------------------------------------------------------------
// Props field reference replacement
// ---------------------------------------------------------------------------

/**
 * Replace bare references to destructured prop field names with _rawProps.field
 * in a segment body. This supports the SWC pattern where inner closures capture
 * the whole _rawProps object instead of individual fields.
 *
 * Uses AST-based replacement to avoid replacing property keys, member expression
 * properties, or other non-reference positions.
 *
 * @param bodyText - The segment body text (arrow function expression)
 * @param fieldMap - Map from local name to prop key name (e.g., "foo" -> "foo", "bindValue" -> "bind:value")
 */
function replacePropsFieldReferences(bodyText: string, fieldMap: Map<string, string>): string {
  // Parse the body as an expression to get proper AST
  const wrappedSource = `(${bodyText})`;
  let parseResult;
  try {
    parseResult = parseSync('__rpf__.tsx', wrappedSource, { experimentalRawTransfer: true } as any);
  } catch {
    return bodyText;
  }
  if (!parseResult.program || parseResult.errors?.length) return bodyText;

  // Collect replacement positions by walking the AST
  const replacements: Array<{ start: number; end: number; key: string; isShorthand?: boolean }> = [];
  const offset = 1; // account for leading `(`

  function walkNode(node: any, parentKey?: string, parentNode?: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Identifier' && fieldMap.has(node.name)) {
      // Skip property keys in object literals
      const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
      // Skip member expression properties (obj.field)
      const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression');
      // Skip function params
      const isParam = parentKey === 'params';
      // Skip variable declarator IDs (e.g., `const test = ...` where test is being re-declared)
      const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
      // Handle shorthand properties: { foo } -> { foo: _rawProps.foo }
      const isShorthandValue = parentKey === 'value' &&
        (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
        parentNode?.shorthand === true;

      if (isShorthandValue) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          key: fieldMap.get(node.name)!,
          isShorthand: true,
        });
      } else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclaratorId) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
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

  // Apply replacements in descending order
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
        // Also check if the captured variable is declared as a local variable
        // inside this arrow body (e.g., `const rowIndex = i + 1;`).
        // The variable is "owned" by this scope if it has a const/let/var declaration.
        const bodyStart = i + 1;
        const bodySlice = text.slice(bodyStart, pos);
        const localDeclPattern = new RegExp(`\\b(?:const|let|var)\\s+${capturedVarName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (localDeclPattern.test(bodySlice)) {
          return bodyStart; // Position right after `(` or `{`
        }
      }
    }
    i--;
  }
  return -1;
}

/**
 * Find the end position (after the semicolon) of a variable declaration
 * for the given variable name, searching forward from startPos.
 *
 * Matches patterns like: `const varName = ...;` or `let varName = ...;`
 *
 * @returns Position right after the semicolon, or -1 if not found
 */
function findVarDeclarationEnd(text: string, startPos: number, varName: string): number {
  // Search for `const varName =` or `let varName =` patterns
  const patterns = [
    new RegExp(`\\b(?:const|let|var)\\s+${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`),
  ];
  for (const pattern of patterns) {
    const searchText = text.slice(startPos);
    const match = pattern.exec(searchText);
    if (match) {
      // Found the declaration. Find the semicolon that ends it.
      const declStart = startPos + match.index;
      const semiIdx = text.indexOf(';', declStart + match[0].length);
      if (semiIdx >= 0) {
        // Return position after the semicolon (and any trailing newline)
        let endPos = semiIdx + 1;
        if (text[endPos] === '\n') endPos++;
        return endPos;
      }
    }
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

    // Find the function node (ArrowFunctionExpression or FunctionExpression)
    // wrapped in an ExpressionStatement inside the program
    let funcNode: any = null;
    walk(parsed.program, {
      enter(node: any) {
        if (!funcNode && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression')) {
          funcNode = node;
        }
      }
    });

    if (funcNode) {
      // Use scope-aware undeclared identifier detection.
      // This correctly handles block-scoped shadowing (catch, switch, labeled, do-while)
      // so locally-declared variables are NOT included.
      const undeclared = getUndeclaredIdentifiersInFunction(funcNode);
      for (const name of undeclared) {
        ids.add(name);
      }
    } else {
      // No function node found -- fall back to collecting all identifiers
      walk(parsed.program, {
        enter(node: any) {
          if (node.type === 'Identifier' && node.name) {
            ids.add(node.name);
          }
        }
      });
    }

    // Also collect JSXIdentifier names (components) which may not be in undeclared list
    walk(parsed.program, {
      enter(node: any) {
        if (node.type === 'JSXIdentifier' && node.name) {
          // Only add uppercase names (component references, not HTML tags)
          if (node.name[0] >= 'A' && node.name[0] <= 'Z') {
            ids.add(node.name);
          }
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
  /** Set of function parameter names (excluded from signal analysis but classified as var) */
  paramNames?: Set<string>;
  /** Relative file path for computing JSX key prefix */
  relPath?: string;
  /** Starting value for the JSX key counter (for continuation across segments) */
  keyCounterStart?: number;
  /** Dev mode options for JSX source info (fileName, lineNumber, columnNumber) */
  devOptions?: { relPath: string };
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
): { code: string; keyCounterValue?: number } {
  const parts: string[] = [];
  let segmentKeyCounterValue: number | undefined;

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
  // Build a set of captured variable names -- these are delivered via _captures,
  // so they should NOT be imported even if they were imports in the parent module.
  const capturedNames = new Set<string>(
    captureInfo ? captureInfo.captureNames : [],
  );

  const importsBySource = new Map<string, SegmentImportSpec[]>();
  for (const imp of extraction.segmentImports) {
    // Skip imports for variables that are delivered via _captures
    if (capturedNames.has(imp.localName)) continue;

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
  // Skip for inlinedQrl (skipCaptureInjection) -- body already references _captures directly
  // and it's already in segmentImports from the parent module.
  if (captureInfo && captureInfo.captureNames.length > 0 && !captureInfo.skipCaptureInjection) {
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
        // Default or namespace import — check for `import * as`
        if (existing.includes('* as')) {
          // Namespace import — cannot merge named imports, add separate import
          parts.push(`import { _captures } from "@qwik.dev/core";`);
        } else {
          // Default import only — add named import
          parts[qwikCoreImportIdx] = existing.replace(' from', ', { _captures } from');
        }
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
    // First, merge import dependencies from moved declarations into the import set
    for (const moved of captureInfo.movedDeclarations) {
      for (const dep of moved.importDeps) {
        const rewrittenSource = rewriteImportSource(dep.source);
        let importLine: string;
        if (dep.importedName === '*') {
          // Namespace import: import * as localName from "source"
          importLine = `import * as ${dep.localName} from "${rewrittenSource}";`;
        } else if (dep.importedName === dep.localName) {
          importLine = `import { ${dep.localName} } from "${rewrittenSource}";`;
        } else {
          importLine = `import { ${dep.importedName} as ${dep.localName} } from "${rewrittenSource}";`;
        }
        // Deduplicate: only add if not already present
        if (!parts.some(p => p.includes(`${dep.localName}`) && p.includes(`"${rewrittenSource}"`))) {
          // Insert before the separator if present
          const sepIdx = parts.indexOf('//');
          if (sepIdx >= 0) {
            parts.splice(sepIdx, 0, importLine);
          } else {
            parts.push(importLine);
          }
        }
      }
    }
    for (const moved of captureInfo.movedDeclarations) {
      parts.push(moved.text);
    }
  }

  // Nested QRL declarations (Plan 04)
  if (nestedQrlDecls && nestedQrlDecls.length > 0) {
    // Add qrl or qrlDEV import needed by nested QRL declarations
    const usesQrlDev = nestedQrlDecls.some(d => d.includes('qrlDEV('));
    const qrlSymbol = usesQrlDev ? 'qrlDEV' : 'qrl';
    if (!parts.some(p => p.includes(`{ ${qrlSymbol} }`) || p.includes(`, ${qrlSymbol} `))) {
      // Insert before separator or at start
      const sepIdx = parts.indexOf('//');
      if (sepIdx >= 0) {
        parts.splice(sepIdx, 0, `import { ${qrlSymbol} } from "@qwik.dev/core";`);
      } else {
        parts.push(`import { ${qrlSymbol} } from "@qwik.dev/core";`);
        parts.push('//');
      }
    }
    // Sort QRL declarations alphabetically to match Rust optimizer ordering
    const sortedDecls = [...nestedQrlDecls].sort((a, b) => {
      // Extract the variable name from "const q_xxx = ..." or similar patterns
      const nameA = a.match(/const\s+(q_\S+)/)?.[1] ?? a;
      const nameB = b.match(/const\s+(q_\S+)/)?.[1] ?? b;
      return nameA.localeCompare(nameB);
    });
    for (const decl of sortedDecls) {
      parts.push(decl);
    }
    parts.push('//');
  }

  // Exported segment body (with _captures unpacking if needed)
  let bodyText = extraction.bodyText;

  // NOTE: @qwik-disable-next-line comment stripping and passive:* attribute stripping are
  // deferred until after nested call site rewriting, because stripping changes text length
  // and would shift the position-based offsets used by the nested call site replacement code.

  // IMPORTANT: Nested call site rewriting MUST happen first, before any text modifications
  // (enum inlining, rawProps transform, etc.) because it uses original source positions.
  // Any text length changes before this would shift the position-based offsets.

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
    // Component-scope .w() declarations collected during iteration, injected after all sites
    let componentScopeWDecls: string[] | undefined;

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
          const capturedVar = site.hoistedCaptureNames[0];
          const enclosingPos = findEnclosingArrowBodyForCapture(bodyText, searchStart, capturedVar);
          // Check if the enclosing arrow is a LOOP callback (nested arrow) vs the
          // component function itself. If enclosingPos points to the top-level function
          // body (< 20 chars from start), the captures are component-scoped and should
          // use the componentScopeWDecls path (placed before return).
          const isLoopCallback = enclosingPos >= 0 && enclosingPos > 20;
          if (isLoopCallback) {
            const captureList = site.hoistedCaptureNames.join(',\n        ');
            const decl = `const ${site.hoistedSymbolName} = ${site.qrlVarName}.w([\n            ${captureList}\n        ]);`;
            // Check ALL captured variables for local declarations and place .w()
            // after the LAST one. This ensures all referenced variables are in scope.
            let latestDeclPos = -1;
            for (const capVar of site.hoistedCaptureNames) {
              const varDeclPos = findVarDeclarationEnd(bodyText, enclosingPos, capVar);
              if (varDeclPos > latestDeclPos) {
                latestDeclPos = varDeclPos;
              }
            }
            const insertPos = latestDeclPos >= 0 ? latestDeclPos : enclosingPos;
            hoistDeclarations.push({ position: insertPos, declaration: decl });
          } else {
            // Captured variable is from the component scope (not a loop parameter).
            // Collect for injection before the return statement (handled after all sites).
            if (!componentScopeWDecls) componentScopeWDecls = [];
            const captureList = site.hoistedCaptureNames.join(',\n        ');
            const decl = `const ${site.hoistedSymbolName} = ${site.qrlVarName}.w([\n        ${captureList}\n    ]);`;
            componentScopeWDecls.push(decl);
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
            const purePrefix = needsPureAnnotation(site.qrlCallee) ? '/*#__PURE__*/ ' : '';
            bodyText = bodyText.slice(0, relStart) + `${purePrefix}${site.qrlCallee}(${qrlRef})` + bodyText.slice(relEnd);
          } else {
            // Bare $() call -- replace with QRL variable directly
            let qrlRef = site.qrlVarName;
            if (site.captureNames && site.captureNames.length > 0) {
              qrlRef += '.w([\n        ' + site.captureNames.join(',\n        ') + '\n    ])';
            }
            bodyText = bodyText.slice(0, relStart) + qrlRef + bodyText.slice(relEnd);
          }
        }
      }
    }

    // Inject .w() hoisting declarations by converting arrow expression bodies to block bodies
    if (hoistDeclarations.length > 0) {
      // SWC groups all .w() declarations in the same scope together, placing them
      // after the last variable declaration any of them depends on. Normalize:
      // find the max position among hoists in similar scope regions and align them.
      if (hoistDeclarations.length > 1) {
        // Group hoists whose positions are "close" (within same arrow body).
        // A simple heuristic: if positions differ by < 200 chars, they're likely
        // in the same scope. Use the max position for all in the group.
        const maxPos = Math.max(...hoistDeclarations.map(h => h.position));
        const minPos = Math.min(...hoistDeclarations.map(h => h.position));
        // Check if all are reasonably close (same arrow body)
        if (maxPos - minPos < 500) {
          for (const h of hoistDeclarations) {
            h.position = maxPos;
          }
        }
      }
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
        } else {
          // Position is in the middle of a block body (e.g., after a variable declaration).
          // Inject the declaration at this position with proper indentation.
          // Detect indentation from the next non-empty line
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
    }

    // Inject component-scope .w() declarations before the return statement
    if (componentScopeWDecls && componentScopeWDecls.length > 0) {
      const returnIdx = bodyText.indexOf('return ');
      if (returnIdx >= 0) {
        // Find the indentation of the return statement
        let lineStart = returnIdx - 1;
        while (lineStart >= 0 && bodyText[lineStart] !== '\n') lineStart--;
        const indent = bodyText.slice(lineStart + 1, returnIdx);
        const declBlock = componentScopeWDecls.join('\n' + indent) + '\n' + indent;
        bodyText = bodyText.slice(0, returnIdx) + declBlock + bodyText.slice(returnIdx);
      }
    }
  }

  // Inline TS enum member references when transpileTs is enabled
  // e.g., Thing.A -> 0, Thing.B -> 1
  // Must happen AFTER nested call site rewriting (which uses original source positions).
  if (enumValueMap && enumValueMap.size > 0) {
    for (const [enumName, members] of enumValueMap) {
      for (const [memberName, value] of members) {
        const pattern = new RegExp(`\\b${enumName}\\.${memberName}\\b`, 'g');
        bodyText = bodyText.replace(pattern, value);
      }
    }
  }

  // Apply _rawProps destructuring optimization for component$ extractions ONLY.
  // Must happen AFTER nested call site rewriting (which uses original source positions)
  // but BEFORE JSX transform (which needs to see _rawProps references).
  // Only component$ callbacks have their first param (props) transformed to _rawProps.
  // Other closures (useTask$, useVisibleTask$, $, etc.) keep their original destructuring.
  const isComponentSegment = extraction.ctxName === 'component$' || extraction.ctxName === 'componentQrl';
  const rawPropsResult = isComponentSegment ? applyRawPropsTransform(bodyText) : bodyText;
  if (rawPropsResult !== bodyText) {
    bodyText = rawPropsResult;
    // Consolidate .w([_rawProps.foo, _rawProps.bar]) -> .w([_rawProps])
    bodyText = consolidateRawPropsInWCalls(bodyText);
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

  // Strip diagnostic comments and passive:* JSX attribute directives from segment bodies.
  // This must happen AFTER nested call site rewriting (above) because that code uses
  // position-based offsets into the original body text, and stripping would shift them.
  bodyText = bodyText.replace(/\/\*\s*@qwik-disable-next-line\s+\w+\s*\*\/\s*\n?/g, '');
  // passive:* is consumed by event prop renaming (q-ep:, q-wp:, q-dp: prefixes).
  // preventdefault:EVENT is stripped when a matching passive:EVENT exists on the same
  // element (passive listeners cannot call preventDefault, so the directive is moot).
  // Strip passive:* and matching preventdefault:* PER-ELEMENT.
  // We can't strip preventdefault:click globally just because passive:click exists on some
  // other element. Process each JSX opening tag separately.
  bodyText = bodyText.replace(/<(\w+)([^>]*?)>/g, (fullMatch, tagName, attrsStr) => {
    // Collect passive events on THIS element
    const elementPassive = new Set<string>();
    for (const m of attrsStr.matchAll(/passive:(\w+)/g)) {
      elementPassive.add(m[1]);
    }
    // Strip passive:* attributes
    let cleaned = attrsStr.replace(/\s*passive:\w+/g, '');
    // Strip preventdefault:EVENT only when matching passive:EVENT exists on same element
    if (elementPassive.size > 0) {
      cleaned = cleaned.replace(/\s*preventdefault:(\w+)/g, (pdFull: string, eventName: string) => {
        return elementPassive.has(eventName) ? '' : pdFull;
      });
    }
    return `<${tagName}${cleaned}>`;
  });

  // When propsFieldCaptures is set, replace bare field references in the body
  // with _rawProps.field references. This supports the SWC behavior where destructured
  // prop fields are consolidated into a single _rawProps capture.
  if (captureInfo?.propsFieldCaptures && captureInfo.propsFieldCaptures.size > 0) {
    bodyText = replacePropsFieldReferences(bodyText, captureInfo.propsFieldCaptures);
  }

  // Inline const literal captures: replace references to const variables with their
  // literal values and remove them from captureNames (matching SWC behavior).
  // e.g., `const STEP_2 = 2` in parent -> inline `2` in child segment body.
  if (captureInfo?.constLiterals && captureInfo.constLiterals.size > 0) {
    bodyText = inlineConstCaptures(bodyText, captureInfo.constLiterals);
    // Filter out inlined names from captureNames
    captureInfo = {
      ...captureInfo,
      captureNames: captureInfo.captureNames.filter(n => !captureInfo!.constLiterals!.has(n)),
    };
  }

  if (captureInfo && captureInfo.captureNames.length > 0 && !captureInfo.skipCaptureInjection) {
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
      // Include both qrlVarName (q_-prefixed) and hoistedSymbolName (no prefix) since
      // the body text uses hoistedSymbolName when event handlers have cross-scope captures.
      let qrlsWithCaptures: Set<string> | undefined;
      if (nestedCallSites) {
        const tempSet = new Set<string>();
        for (const site of nestedCallSites) {
          if (site.loopLocalParamNames && site.loopLocalParamNames.length > 0) {
            tempSet.add(site.qrlVarName);
            if (site.hoistedSymbolName) {
              tempSet.add(site.hoistedSymbolName);
            }
          }
        }
        if (tempSet.size > 0) qrlsWithCaptures = tempSet;
      }

      // Build qpOverrides map: for each JSX element with event handler QRLs,
      // collect the union of loopLocalParamNames from all handlers on that element.
      let qpOverrides: Map<number, string[]> | undefined;
      if (nestedCallSites && nestedCallSites.some(s => s.loopLocalParamNames && s.loopLocalParamNames.length > 0)) {
        qpOverrides = new Map();
        // Build a map from QRL variable name to loopLocalParamNames.
        // Also map hoistedSymbolName since that's what ends up in the body text
        // when event handlers have cross-scope captures (.w() hoisting).
        const qrlParamMap = new Map<string, string[]>();
        for (const site of nestedCallSites) {
          if (site.loopLocalParamNames && site.loopLocalParamNames.length > 0) {
            qrlParamMap.set(site.qrlVarName, site.loopLocalParamNames);
            // The body text uses hoistedSymbolName (no q_ prefix) when present
            if (site.hoistedSymbolName) {
              qrlParamMap.set(site.hoistedSymbolName, site.loopLocalParamNames);
            }
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
                // Match event handler attributes by checking if their VALUE references
                // a known QRL variable name from nestedCallSites.
                // At this point, attributes still have pre-transform names (onClick$, etc.)
                // not post-transform names (q-e:click), so we match on value, not name.
                // Also handle post-transform names (q-e:*) for robustness.
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
                if (isEventAttr) {
                  // Find the QRL ref in the value
                  if (attr.value?.type === 'JSXExpressionContainer' && attr.value.expression?.type === 'Identifier') {
                    const qrlName = attr.value.expression.name;
                    // Prefer elementQpParams (unified, declaration-ordered) over per-handler params
                    // Match by qrlVarName or hoistedSymbolName (body text may use either)
                    const site = nestedCallSites!.find(s => s.qrlVarName === qrlName || s.hoistedSymbolName === qrlName);
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

      // Build constIdents for segment JSX: include const-bound locals from the segment body.
      // Note: QRL variable names (q_xxx) are NOT added to constIdents. SWC's const_idents
      // is collected before JSX transformation, so generated QRL vars aren't in it.
      // This means QRL vars are classified as 'var' by classifyProp, which matches SWC.
      const segConstIdents = collectConstIdents(bodyParse.program);
      // Add capture variable names (they're const-bound via _captures unpacking)
      if (captureInfo?.captureNames) {
        for (const name of captureInfo.captureNames) {
          segConstIdents.add(name);
        }
      }

      const jsxResult = transformAllJsx(wrappedBody, bodyS, bodyParse.program, jsxOptions.importedNames,
        undefined, jsxOptions.devOptions, jsxOptions.keyCounterStart, true, qpOverrides, qrlsWithCaptures, jsxOptions.paramNames, jsxOptions.relPath,
        undefined, segConstIdents);
      segmentKeyCounterValue = jsxResult.keyCounterValue;
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
      // If JSX parsing/transform fails, use the original body text
    }
  }

  // Ensure required imports are present when bodyText references symbols
  // that may have been pre-transformed in parent before segment extraction.
  // This handles cases where JSX transform ran on the parent module and the
  // segment body inherits transformed code with _jsxSorted/_Fragment/etc.
  const coreSymbols = ['_jsxSorted', '_jsxSplit', '_fnSignal', '_wrapProp', '_restProps', '_getVarProps', '_getConstProps'];
  const sepIdx = parts.indexOf('//');
  if (sepIdx >= 0) {
    for (const sym of coreSymbols) {
      if (bodyText.includes(sym) && !parts.some(p => p.startsWith('import') && p.includes(sym))) {
        parts.splice(sepIdx, 0, `import { ${sym} } from "@qwik.dev/core";`);
      }
    }
    if (bodyText.includes('_Fragment') && !parts.some(p => p.startsWith('import') && p.includes('_Fragment'))) {
      parts.splice(parts.indexOf('//'), 0, `import { Fragment as _Fragment } from "@qwik.dev/core/jsx-runtime";`);
    }
  }

  // Transform sync$() calls to _qrlSync() with minified string argument in segment bodies
  if (bodyText.includes('sync$(')) {
    // Replace each sync$(fn) with buildSyncTransform(fn) output: _qrlSync(fn, "minified")
    // Must track paren depth to find the matching closing paren
    let result = '';
    let i = 0;
    while (i < bodyText.length) {
      const syncIdx = bodyText.indexOf('sync$(', i);
      if (syncIdx === -1) {
        result += bodyText.slice(i);
        break;
      }
      // Check word boundary: char before sync$ must not be alphanumeric or underscore
      if (syncIdx > 0) {
        const prevChar = bodyText[syncIdx - 1];
        if (/[\w$]/.test(prevChar)) {
          result += bodyText.slice(i, syncIdx + 6);
          i = syncIdx + 6;
          continue;
        }
      }
      // Append everything before this sync$ call
      result += bodyText.slice(i, syncIdx);
      // Find the matching closing paren for sync$(...)
      const openParen = syncIdx + 5; // index of '(' after 'sync$'
      let depth = 1;
      let j = openParen + 1;
      while (j < bodyText.length && depth > 0) {
        const ch = bodyText[j];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === "'" || ch === '"' || ch === '`') {
          // Skip string/template literals
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
      // j now points one past the closing ')'
      const fnText = bodyText.slice(openParen + 1, j - 1);
      result += buildSyncTransform(fnText);
      i = j;
    }
    bodyText = result;
    // Ensure _qrlSync import is present
    const syncSepIdx = parts.indexOf('//');
    if (syncSepIdx >= 0 && !parts.some(p => p.includes('_qrlSync'))) {
      parts.splice(syncSepIdx, 0, `import { _qrlSync } from "@qwik.dev/core";`);
    }
  }

  // Ensure correct // separators between sections.
  // Expected layout: [imports] // [hoisted-decls (_hf)] // [qrl-decls (const q_)] // [export body]
  // Remove all existing separators and rebuild with correct placement.
  const allParts = parts.filter(p => p !== '//');
  const importSection: string[] = [];
  const hoistedSection: string[] = [];
  const qrlDeclSection: string[] = [];
  const otherDeclSection: string[] = [];
  for (const p of allParts) {
    if (p.startsWith('import ')) {
      importSection.push(p);
    } else if (p.trimStart().startsWith('const q_')) {
      qrlDeclSection.push(p);
    } else if (p.trimStart().startsWith('const _hf') || p.trimStart().startsWith('const _hf')) {
      hoistedSection.push(p);
    } else {
      otherDeclSection.push(p);
    }
  }
  parts.length = 0;
  if (importSection.length > 0) {
    parts.push(...importSection, '//');
  }
  if (hoistedSection.length > 0) {
    parts.push(...hoistedSection);
    // Only add separator after hoisted section if QRL declarations follow
    if (qrlDeclSection.length > 0) {
      parts.push('//');
    }
  }
  if (qrlDeclSection.length > 0) {
    parts.push(...qrlDeclSection, '//');
  }
  if (otherDeclSection.length > 0) {
    parts.push(...otherDeclSection);
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
      // Skip variables delivered via _captures (not imported)
      if (capturedNames.has(id)) continue;

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

        // Skip variables that are moved into this segment -- they're already present
        // as moved declarations, not imports
        if (migrationDecision && migrationDecision.action === 'move') continue;
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

  // Final separator normalization: ensure imports are followed by '//' before body content.
  // Post-transform import re-collection may have added imports without proper separators.
  {
    const finalParts = parts.filter(p => p !== '//');
    const finalImports: string[] = [];
    const finalOther: string[] = [];
    for (const p of finalParts) {
      if (p.startsWith('import ')) {
        finalImports.push(p);
      } else {
        finalOther.push(p);
      }
    }
    parts.length = 0;
    if (finalImports.length > 0) {
      parts.push(...finalImports, '//');
    }
    // Re-insert hoisted (_hf) and qrl (const q_) sections with proper separators
    const hoisted: string[] = [];
    const qrlDecls: string[] = [];
    const rest: string[] = [];
    for (const p of finalOther) {
      if (p.trimStart().startsWith('const _hf')) {
        hoisted.push(p);
      } else if (p.trimStart().startsWith('const q_')) {
        qrlDecls.push(p);
      } else {
        rest.push(p);
      }
    }
    if (hoisted.length > 0) {
      parts.push(...hoisted);
      if (qrlDecls.length > 0) parts.push('//');
    }
    if (qrlDecls.length > 0) {
      parts.push(...qrlDecls, '//');
    }
    parts.push(...rest);
  }

  // Dead const literal elimination: remove `const X = literal;` declarations
  // from the function body when X is no longer referenced elsewhere.
  // This matches SWC behavior: after extracting nested handlers that captured
  // const literal variables, those declarations become dead code in the parent body.
  // Only apply when there are nested call sites (otherwise no consts became dead).
  if (nestedCallSites && nestedCallSites.length > 0) {
    bodyText = removeDeadConstLiterals(bodyText);
  }

  parts.push(`export const ${extraction.symbolName} = ${bodyText};`);

  return { code: parts.join('\n'), keyCounterValue: segmentKeyCounterValue };
}

/**
 * Remove `const X = literal;` declarations from a function body when X is
 * no longer referenced anywhere else in the body.
 *
 * After extracting nested handlers that captured const literal variables
 * (and inlining the literal values into the child segments), those
 * declarations become dead code in the parent body. SWC removes them.
 *
 * Only removes declarations with simple literal initializers (string, number,
 * boolean, null) to ensure no side effects are dropped.
 */
export function removeDeadConstLiterals(bodyText: string): string {
  // Wrap for parsing
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

  // Find the function body statements
  let fnBody: any;
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    fnBody = init.body;
  }
  if (!fnBody || fnBody.type !== 'BlockStatement') return bodyText;

  const offset = 'const __dce__ = '.length;
  const stmts = fnBody.body;
  if (!stmts || stmts.length === 0) return bodyText;

  // Find const declarations with literal initializers
  interface DeadCandidate {
    name: string;
    stmtStart: number; // relative to bodyText
    stmtEnd: number;   // relative to bodyText
  }
  const candidates: DeadCandidate[] = [];

  for (const stmt of stmts) {
    if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
    if (stmt.declarations.length !== 1) continue;
    const d = stmt.declarations[0];
    if (d.id?.type !== 'Identifier') continue;
    const initNode = d.init;
    if (!initNode) continue;
    // Only literal initializers (no side effects)
    const isLiteral = initNode.type === 'StringLiteral' ||
      initNode.type === 'NumericLiteral' ||
      initNode.type === 'BooleanLiteral' ||
      initNode.type === 'NullLiteral' ||
      (initNode.type === 'Literal' && typeof initNode.value !== 'object');
    if (!isLiteral) continue;

    candidates.push({
      name: d.id.name,
      stmtStart: stmt.start - offset,
      stmtEnd: stmt.end - offset,
    });
  }

  if (candidates.length === 0) return bodyText;

  // For each candidate, check if the name appears elsewhere in the body
  // (outside the declaration itself). Use a word-boundary check.
  const toRemove: DeadCandidate[] = [];
  for (const c of candidates) {
    // Remove the declaration text from the body to check references
    const before = bodyText.slice(0, c.stmtStart);
    const after = bodyText.slice(c.stmtEnd);
    const rest = before + after;
    // Check for word-boundary occurrences of the name
    const re = new RegExp(`(?<![\\w$])${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`);
    if (!re.test(rest)) {
      toRemove.push(c);
    }
  }

  if (toRemove.length === 0) return bodyText;

  // Remove declarations from end to start to preserve positions
  toRemove.sort((a, b) => b.stmtStart - a.stmtStart);
  let result = bodyText;
  for (const c of toRemove) {
    // Also consume trailing whitespace/newline
    let end = c.stmtEnd;
    while (end < result.length && (result[end] === '\n' || result[end] === '\r' || result[end] === ';')) {
      end++;
    }
    // Also consume leading whitespace (tabs/spaces on the same line)
    let start = c.stmtStart;
    while (start > 0 && (result[start - 1] === '\t' || result[start - 1] === ' ')) {
      start--;
    }
    result = result.slice(0, start) + result.slice(end);
  }

  return result;
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
export function rewriteFunctionSignature(bodyText: string, paramNames: string[]): string {
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
