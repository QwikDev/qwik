/**
 * Public entry point for the Qwik optimizer.
 *
 * transformModule() accepts TransformModulesOptions and returns TransformOutput,
 * wiring together extraction, capture analysis, variable migration, parent
 * rewriting, and segment codegen into a single public API matching the NAPI
 * binding interface.
 *
 * Implements: API-01, API-02, CAPT-02, CAPT-03
 */

import { parseSync } from 'oxc-parser';
import { walk, getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import MagicString from 'magic-string';
import { extractSegments } from './extract.js';
import { repairInput } from './input-repair.js';
import { rewriteParentModule } from './rewrite-parent.js';
import { generateSegmentCode, type SegmentCaptureInfo, type NestedCallSiteInfo, type SegmentImportContext } from './segment-codegen.js';
import { collectImports, type ImportInfo } from './marker-detection.js';
import { buildQrlDeclaration } from './rewrite-calls.js';
import { resolveEntryField } from './entry-strategy.js';
import { buildQrlDevDeclaration, buildDevFilePath, buildJsxSourceInfo } from './dev-mode.js';
import { isStrippedSegment, generateStrippedSegmentCode } from './strip-ctx.js';
import { analyzeCaptures, collectScopeIdentifiers } from './capture-analysis.js';
import {
  analyzeMigration,
  collectModuleLevelDecls,
  computeSegmentUsage,
  type MigrationDecision,
} from './variable-migration.js';
import type {
  TransformModulesOptions,
  TransformOutput,
  TransformModule,
  SegmentAnalysis,
  SegmentMetadataInternal,
} from './types.js';

// Phase 4: JSX transform modules
import { transformAllJsx, type JsxTransformOutput } from './jsx-transform.js';
import { analyzeSignalExpression, SignalHoister } from './signal-analysis.js';
import { transformEventPropName, isEventProp, collectPassiveDirectives } from './event-handler-transform.js';
import { transformBindProp, isBindProp } from './bind-transform.js';
import { detectLoopContext, findEnclosingLoop, analyzeLoopHandler, generateParamPadding, type LoopContext } from './loop-hoisting.js';

// Phase 13: TS stripping for segment code
import { transformSync as oxcTransformSync } from 'oxc-transform';

// Phase 6: Diagnostics
import {
  emitC02,
  emitC05,
  emitPreventdefaultPassiveCheck,
  classifyDeclarationType,
  parseDisableDirectives,
  filterSuppressedDiagnostics,
} from './diagnostics.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine file extension from a path string.
 */
function getExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx >= 0) return filePath.slice(dotIdx);
  return '';
}

/**
 * Normalize a path to use forward slashes.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Compute relative path from srcDir. If path doesn't start with srcDir,
 * returns the path as-is (normalized).
 */
function computeRelPath(inputPath: string, srcDir: string): string {
  const normInput = normalizePath(inputPath);
  const normSrc = normalizePath(srcDir);

  // If srcDir is "." or empty, just use the input path directly
  if (normSrc === '.' || normSrc === '' || normSrc === './') {
    return normInput;
  }

  // Strip leading srcDir prefix
  const prefix = normSrc.endsWith('/') ? normSrc : normSrc + '/';
  if (normInput.startsWith(prefix)) {
    return normInput.slice(prefix.length);
  }

  return normInput;
}

/**
 * Strip file extension from a path.
 * e.g., "./test.tsx" -> "./test"
 */
function stripExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx >= 0) return filePath.slice(0, dotIdx);
  return filePath;
}

/**
 * Compute the parent module path for segment imports back to the parent module.
 * Segments are always emitted in the same directory as the parent file,
 * so we use only the basename (no directory component), prefixed with "./".
 * e.g., "project/test.tsx" -> "./test", "test.tsx" -> "./test"
 */
function computeParentModulePath(relPath: string, explicitExtensions?: boolean): string {
  // Extract basename: take everything after the last "/"
  const slashIdx = relPath.lastIndexOf('/');
  const basename = slashIdx >= 0 ? relPath.slice(slashIdx + 1) : relPath;
  if (explicitExtensions) {
    // When preserveFilenames/explicitExtensions is enabled, keep the original extension
    return './' + basename;
  }
  const stripped = stripExtension(basename);
  return './' + stripped;
}

/**
 * Compute the output file extension for QRL imports based on transpilation settings.
 * - transpileTs (with or without transpileJsx): .js (TypeScript fully stripped)
 * - transpileJsx only (no transpileTs): .ts (JSX gone, TS remains)
 * - neither: use source extension (.tsx, .ts, etc.)
 */
function computeOutputExtension(
  sourceExt: string,
  transpileTs?: boolean,
  transpileJsx?: boolean,
): string {
  if (transpileTs) return '.js';
  if (transpileJsx) return '.ts';
  return sourceExt; // e.g., '.tsx', '.ts'
}

// ---------------------------------------------------------------------------
// Segment body const replacement and DCE
// ---------------------------------------------------------------------------

/**
 * Qwik import sources that can provide isServer/isBrowser/isDev constants.
 */
const CONST_IMPORT_SOURCES = [
  '@qwik.dev/core',
  '@qwik.dev/core/build',
  '@builder.io/qwik',
  '@builder.io/qwik/build',
  '@builder.io/qwik-city/build',
];

/**
 * Apply isServer/isBrowser const replacement to segment code.
 *
 * Parses the segment code to find imports of isServer/isBrowser from Qwik
 * packages, then replaces all references with boolean literals.
 */
function applySegmentConstReplacement(code: string, filename: string, isServer?: boolean): string {
  if (isServer === undefined) return code;

  let parsed;
  try {
    parsed = parseSync(filename, code, { experimentalRawTransfer: true } as any);
  } catch {
    return code;
  }

  const program = parsed.program;

  // Find const imports: isServer, isBrowser, isDev from Qwik sources
  // Map: localName -> replacement value
  const replacements = new Map<string, string>();
  const importLocalNames = new Set<string>();

  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const source = node.source?.value ?? '';
    if (!CONST_IMPORT_SOURCES.includes(source)) continue;

    for (const spec of node.specifiers || []) {
      if (spec.type !== 'ImportSpecifier') continue;
      const importedName = (spec.imported?.type === 'Identifier' ? spec.imported.name : spec.imported?.value) ?? spec.local?.name;
      const localName = spec.local?.name;
      if (!localName) continue;

      importLocalNames.add(localName);

      if (importedName === 'isServer') {
        replacements.set(localName, String(isServer));
      } else if (importedName === 'isBrowser') {
        replacements.set(localName, String(!isServer));
      }
    }
  }

  if (replacements.size === 0) return code;

  // Apply replacements using MagicString for precise text surgery
  const s = new MagicString(code);

  // Walk AST to replace identifier references
  const importRanges = new Set<string>();
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers || []) {
        importRanges.add(`${spec.local.start}:${spec.local.end}`);
      }
    }
  }

  walk(program, {
    enter(node: any, parent: any) {
      if (node.type !== 'Identifier') return;
      const replacement = replacements.get(node.name);
      if (replacement === undefined) return;

      // Skip import declaration identifiers
      if (importRanges.has(`${node.start}:${node.end}`)) return;
      // Skip property access (obj.isServer)
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
      // Skip variable declarator id
      if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
      // Skip import specifier imported name
      if (parent?.type === 'ImportSpecifier' && parent.imported === node) return;

      s.overwrite(node.start, node.end, replacement);
    },
  });

  return s.toString();
}

/**
 * Apply dead code elimination to segment code.
 *
 * Handles:
 * - `if (false) { ... }` -> removed entirely
 * - `if (false) { ... } else { ... }` -> keeps else body
 * - `if (true) { ... }` -> keeps body, drops condition
 * - `if (true) { ... } else { ... }` -> keeps if body, drops else
 * - Nested braces handled correctly via brace depth tracking
 */
function applySegmentDCE(code: string): string {
  // Process if(false) and if(true) patterns iteratively until no more changes
  let result = code;
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 10) {
    changed = false;
    iterations++;

    // Match if(false) or if(true) with proper brace tracking
    const ifPattern = /\bif\s*\(\s*(true|false)\s*\)\s*\{/g;
    let match;
    const replacements: Array<{ start: number; end: number; replacement: string }> = [];

    while ((match = ifPattern.exec(result)) !== null) {
      const condValue = match[1] === 'true';
      const braceStart = match.index + match[0].length - 1; // position of opening {

      // Find matching closing brace
      const closeIdx = findMatchingBrace(result, braceStart);
      if (closeIdx === -1) continue;

      const ifBody = result.slice(braceStart + 1, closeIdx);

      // Check for else clause
      let elseBody: string | null = null;
      let totalEnd = closeIdx + 1;
      const afterClose = result.slice(closeIdx + 1).match(/^\s*else\s*\{/);
      if (afterClose) {
        const elseBraceStart = closeIdx + 1 + afterClose[0].length - 1;
        const elseCloseIdx = findMatchingBrace(result, elseBraceStart);
        if (elseCloseIdx !== -1) {
          elseBody = result.slice(elseBraceStart + 1, elseCloseIdx);
          totalEnd = elseCloseIdx + 1;
        }
      }

      let replacement: string;
      if (condValue) {
        // if (true) { body } -> body
        // if (true) { body } else { ... } -> body
        replacement = ifBody;
      } else {
        // if (false) { ... } -> removed
        // if (false) { ... } else { body } -> body
        replacement = elseBody ?? '';
      }

      replacements.push({ start: match.index, end: totalEnd, replacement: replacement.trim() });
    }

    // Apply replacements in reverse order to preserve positions
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i];
      result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
      changed = true;
    }
  }

  // Simplify logical AND/OR expressions with boolean literals
  // `true && expr` -> `expr`
  // `false && expr` -> `false`
  // `true || expr` -> `true`
  // `false || expr` -> `expr`
  // Only replace when NOT inside a string literal (check that the match position
  // is not within quotes by counting unescaped quotes before the match)
  result = result.replace(/\btrue\s*&&\s*/g, (match, offset) => {
    if (isInsideString(result, offset)) return match;
    return '';
  });
  result = result.replace(/\bfalse\s*\|\|\s*/g, (match, offset) => {
    if (isInsideString(result, offset)) return match;
    return '';
  });

  // `false && expr` needs to replace the whole expression with `false`
  // This is trickier because we need to find the end of the expression.
  // For JSX contexts like `{false && <p>...</p>}`, use brace tracking.
  result = simplifyFalseAndExpressions(result);

  // Clean up blank lines left by DCE
  result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

  return result;
}

/**
 * Check if a position in source text is inside a string literal.
 * Handles escaped quotes (including double-escaped \\") and template expressions.
 */
function isInsideString(text: string, offset: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let templateDepth = 0; // track ${...} nesting inside template literals
  for (let i = 0; i < offset; i++) {
    const ch = text[i];
    // Count consecutive backslashes before this char to handle \\, \\\\, etc.
    if (ch === '\\' && (inSingle || inDouble || (inTemplate && templateDepth === 0))) {
      i++; // skip the next character (it's escaped)
      continue;
    }
    if (inTemplate && templateDepth > 0) {
      // Inside a ${...} expression — track brace nesting
      if (ch === '{') templateDepth++;
      else if (ch === '}') templateDepth--;
      continue;
    }
    if (inTemplate && ch === '$' && text[i + 1] === '{') {
      templateDepth = 1;
      i++; // skip the '{'
      continue;
    }
    if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
    else if (ch === '`' && !inSingle && !inDouble) inTemplate = !inTemplate;
  }
  return inSingle || inDouble || (inTemplate && templateDepth === 0);
}

/**
 * Find the matching closing brace for an opening brace, handling nesting.
 */
function findMatchingBrace(text: string, openPos: number): number {
  let depth = 1;
  let inString: string | null = null;
  let i = openPos + 1;

  while (i < text.length && depth > 0) {
    const ch = text[i];

    // Track string literals
    if (inString) {
      if (ch === inString && text[i - 1] !== '\\') {
        inString = null;
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') depth--;

    if (depth === 0) return i;
    i++;
  }
  return -1;
}

/**
 * Simplify `false && expr` patterns in code.
 *
 * In JSX contexts like `{false && <p>...</p>}`, replaces the entire
 * expression with just `false`. Uses brace/angle tracking for JSX.
 */
function simplifyFalseAndExpressions(code: string): string {
  const pattern = /\bfalse\s*&&\s*/g;
  let match;
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  while ((match = pattern.exec(code)) !== null) {
    const exprStart = match.index + match[0].length;
    // Find the end of the right-hand expression
    const exprEnd = findExpressionEnd(code, exprStart);
    if (exprEnd > exprStart) {
      replacements.push({ start: match.index, end: exprEnd, replacement: 'false' });
    }
  }

  if (replacements.length === 0) return code;

  let result = code;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
  }
  return result;
}

/**
 * Find the end of a JSX/JS expression starting at the given position.
 * Handles JSX tags, parentheses, function calls, etc.
 */
function findExpressionEnd(code: string, start: number): number {
  let i = start;
  let depth = 0; // tracks <> and () and {} nesting
  let inString: string | null = null;
  let angleBraceDepth = 0;
  let parenDepth = 0;
  let curlyDepth = 0;

  while (i < code.length) {
    const ch = code[i];

    if (inString) {
      if (ch === inString && code[i - 1] !== '\\') inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; i++; continue; }

    if (ch === '(') { parenDepth++; i++; continue; }
    if (ch === ')') {
      if (parenDepth === 0) return i;
      parenDepth--; i++; continue;
    }
    if (ch === '{') { curlyDepth++; i++; continue; }
    if (ch === '}') {
      if (curlyDepth === 0) return i;
      curlyDepth--; i++; continue;
    }
    if (ch === '<') {
      // Check for JSX closing tag or self-closing
      if (code[i + 1] === '/') {
        // Closing tag: find matching >
        const closeEnd = code.indexOf('>', i);
        if (closeEnd >= 0 && angleBraceDepth > 0) {
          angleBraceDepth--;
          i = closeEnd + 1;
          if (angleBraceDepth === 0 && parenDepth === 0 && curlyDepth === 0) return i;
          continue;
        }
      }
      // Opening tag
      angleBraceDepth++;
      // Scan to end of opening tag
      let j = i + 1;
      let tagCurly = 0;
      while (j < code.length) {
        if (code[j] === '{') tagCurly++;
        else if (code[j] === '}') tagCurly--;
        else if (code[j] === '>' && tagCurly === 0) {
          // Check for self-closing />
          if (code[j - 1] === '/') {
            angleBraceDepth--;
            i = j + 1;
            if (angleBraceDepth === 0 && parenDepth === 0 && curlyDepth === 0) return i;
          } else {
            i = j + 1;
          }
          break;
        }
        j++;
      }
      if (j >= code.length) return code.length;
      continue;
    }

    // At top level (no nesting), stop at expression-ending characters
    if (angleBraceDepth === 0 && parenDepth === 0 && curlyDepth === 0) {
      if (ch === '\n' || ch === ';' || ch === ',') return i;
    }

    i++;
  }
  return i;
}

/**
 * Apply side-effect simplification to segment code.
 *
 * Transforms unused variable declarations in segment bodies:
 * - `const x = expr.prop;` -> `expr.prop;` (member expression, x unused)
 * - `const x = a + b;` -> `a, b;` (binary expression, x unused -- extract operand refs)
 * - `const x = fn();` -> `fn();` (call expression, x unused)
 *
 * Only applied to the export body section, not to imports or QRL declarations.
 */
function applySegmentSideEffectSimplification(code: string, filename: string): string {
  // Find the export line to only process the body
  const exportMatch = code.match(/^export const \w+ = /m);
  if (!exportMatch) return code;

  const exportStart = code.indexOf(exportMatch[0]);
  const beforeExport = code.slice(0, exportStart);
  const exportSection = code.slice(exportStart);

  // Parse the body to find unused variable declarations
  let parsed;
  try {
    parsed = parseSync(filename, exportSection, { experimentalRawTransfer: true } as any);
  } catch {
    return code;
  }

  // Collect all identifier references in the body
  const allRefs = new Map<string, number>();
  const varDecls: Array<{
    name: string;
    initStart: number;
    initEnd: number;
    declStart: number;
    declEnd: number;
    initType: string;
    initText: string;
  }> = [];

  walk(parsed.program, {
    enter(node: any, parent: any) {
      if (node.type === 'Identifier' && node.name) {
        // Skip if this is a variable declarator id
        if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
        // Skip import specifiers
        if (parent?.type === 'ImportSpecifier') return;

        allRefs.set(node.name, (allRefs.get(node.name) ?? 0) + 1);
      }

      // Collect const variable declarations
      if (node.type === 'VariableDeclaration' && node.kind === 'const') {
        for (const declarator of node.declarations) {
          if (declarator.id?.type === 'Identifier' && declarator.init) {
            // Get the containing statement
            const stmtNode = node;
            if (node.declarations?.length > 1) continue; // skip multi-declarator

            varDecls.push({
              name: declarator.id.name,
              initStart: declarator.init.start,
              initEnd: declarator.init.end,
              declStart: stmtNode.start,
              declEnd: stmtNode.end,
              initType: declarator.init.type,
              initText: exportSection.slice(declarator.init.start, declarator.init.end),
            });
          }
        }
      }
    },
  });

  // Find truly unused variable declarations (name referenced 0 times outside its declaration)
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  for (const decl of varDecls) {
    const refCount = allRefs.get(decl.name) ?? 0;
    if (refCount > 0) continue; // Variable is referenced somewhere

    // Skip class declarations and function declarations
    if (decl.initType === 'ClassExpression' || decl.initType === 'FunctionExpression' ||
        decl.initType === 'ArrowFunctionExpression') continue;

    // Skip the export const symbolName declaration itself
    if (exportSection.includes(`export const ${decl.name} =`)) continue;

    let replacement: string;

    if (decl.initType === 'MemberExpression' || decl.initType === 'CallExpression' ||
        decl.initType === 'Identifier') {
      // Simple expression: drop const, keep as expression statement
      replacement = decl.initText + ';';
    } else if (decl.initType === 'BinaryExpression') {
      // Binary expression: extract unique identifier operands as comma expression
      const operandIds = extractBinaryOperandIdentifiers(decl.initText);
      if (operandIds.length > 0) {
        replacement = operandIds.join(', ') + ';';
      } else {
        replacement = decl.initText + ';';
      }
    } else {
      continue; // Don't simplify other types
    }

    replacements.push({ start: decl.declStart, end: decl.declEnd, replacement });
  }

  if (replacements.length === 0) return code;

  // Apply replacements in reverse order
  let result = exportSection;
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
  }

  return beforeExport + result;
}

/**
 * Extract unique top-level identifier references from a binary expression text.
 * e.g., "ident1 + ident3" -> ["ident1", "ident3"]
 */
function extractBinaryOperandIdentifiers(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const idRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let match;
  while ((match = idRegex.exec(text)) !== null) {
    const name = match[1];
    // Skip keywords
    if (['const', 'let', 'var', 'new', 'typeof', 'void', 'delete', 'true', 'false', 'null', 'undefined'].includes(name)) continue;
    if (!seen.has(name)) {
      seen.add(name);
      ids.push(name);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Import cleanup
// ---------------------------------------------------------------------------

/**
 * Qwik package prefixes whose imports should never be removed.
 * These may have been added by the rewriter and are always needed.
 */
const QWIK_IMPORT_PREFIXES = [
  '@qwik.dev/',
  '@builder.io/qwik',
];

/**
 * Remove unused non-Qwik imports from a rewritten parent module.
 *
 * After extraction moves closures into segments, some imports in the parent
 * module may no longer be referenced. This function re-parses the rewritten
 * code, identifies which import specifiers are unreferenced in the remaining
 * body, and removes them.
 *
 * Safety rules:
 * - Never removes Qwik imports (they may have been added by the rewriter)
 * - Never removes side-effect imports (`import 'module'` with no specifiers)
 * - Never removes namespace imports (`import * as ns from '...'`)
 * - Only removes named specifiers whose local name has zero references outside imports
 *
 * @param code - The rewritten parent module source code
 * @param filename - Filename for parser (determines language)
 * @returns Cleaned code with unused imports removed
 */
function removeUnusedImports(code: string, filename: string, transpileJsx?: boolean): string {
  let parsed;
  try {
    parsed = parseSync(filename, code, { experimentalRawTransfer: true } as any);
  } catch {
    // If parsing fails, return code unchanged
    return code;
  }

  const program = parsed.program;

  // 1. Collect all import declarations and their specifiers
  interface ImportSpec {
    localName: string;
    node: any; // The ImportDeclaration node
    specIndex: number;
    specNode: any;
  }

  const importSpecs: ImportSpec[] = [];
  const importNodes: any[] = [];

  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    // Skip side-effect imports (no specifiers)
    if (!node.specifiers || node.specifiers.length === 0) continue;

    // Note: We intentionally do NOT skip Qwik imports entirely. After rewriting,
    // unreferenced non-marker specifiers (e.g., onRender) should still be removed.
    // But we DO skip $-suffixed specifiers in Qwik imports (they may have been
    // preserved intentionally in the surviving user import to match Rust behavior).

    importNodes.push(node);

    for (let i = 0; i < node.specifiers.length; i++) {
      const spec = node.specifiers[i];

      const localName = spec.local?.name;
      if (localName) {
        importSpecs.push({ localName, node, specIndex: i, specNode: spec });
      }
    }
  }

  if (importSpecs.length === 0) return code;

  // 2. Collect all Identifier references in the non-import part of the AST
  const referencedNames = new Set<string>();
  walk(program, {
    enter(node: any, parent: any) {
      // Skip import declaration subtrees (use this.skip() to prevent walking children)
      if (node.type === 'ImportDeclaration') {
        this.skip();
        return;
      }

      if ((node.type === 'Identifier' || node.type === 'JSXIdentifier') && node.name) {
        // Skip property keys in non-shorthand object properties
        if (
          parent?.type === 'Property' &&
          parent.key === node &&
          !parent.shorthand &&
          !parent.computed
        ) {
          return;
        }
        // Skip member expression property names (obj.prop -- skip prop)
        if (
          parent?.type === 'MemberExpression' &&
          parent.property === node &&
          !parent.computed
        ) {
          return;
        }
        referencedNames.add(node.name);
      }
    },
  });

  // 3. Find unreferenced import specifiers
  // For surviving user Qwik imports (single-quoted, from original source):
  // - If ALL specifiers are unreferenced: preserve the entire import (Rust behavior)
  // - If SOME specifiers are referenced: normal cleanup (remove unreferenced)
  const unreferencedSpecs = importSpecs.filter((spec) => {
    if (referencedNames.has(spec.localName)) return false;

    // Check if this is a single-quoted Qwik import (surviving user import)
    const importSource = spec.node.source?.value ?? '';
    const isQwikImport = QWIK_IMPORT_PREFIXES.some((p) => importSource.startsWith(p));
    if (isQwikImport && !transpileJsx) {
      const quoteChar = code[spec.node.source.start];
      if (quoteChar === "'") {
        // When transpileJsx is OFF (default), the Rust optimizer preserves
        // single-quoted Qwik imports that have non-$-suffixed specifiers
        // even when all specifiers are unreferenced in the parent body.
        // When transpileJsx is ON, the optimizer removes them.
        const siblings = importSpecs.filter((s) => s.node === spec.node);
        const allUnreferenced = siblings.every((s) => !referencedNames.has(s.localName));
        const hasNonDollarSpec = (spec.node.specifiers ?? []).some((s: any) => {
          if (s.type !== 'ImportSpecifier') return true;
          const importedName = s.imported?.name ?? s.local?.name ?? '';
          return !importedName.endsWith('$');
        });
        if (allUnreferenced && hasNonDollarSpec) {
          return false; // preserve entire import when it has non-$ specifiers
        }
      }
    }

    return true;
  });

  if (unreferencedSpecs.length === 0) return code;

  // 4. Remove unreferenced imports using magic-string
  const ms = new MagicString(code);

  // Group unreferenced specs by their parent import node
  const specsByNode = new Map<any, ImportSpec[]>();
  for (const spec of unreferencedSpecs) {
    const existing = specsByNode.get(spec.node) ?? [];
    existing.push(spec);
    specsByNode.set(spec.node, existing);
  }

  for (const [node, specs] of specsByNode) {
    const totalSpecs = node.specifiers?.length ?? 0;
    const unreferencedCount = specs.length;

    if (unreferencedCount >= totalSpecs) {
      // All specifiers are unreferenced: remove entire import declaration
      let end = node.end;
      if (end < code.length && code[end] === '\n') end++;
      ms.overwrite(node.start, end, '');
    } else {
      // Only some specifiers are unreferenced: rebuild the import
      const unreferencedNames = new Set(specs.map((s) => s.localName));
      const keptParts: string[] = [];
      let defaultPart = '';
      let nsPart = '';

      for (const spec of node.specifiers ?? []) {
        const localName = spec.local?.name;
        if (unreferencedNames.has(localName)) continue;

        if (spec.type === 'ImportDefaultSpecifier') {
          defaultPart = localName;
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          nsPart = `* as ${localName}`;
        } else {
          const importedName = spec.imported?.name ?? localName;
          if (importedName !== localName) {
            keptParts.push(`${importedName} as ${localName}`);
          } else {
            keptParts.push(localName);
          }
        }
      }

      let importParts = '';
      if (nsPart) {
        importParts = defaultPart ? `${defaultPart}, ${nsPart}` : nsPart;
      } else if (keptParts.length > 0) {
        importParts = defaultPart
          ? `${defaultPart}, { ${keptParts.join(', ')} }`
          : `{ ${keptParts.join(', ')} }`;
      } else if (defaultPart) {
        importParts = defaultPart;
      }

      const sourceValue = node.source?.value ?? '';
      const quote = code[node.source.start] === "'" ? "'" : '"';
      const newImport = `import ${importParts} from ${quote}${sourceValue}${quote};`;
      let end = node.end;
      if (end < code.length && code[end] === '\n') end++;
      ms.overwrite(node.start, end, newImport + '\n');
    }
  }

  return ms.toString();
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Transform Qwik source modules by extracting segments, rewriting the parent
 * module, and generating segment module code.
 *
 * This is the public API consumed by the Qwik Vite plugin, matching the NAPI
 * binding interface.
 *
 * @param options - Transform options including input files and configuration
 * @returns TransformOutput with parent and segment modules, diagnostics, and flags
 */
export function transformModule(options: TransformModulesOptions): TransformOutput {
  const allModules: TransformModule[] = [];
  const diagnostics: import('./types.js').Diagnostic[] = [];
  let isTypeScript = false;
  let isJsx = false;

  for (const input of options.input) {
    const relPath = computeRelPath(input.path, options.srcDir);
    const ext = getExtension(relPath);

    // Detect language flags
    if (ext === '.ts' || ext === '.tsx') isTypeScript = true;
    if (ext === '.tsx' || ext === '.jsx') isJsx = true;

    // 0. Repair input if oxc-parser cannot parse it (SWC-recoverable errors)
    const repairedCode = repairInput(input.code, relPath);

    // 1. Extract segments
    const willTranspileJsx = options.transpileJsx !== false && (ext === '.tsx' || ext === '.jsx');
    const extractions = extractSegments(repairedCode, relPath, options.scope, willTranspileJsx);

    // 1a. No-extraction passthrough: if no $() markers found AND no JSX transpilation
    // needed, preserve source as-is with only a `//` separator between imports and body.
    // This avoids import stripping or unused import removal for files with no Qwik
    // markers (e.g., issue_476, should_ignore_null_inlined_qrl).
    const earlyTranspileJsx = options.transpileJsx !== false;
    const needsJsxTransform = earlyTranspileJsx && (ext === '.tsx' || ext === '.jsx');
    if (extractions.length === 0 && !needsJsxTransform) {
      const { program: passProgram } = parseSync(relPath, repairedCode, { experimentalRawTransfer: true } as any);
      const passS = new MagicString(repairedCode);

      // Find the end of the last import declaration
      let lastImportEnd = -1;
      for (const node of passProgram.body) {
        if (node.type === 'ImportDeclaration') {
          let end = node.end;
          // Include trailing newline if present
          if (end < repairedCode.length && repairedCode[end] === '\n') end++;
          lastImportEnd = end;
        }
      }

      // Strip unused variable bindings wrapping inlinedQrl(null, ...) calls.
      // These are pre-processed QRL calls that should pass through, but the
      // Rust optimizer strips `const foo = ` when foo is unreferenced.
      const bodyReferencedNames = new Set<string>();
      for (const stmt of passProgram.body) {
        if (stmt.type === 'ImportDeclaration') continue;
        if (stmt.type !== 'VariableDeclaration') {
          // Collect all identifiers referenced in non-variable statements
          walk(stmt, {
            enter(node: any) {
              if (node.type === 'Identifier' && node.name) {
                bodyReferencedNames.add(node.name);
              }
            },
          });
        }
      }

      for (const stmt of passProgram.body) {
        if (stmt.type !== 'VariableDeclaration') continue;
        if (stmt.declarations?.length !== 1) continue;
        const declarator = stmt.declarations[0];
        if (!declarator.init) continue;
        // Check if init is an inlinedQrl(...) call
        const init = declarator.init;
        if (init.type !== 'CallExpression') continue;
        const callee = init.callee;
        if (callee?.type !== 'Identifier' || callee.name !== 'inlinedQrl') continue;
        // Check if variable name is unreferenced
        const varName = declarator.id?.type === 'Identifier' ? declarator.id.name : null;
        if (!varName) continue;
        if (!bodyReferencedNames.has(varName)) {
          // Strip `const/let/var varName = ` prefix, keeping the init expression
          passS.remove(stmt.start, init.start);
        }
      }

      // Insert // separator
      if (lastImportEnd >= 0) {
        // Remove blank lines between last import and body, insert //
        let bodyStart = lastImportEnd;
        while (bodyStart < repairedCode.length && repairedCode[bodyStart] === '\n') {
          bodyStart++;
        }
        if (bodyStart > lastImportEnd) {
          passS.overwrite(lastImportEnd, bodyStart, '//\n');
        } else {
          passS.appendRight(lastImportEnd, '//\n');
        }
      } else {
        passS.prepend('//\n');
      }

      const parentModule: TransformModule = {
        path: relPath,
        isEntry: false,
        code: passS.toString(),
        map: null,
        segment: null,
        origPath: input.path,
      };
      allModules.push(parentModule);
      continue;
    }

    // 2. Collect imports for parent rewriting (need to re-parse for the import map)
    const { program } = parseSync(relPath, repairedCode, { experimentalRawTransfer: true } as any);
    const originalImports = collectImports(program);

    // Build importedNames set for capture analysis (excludes from captures)
    const importedNames = new Set<string>();
    for (const [localName] of originalImports) {
      importedNames.add(localName);
    }

    // 2a. Run capture analysis for each extraction
    // First, collect module-level scope identifiers for top-level capture analysis
    const moduleScopeIds = collectScopeIdentifiers(program, repairedCode, relPath);

    // Pre-parse each extraction's body to get closure AST nodes, and collect
    // scope identifiers from each body (needed for nested capture analysis)
    const closureNodes = new Map<string, any>(); // symbolName -> closureNode
    const bodyScopeIds = new Map<string, Set<string>>(); // symbolName -> scope ids from body

    for (const extraction of extractions) {
      try {
        const wrappedBody = `(${extraction.bodyText})`;
        const bodyParse = parseSync('segment.tsx', wrappedBody);
        const exprStmt = bodyParse.program.body[0];
        let closureNode =
          exprStmt?.type === 'ExpressionStatement' ? exprStmt.expression : null;

        // Unwrap ParenthesizedExpression (from the wrapping parentheses)
        while (closureNode?.type === 'ParenthesizedExpression') {
          closureNode = closureNode.expression;
        }

        if (closureNode && (closureNode.type === 'ArrowFunctionExpression' || closureNode.type === 'FunctionExpression')) {
          closureNodes.set(extraction.symbolName, closureNode);
          // Collect scope identifiers from this closure's body (for nested captures)
          const bodyIds = collectScopeIdentifiers(closureNode, extraction.bodyText, 'segment.tsx');
          bodyScopeIds.set(extraction.symbolName, bodyIds);
        }
      } catch {
        // If parsing fails, skip
      }
    }

    // Now run capture analysis with the correct parent scope for each extraction.
    // Nesting is determined later (Step 3 in rewriteParentModule), but we can
    // detect it here using range containment to find the enclosing extraction.
    for (const extraction of extractions) {
      const closureNode = closureNodes.get(extraction.symbolName);
      if (!closureNode) continue;

      // Find enclosing extraction (if nested) using range containment
      let enclosingExt: typeof extractions[0] | null = null;
      for (const other of extractions) {
        if (other.symbolName === extraction.symbolName) continue;
        if (extraction.callStart >= other.argStart && extraction.callEnd <= other.argEnd) {
          // Pick the tightest enclosing extraction
          if (!enclosingExt || (other.argStart >= enclosingExt.argStart && other.argEnd <= enclosingExt.argEnd)) {
            enclosingExt = other;
          }
        }
      }

      // Build parent scope identifiers
      let parentScopeIds: Set<string>;
      if (enclosingExt) {
        // Nested: parent scope is the enclosing extraction's body scope
        parentScopeIds = bodyScopeIds.get(enclosingExt.symbolName) ?? new Set();
      } else {
        // Top-level: parent scope is module-level identifiers
        parentScopeIds = moduleScopeIds;
      }

      // For inlinedQrl extractions, populate captureNames from the explicit captures
      // array argument. Extract identifier names only (non-identifiers like `true` are
      // capture slots but not named captures for metadata purposes).
      if (extraction.isInlinedQrl) {
        if (extraction.explicitCaptures) {
          const items = extraction.explicitCaptures
            .replace(/^\[/, '').replace(/\]$/, '')
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          // Only identifiers become captureNames (not literals like true, false, null, numbers)
          const identCaptures = items.filter(s => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s) && s !== 'true' && s !== 'false' && s !== 'null' && s !== 'undefined');
          extraction.captureNames = identCaptures;
          extraction.captures = identCaptures.length > 0;
        }
        continue;
      }

      const result = analyzeCaptures(closureNode, parentScopeIds, importedNames);
      extraction.captureNames = result.captureNames;
      extraction.paramNames = result.paramNames;
      extraction.captures = result.captures;

      // Reconcile captures with paramNames: when captures are injected as
      // function parameters (Rust's _auto_ pattern), the captures flag is false
      // because scoped_idents is empty -- the captured variables become formal params.
      if (extraction.captures && extraction.paramNames.length > 0) {
        const paramSet = new Set(extraction.paramNames);
        const allCapturesInParams = extraction.captureNames.every(name => paramSet.has(name));
        if (allCapturesInParams) {
          extraction.captures = false;
        }
      }
    }

    // 2a-loop. Event handler capture-to-param promotion.
    // The Rust optimizer delivers event handler captured variables via q:p positional
    // parameters instead of _captures. For event handlers NOT in a loop, ALL captured
    // vars become paramNames with ["_", "_1", ...vars] padding and captures = false.
    // For event handlers IN a loop, only the immediate loop's iter vars and block-scoped
    // vars become paramNames; other captures remain as captureNames with captures = true.
    // Shared declaration position map for ordering loop-local params by source position
    const globalDeclPositions = new Map<string, number>();
    // Build a map of extraction positions to their enclosing loop contexts
    // by walking the original AST and tracking a loop stack.
    // Defined at outer scope so slot unification and elementQpParams can access it.
    const extractionLoopMap = new Map<string, LoopContext[]>();

    {
      const loopStack: LoopContext[] = [];

      walk(program, {
        enter(node: any, _parent: any, _ctx: any) {
          const loopCtx = detectLoopContext(node, repairedCode);
          if (loopCtx) {
            loopStack.push(loopCtx);
          }
          // Check if this node's range matches any extraction's call range
          if (node.start !== undefined && node.end !== undefined && loopStack.length > 0) {
            for (const ext of extractions) {
              if (node.start <= ext.callStart && node.end >= ext.callEnd) {
                // This node contains the extraction -- record current loop stack
                // We only need the innermost, but store all for nested loop analysis
                if (!extractionLoopMap.has(ext.symbolName) ||
                    extractionLoopMap.get(ext.symbolName)!.length < loopStack.length) {
                  extractionLoopMap.set(ext.symbolName, [...loopStack]);
                }
              }
            }
          }
        },
        leave(node: any, _parent: any, _ctx: any) {
          const loopCtx = detectLoopContext(node, repairedCode);
          if (loopCtx) {
            loopStack.pop();
          }
        },
      });

      for (const extraction of extractions) {
        // Only process event handlers
        if (extraction.ctxKind !== 'eventHandler') continue;
        if (extraction.isInlinedQrl) continue;

        // Re-detect captures for event handlers by checking undeclared identifiers
        // against ALL enclosing scopes (including loop callback scopes that
        // capture analysis misses because they're intermediate nested functions).
        const closureNode = closureNodes.get(extraction.symbolName);
        if (!closureNode) continue;

        let undeclaredIds: string[];
        try {
          undeclaredIds = getUndeclaredIdentifiersInFunction(closureNode);
        } catch {
          continue;
        }

        // Even with no captures, event handlers in a loop context need (_, _1) padding
        // for the q:p delivery mechanism. Check loop context before skipping.
        // Exception: component event handlers (onClick$ on <MyComponent/>) are just props,
        // not Qwik event handlers, so they don't need (_, _1) padding.
        if (undeclaredIds.length === 0) {
          if (!extraction.isComponentEvent) {
            const enclosingLoops = extractionLoopMap.get(extraction.symbolName);
            if (enclosingLoops && enclosingLoops.length > 0) {
              // In a loop: add minimal (_, _1) padding even with no captures
              extraction.paramNames = ['_', '_1'];
              extraction.captureNames = [];
              extraction.captures = false;
            }
          }
          continue;
        }

        // Collect ALL scope-visible identifiers from enclosing scopes.
        // This includes the enclosing extraction's body scope PLUS any
        // intermediate function scopes (like .map() callbacks).
        const allScopeIds = new Set<string>();

        // Add enclosing extraction's body scope
        let enclosingExt: typeof extractions[0] | null = null;
        for (const other of extractions) {
          if (other.symbolName === extraction.symbolName) continue;
          if (extraction.callStart >= other.argStart && extraction.callEnd <= other.argEnd) {
            if (!enclosingExt || (other.argStart >= enclosingExt.argStart && other.argEnd <= enclosingExt.argEnd)) {
              enclosingExt = other;
            }
          }
        }

        if (enclosingExt) {
          const parentIds = bodyScopeIds.get(enclosingExt.symbolName);
          if (parentIds) {
            for (const id of parentIds) allScopeIds.add(id);
          }
        } else {
          for (const id of moduleScopeIds) allScopeIds.add(id);
        }

        // Also collect identifiers from intermediate scopes between the
        // enclosing extraction and this extraction. Walk the AST to find
        // function scopes that contain the extraction.
        // Track declaration positions for ordering captures by source position.
        const declPositions = new Map<string, number>();
        const enclosingStart = enclosingExt ? enclosingExt.argStart : 0;
        const enclosingEnd = enclosingExt ? enclosingExt.argEnd : repairedCode.length;
        walk(program, {
          enter(node: any) {
            if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
                node.start !== undefined && node.end !== undefined &&
                node.start >= enclosingStart && node.end <= enclosingEnd &&
                node.start < extraction.callStart && node.end > extraction.callEnd) {
              // This function contains our extraction -- collect its params and body declarations
              for (const param of node.params ?? []) {
                const names = new Set<string>();
                collectBindingNamesFromNode(param, names);
                for (const n of names) {
                  allScopeIds.add(n);
                  if (!declPositions.has(n)) declPositions.set(n, param.start ?? 0);
                }
              }
              if (node.body?.type === 'BlockStatement') {
                for (const stmt of node.body.body ?? []) {
                  if (stmt.type === 'VariableDeclaration') {
                    for (const decl of stmt.declarations ?? []) {
                      if (decl.id) {
                        const names = new Set<string>();
                        collectBindingNamesFromNode(decl.id, names);
                        for (const n of names) {
                          allScopeIds.add(n);
                          if (!declPositions.has(n)) declPositions.set(n, decl.start ?? stmt.start ?? 0);
                        }
                      }
                    }
                  }
                }
              }
            }
            // Also collect for-of/for-in/for loop iterator variables
            // that contain the extraction (these are block-scoped to the loop)
            if ((node.type === 'ForOfStatement' || node.type === 'ForInStatement' || node.type === 'ForStatement') &&
                node.start !== undefined && node.end !== undefined &&
                node.start >= enclosingStart && node.end <= enclosingEnd &&
                node.start < extraction.callStart && node.end > extraction.callEnd) {
              // For for-of/for-in: the iterator variable is in node.left
              const left = node.left ?? node.init;
              if (left?.type === 'VariableDeclaration') {
                for (const decl of left.declarations ?? []) {
                  if (decl.id) {
                    const names = new Set<string>();
                    collectBindingNamesFromNode(decl.id, names);
                    for (const n of names) {
                      allScopeIds.add(n);
                      if (!declPositions.has(n)) declPositions.set(n, decl.start ?? left.start ?? 0);
                    }
                  }
                }
              }
            }
          },
          leave() {},
        });

        // Copy declaration positions to global map for shared slot allocation
        for (const [name, pos] of declPositions) {
          if (!globalDeclPositions.has(name)) globalDeclPositions.set(name, pos);
        }

        // Filter undeclared identifiers against all scope identifiers
        // Sort by declaration position (source order) to match Rust optimizer behavior
        const allCaptures = undeclaredIds
          .filter(name => allScopeIds.has(name) && !importedNames.has(name));
        const uniqueCaptures = [...new Set(allCaptures)]
          .sort((a, b) => (declPositions.get(a) ?? 0) - (declPositions.get(b) ?? 0));

        if (uniqueCaptures.length === 0) {
          // Even with no scope captures, event handlers in a loop context need (_, _1)
          // padding for the q:p delivery mechanism.
          // Exception: component event handlers are just props, no padding needed.
          if (!extraction.isComponentEvent) {
            const enclosingLoops = extractionLoopMap.get(extraction.symbolName);
            if (enclosingLoops && enclosingLoops.length > 0) {
              extraction.paramNames = ['_', '_1'];
              extraction.captureNames = [];
              extraction.captures = false;
            }
          }
          continue;
        }

        const enclosingLoops = extractionLoopMap.get(extraction.symbolName);

        if (!enclosingLoops || enclosingLoops.length === 0) {
          // NOT in a loop: ALL captured vars become paramNames, sorted ALPHABETICALLY per SWC Rule 7
          const sortedCaptures = [...uniqueCaptures].sort();
          extraction.paramNames = generateParamPadding(sortedCaptures);
          extraction.captureNames = [];
          extraction.captures = false;
        } else {
          // IN a loop: partition captures into loop-local vs cross-scope.
          // Only the IMMEDIATE (innermost) loop's variables are loop-local.
          // Variables from outer loops are cross-scope captures (delivered via .w() hoisting).
          const immediateLoop = enclosingLoops[enclosingLoops.length - 1];

          // Collect loop-local variable names:
          // 1. Immediate loop's iterVars
          const loopLocalSet = new Set<string>(immediateLoop.iterVars);

          // 2. Block-scoped declarations inside the immediate loop body
          walk(program, {
            enter(node: any) {
              if (node.type === 'VariableDeclaration' &&
                  node.start !== undefined && node.end !== undefined &&
                  node.start >= immediateLoop.loopBodyStart &&
                  node.end <= immediateLoop.loopBodyEnd) {
                for (const decl of node.declarations ?? []) {
                  if (decl.id?.type === 'Identifier') {
                    loopLocalSet.add(decl.id.name);
                  }
                }
              }
            },
            leave() {},
          });

          // Partition captures
          const loopLocalVars: string[] = [];
          const crossScopeCaptures: string[] = [];
          for (const name of uniqueCaptures) {
            if (loopLocalSet.has(name)) {
              loopLocalVars.push(name);
            } else {
              crossScopeCaptures.push(name);
            }
          }

          if (loopLocalVars.length > 0) {
            extraction.paramNames = generateParamPadding(loopLocalVars);
          }
          extraction.captureNames = crossScopeCaptures.sort();
          extraction.captures = crossScopeCaptures.length > 0;
        }
      }
    }

    // 2a-slots. Unify parameter slots for multiple event handlers on the same element.
    // When multiple event handlers on the same JSX element have loop-local params,
    // they share a unified parameter list. Each handler uses _ padding for slots
    // belonging to variables it doesn't capture.
    {
      // Group event handlers by parent extraction and element position
      const handlersByParent = new Map<string, typeof extractions>();
      for (const ext of extractions) {
        if (ext.ctxKind !== 'eventHandler') continue;
        if (ext.paramNames.length < 2 || ext.paramNames[0] !== '_' || ext.paramNames[1] !== '_1') continue;
        // Find the parent extraction
        let parentName: string | null = null;
        for (const other of extractions) {
          if (other.symbolName === ext.symbolName) continue;
          if (ext.callStart >= other.argStart && ext.callEnd <= other.argEnd) {
            if (!parentName || (other.argStart >= (extractions.find(e => e.symbolName === parentName)?.argStart ?? 0))) {
              parentName = other.symbolName;
            }
          }
        }
        if (!parentName) continue;
        if (!handlersByParent.has(parentName)) handlersByParent.set(parentName, []);
        handlersByParent.get(parentName)!.push(ext);
      }

      // For each parent, group handlers by their containing JSX element
      for (const [, handlers] of handlersByParent) {
        if (handlers.length < 2) continue;

        // Group by containing element: scan backwards in source from callStart to find '<'
        const elementGroups = new Map<number, typeof extractions>();
        for (const h of handlers) {
          let pos = h.callStart - 1;
          while (pos > 0 && repairedCode[pos] !== '<') pos--;
          const existing = elementGroups.get(pos);
          if (existing) {
            existing.push(h);
          } else {
            elementGroups.set(pos, [h]);
          }
        }

        // For each element group with 2+ handlers, unify their loop-local params
        for (const [, group] of elementGroups) {
          if (group.length < 2) continue;

          // Collect all unique loop-local params across all handlers, sorted by declaration position
          const allLoopLocals: string[] = [];
          const seen = new Set<string>();
          for (const h of group) {
            for (let i = 2; i < h.paramNames.length; i++) {
              const p = h.paramNames[i];
              if (!seen.has(p)) {
                seen.add(p);
                allLoopLocals.push(p);
              }
            }
          }
          // Determine sort order: non-loop handlers use alphabetical sort (SWC Rule 7),
          // loop handlers use declaration-position sort.
          const anyInLoop = group.some(h => {
            const loops = extractionLoopMap.get(h.symbolName);
            return loops && loops.length > 0;
          });
          if (anyInLoop) {
            allLoopLocals.sort((a, b) => (globalDeclPositions.get(a) ?? 0) - (globalDeclPositions.get(b) ?? 0));
          } else {
            allLoopLocals.sort((a, b) => a.localeCompare(b));
          }

          if (allLoopLocals.length === 0) continue;

          // Now reassign paramNames for each handler using unified slots.
          // Handlers with no loop-local captures keep just (_, _1) -- they don't
          // participate in slot allocation.
          for (const h of group) {
            const handlerCaptures = new Set<string>();
            for (let i = 2; i < h.paramNames.length; i++) {
              handlerCaptures.add(h.paramNames[i]);
            }
            if (handlerCaptures.size === 0) continue; // no captures, keep (_, _1) only
            // Build new paramNames with unified slots.
            // Trailing unused positions are omitted (not padded).
            const newParams = ['_', '_1'];
            let paddingCounter = 2; // Start at _2 for first gap
            let lastCaptureIdx = -1;
            // Find the last position in the unified list that this handler uses
            for (let idx = 0; idx < allLoopLocals.length; idx++) {
              if (handlerCaptures.has(allLoopLocals[idx])) lastCaptureIdx = idx;
            }
            // Only fill slots up to the last used position
            for (let idx = 0; idx <= lastCaptureIdx; idx++) {
              const p = allLoopLocals[idx];
              if (handlerCaptures.has(p)) {
                newParams.push(p);
              } else {
                newParams.push(`_${paddingCounter}`);
              }
              paddingCounter++;
            }
            h.paramNames = newParams;
          }
        }
      }
    }

    // Build elementQpParams map: for each event handler, store the unified q:ps params
    // for its containing element. For multi-handler elements, this was computed in slot
    // unification. For single-handler elements, use loopLocalParams directly.
    const elementQpParamsMap = new Map<string, string[]>();
    // From slot unification (already populated for multi-handler groups):
    // We need to re-derive it. Let's scan all event handlers with paramNames.
    {
      // Group event handlers by parent and element (same logic as slot unification)
      const handlersByParent2 = new Map<string, typeof extractions>();
      for (const ext of extractions) {
        if (ext.ctxKind !== 'eventHandler') continue;
        if (ext.paramNames.length < 2 || ext.paramNames[0] !== '_' || ext.paramNames[1] !== '_1') continue;
        let parentName: string | null = null;
        for (const other of extractions) {
          if (other.symbolName === ext.symbolName) continue;
          if (ext.callStart >= other.argStart && ext.callEnd <= other.argEnd) {
            if (!parentName || (other.argStart >= (extractions.find(e => e.symbolName === parentName)?.argStart ?? 0))) {
              parentName = other.symbolName;
            }
          }
        }
        if (!parentName) continue;
        if (!handlersByParent2.has(parentName)) handlersByParent2.set(parentName, []);
        handlersByParent2.get(parentName)!.push(ext);
      }

      for (const [, handlers] of handlersByParent2) {
        // Group by element
        const elementGroups2 = new Map<number, typeof extractions>();
        for (const h of handlers) {
          let pos = h.callStart - 1;
          while (pos > 0 && repairedCode[pos] !== '<') pos--;
          const existing = elementGroups2.get(pos);
          if (existing) existing.push(h);
          else elementGroups2.set(pos, [h]);
        }

        for (const [, group] of elementGroups2) {
          // Collect actual (non-padding) loop-local vars in declaration order
          const allVars: string[] = [];
          const seen = new Set<string>();
          for (const h of group) {
            for (let i = 2; i < h.paramNames.length; i++) {
              const p = h.paramNames[i];
              if (/^_\d+$/.test(p) || p === '_') continue;
              if (!seen.has(p)) { seen.add(p); allVars.push(p); }
            }
          }
          // Non-loop handlers use alphabetical sort; loop handlers use declaration order
          const anyInLoop2 = group.some(h => {
            const loops = extractionLoopMap.get(h.symbolName);
            return loops && loops.length > 0;
          });
          if (anyInLoop2) {
            allVars.sort((a, b) => (globalDeclPositions.get(a) ?? 0) - (globalDeclPositions.get(b) ?? 0));
          } else {
            allVars.sort((a, b) => a.localeCompare(b));
          }
          for (const h of group) {
            elementQpParamsMap.set(h.symbolName, allVars);
          }
        }
      }
    }

    // 2a-diag. Diagnostic detection: C02 (function/class references crossing $() boundary)
    // C02 fires when a function or class declaration from the enclosing scope is
    // REFERENCED inside a $() closure -- even if it's not a formal capture (fn/class
    // can't be serialized, so they don't appear in captureNames).
    // We parse each extraction's body independently and get undeclared identifiers,
    // then classify each against the enclosing scope.
    for (const extraction of extractions) {
      // Parse this extraction's body to get undeclared identifiers
      let undeclaredIds: string[];
      try {
        const wrappedBody = `(${extraction.bodyText})`;
        const bodyParse = parseSync('segment.tsx', wrappedBody);
        const exprStmt = bodyParse.program.body[0];
        let closureNode = exprStmt?.type === 'ExpressionStatement' ? exprStmt.expression : null;
        while (closureNode?.type === 'ParenthesizedExpression') {
          closureNode = closureNode.expression;
        }
        if (!closureNode || (closureNode.type !== 'ArrowFunctionExpression' && closureNode.type !== 'FunctionExpression')) {
          continue;
        }
        undeclaredIds = getUndeclaredIdentifiersInFunction(closureNode);
      } catch {
        continue;
      }
      if (undeclaredIds.length === 0) continue;

      // Find enclosing extraction using range containment (not symbolName)
      let enclosingExt: typeof extractions[0] | null = null;
      for (const other of extractions) {
        if (other === extraction) continue;
        if (extraction.callStart >= other.argStart && extraction.callEnd <= other.argEnd) {
          if (!enclosingExt || (other.argStart >= enclosingExt.argStart && other.argEnd <= enclosingExt.argEnd)) {
            enclosingExt = other;
          }
        }
      }

      // Classify each undeclared identifier against enclosing scope
      // Skip imports and known globals
      for (const refName of undeclaredIds) {
        if (importedNames.has(refName)) continue;

        // Classify in the enclosing scope
        let declType: 'var' | 'fn' | 'class';
        if (enclosingExt) {
          try {
            const wrappedBody = `(${enclosingExt.bodyText})`;
            const bodyParse = parseSync('segment.tsx', wrappedBody);
            declType = classifyDeclarationType(bodyParse.program, refName);
          } catch {
            declType = 'var';
          }
        } else {
          declType = classifyDeclarationType(program, refName);
        }

        if (declType === 'fn' || declType === 'class') {
          diagnostics.push(emitC02(refName, relPath, declType === 'class'));
        }
      }
    }

    // 2b. Run variable migration analysis
    // Exclude inlinedQrl extractions from migration -- their captures are explicit
    const moduleLevelDecls = collectModuleLevelDecls(program, repairedCode);
    const nonInlinedExtractions = extractions.filter((e) => !e.isInlinedQrl);
    const { segmentUsage, rootUsage } = computeSegmentUsage(program, nonInlinedExtractions);

    // Variables delivered via q:ps (paramNames captures) are referenced by the parent
    // component at render time, so they must not be migrated away from the parent.
    // Add them to the parent segment's usage set.
    for (const ext of extractions) {
      if (ext.ctxKind !== 'eventHandler') continue;
      if (ext.paramNames.length < 3 || ext.paramNames[0] !== '_' || ext.paramNames[1] !== '_1') continue;
      // Find parent extraction
      let parentExt: typeof ext | null = null;
      for (const other of extractions) {
        if (other.symbolName === ext.symbolName) continue;
        if (ext.callStart >= other.argStart && ext.callEnd <= other.argEnd) {
          if (!parentExt || other.argStart >= parentExt.argStart) {
            parentExt = other;
          }
        }
      }
      if (!parentExt) continue;
      const parentUsage = segmentUsage.get(parentExt.symbolName);
      if (!parentUsage) continue;
      // Add actual capture var names (not padding) to parent's usage
      for (let i = 2; i < ext.paramNames.length; i++) {
        const p = ext.paramNames[i];
        if (/^_\d*$/.test(p)) continue; // skip padding (_2, _3, etc.)
        parentUsage.add(p);
      }
    }

    // Compute output extension early (before `ext` is shadowed by extraction loop)
    const qrlOutputExt = computeOutputExtension(ext, options.transpileTs, options.transpileJsx);

    const entryStrategy = options.entryStrategy ?? { type: 'smart' as const };
    const isInlineStrategy = entryStrategy.type === 'inline' || entryStrategy.type === 'hoist';
    // For inline/hoist strategy, skip migration -- segments share the parent module scope
    // so variables don't need to be moved or re-exported.
    const migrationDecisions = isInlineStrategy
      ? []
      : analyzeMigration(moduleLevelDecls, segmentUsage, rootUsage);

    // Compute parent module path for self-referential imports
    // When explicitExtensions is enabled, include the original file extension
    const parentModulePath = computeParentModulePath(relPath, options.explicitExtensions);

    // 2c. Prod mode s_ naming: use s_{hash} for symbolName
    // displayName and canonicalFilename remain full human-readable form
    // Save original symbolNames BEFORE rename so migration lookups still work.
    // segmentUsage keys and migrationDecision.targetSegment use pre-rename names,
    // but after prod rename ext.symbolName becomes "s_{hash}".
    // Map: renamed symbolName -> original symbolName (identity for non-prod).
    const preRenameSymbolName = new Map<string, string>();
    const emitMode = options.mode ?? 'prod';
    if (emitMode === 'prod') {
      for (const ext of extractions) {
        if (ext.isInlinedQrl) continue; // inlinedQrl has its own naming
        const original = ext.symbolName;
        ext.symbolName = 's_' + ext.hash;
        preRenameSymbolName.set(ext.symbolName, original);
      }
    }

    // 3. Rewrite parent module (pass migration decisions + JSX options + mode)
    // For inlinedQrl extractions in lib mode (local files), we also need devFile
    // because the Rust optimizer always uses qrlDEV for inlinedQrl in Test mode
    const hasLocalInlinedQrl = extractions.some(
      (e) => e.isInlinedQrl && !relPath.includes('node_modules'),
    );
    const devFile = (emitMode === 'dev' || hasLocalInlinedQrl)
      ? buildDevFilePath(input.path, options.srcDir, input.devPath)
      : undefined;

    const shouldTranspileJsx = options.transpileJsx !== false;
    const shouldTranspileTs = options.transpileTs === true;

    // When JSX will be transpiled, downgrade extensions on extraction results
    // so that QRL declarations in parent and segments reference the correct file extension.
    // .tsx -> .ts (JSX removed, TS may remain), .jsx -> .js (JSX removed)
    if (shouldTranspileJsx) {
      for (const extraction of extractions) {
        if (extraction.extension === '.tsx') extraction.extension = '.ts';
        else if (extraction.extension === '.jsx') extraction.extension = '.js';
      }
    }

    const parentResult = rewriteParentModule(
      repairedCode,
      relPath,
      extractions,
      originalImports,
      migrationDecisions,
      moduleLevelDecls,
      (shouldTranspileJsx && (ext === '.tsx' || ext === '.jsx'))
        ? { enableJsx: true, importedNames, enableSignals: extractions.length > 0 }
        : undefined,
      emitMode,
      devFile,
      isInlineStrategy
        ? { inline: true, entryType: entryStrategy.type as 'inline' | 'hoist', stripCtxName: options.stripCtxName, stripEventHandlers: options.stripEventHandlers, regCtxName: options.regCtxName }
        : options.stripCtxName || options.stripEventHandlers || options.regCtxName
          ? { inline: false, stripCtxName: options.stripCtxName, stripEventHandlers: options.stripEventHandlers, regCtxName: options.regCtxName }
          : undefined,
      options.stripExports,
      options.isServer,
      options.explicitExtensions,
      options.transpileTs,
      options.minify,
      qrlOutputExt,
    );

    // 3b. Apply DCE to parent module (after const replacement turned isServer/isBrowser to true/false)
    let parentCode = parentResult.code;
    parentCode = applySegmentDCE(parentCode);

    // 3c. Import cleanup: remove non-Qwik imports whose identifiers are no longer
    // referenced in the parent module after extraction moved their consumers to segments.
    const cleanedCode = removeUnusedImports(parentCode, relPath, options.transpileJsx);

    // 4. Build parent TransformModule
    const parentModule: TransformModule = {
      path: relPath,
      isEntry: false,
      code: cleanedCode,
      map: null, // Source maps deferred
      segment: null,
      origPath: input.path,
    };
    allModules.push(parentModule);

    // 4a-diag. C05 detection: custom $-suffixed exports missing Qrl counterpart
    // Collect all exported names from the module
    const moduleExportNames = new Set<string>();
    for (const stmt of program.body) {
      if (stmt.type === 'ExportNamedDeclaration') {
        if (stmt.declaration?.type === 'VariableDeclaration') {
          for (const decl of stmt.declaration.declarations ?? []) {
            if (decl.id?.type === 'Identifier') {
              moduleExportNames.add(decl.id.name);
            }
          }
        }
        if (stmt.declaration?.type === 'FunctionDeclaration' && stmt.declaration.id) {
          moduleExportNames.add(stmt.declaration.id.name);
        }
        if (stmt.declaration?.type === 'ClassDeclaration' && stmt.declaration.id) {
          moduleExportNames.add(stmt.declaration.id.name);
        }
        // Named export specifiers
        for (const spec of stmt.specifiers ?? []) {
          const exported = spec.exported;
          const exportedName = exported?.type === 'Identifier' ? exported.name : (exported as any)?.value;
          if (exportedName) {
            moduleExportNames.add(exportedName);
          }
        }
      }
    }

    // Check each exported $-suffixed name for a corresponding Qrl export
    for (const exportName of moduleExportNames) {
      if (!exportName.endsWith('$')) continue;

      // Skip known Qwik core functions (they don't need Qrl exports)
      const importInfo = originalImports.get(exportName);
      if (importInfo?.isQwikCore) continue;

      // Derive expected Qrl name
      const qrlName = exportName.slice(0, -1) + 'Qrl';
      if (!moduleExportNames.has(qrlName)) {
        // Find call sites of this function in the source for highlight spans
        // Scan extractions for usages, or find call expressions in the AST
        const callSites = findCallSites(program, exportName);
        for (const site of callSites) {
          const [startLine, startCol] = computeLineColFromOffset(repairedCode, site.start);
          const [endLine, endCol] = computeLineColFromOffset(repairedCode, site.end);
          diagnostics.push(emitC05(exportName, qrlName, relPath, {
            lo: site.start,
            hi: site.end,
            startLine,
            startCol,
            endLine,
            endCol,
          }));
        }
      }
    }

    // 4b-diag. preventdefault-passive-check: detect contradictory passive + preventdefault
    if (ext === '.tsx' || ext === '.jsx') {
      detectPassivePreventdefaultConflicts(program, relPath, repairedCode, diagnostics);
    }

    // 5. Generate segment modules for non-sync extractions
    // Updated extractions have parent info from rewriteParentModule
    const updatedExtractions = parentResult.extractions;

    // Track running JSX key counter across segments (starts from parent module's final value)
    let segmentKeyCounter = parentResult.jsxKeyCounterValue ?? 0;

    // For inline/hoist strategy, segments are inlined into parent -- no separate segment modules.
    // But we still emit SegmentAnalysis metadata entries.
    // For stripped segments, emit null exports with loc [0,0].

    // Collect same-file exported/declared names for self-referential segment imports
    const sameFileExportNames = new Set<string>();
    const defaultExportedNames = new Set<string>();
    const renamedExports = new Map<string, string>();
    for (const node of program.body) {
      if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration) {
          if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id?.name) {
            sameFileExportNames.add(node.declaration.id.name);
          } else if (node.declaration.type === 'VariableDeclaration') {
            for (const decl of node.declaration.declarations) {
              collectBindingNamesFromNode(decl.id, sameFileExportNames);
            }
          } else if (node.declaration.type === 'ClassDeclaration' && node.declaration.id?.name) {
            sameFileExportNames.add(node.declaration.id.name);
          } else if (node.declaration.type === 'TSEnumDeclaration' && node.declaration.id?.name) {
            sameFileExportNames.add(node.declaration.id.name);
          }
        }
        if (node.specifiers) {
          for (const spec of node.specifiers) {
            const exportedName = spec.exported?.type === 'Identifier' ? spec.exported.name : spec.exported?.value;
            if (exportedName) sameFileExportNames.add(exportedName);
            // Also add the local name so segments can import it
            const localName = spec.local?.type === 'Identifier' ? spec.local.name : spec.local?.value;
            if (localName && localName !== exportedName) {
              sameFileExportNames.add(localName);
              renamedExports.set(localName, exportedName);
            }
          }
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        // export default function Foo() {} or export default class Bar {}
        if (node.declaration?.id?.name) {
          sameFileExportNames.add(node.declaration.id.name);
          defaultExportedNames.add(node.declaration.id.name);
        }
      } else if (node.type === 'FunctionDeclaration' && node.id?.name) {
        sameFileExportNames.add(node.id.name);
      } else if (node.type === 'ClassDeclaration' && node.id?.name) {
        sameFileExportNames.add(node.id.name);
      } else if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          collectBindingNamesFromNode(decl.id, sameFileExportNames);
        }
      } else if (node.type === 'TSEnumDeclaration' && node.id?.name) {
        sameFileExportNames.add(node.id.name);
      }
    }

    // Collect import attributes from AST (e.g., with { type: "json" })
    const importAttributesMap = new Map<string, Record<string, string>>();
    for (const node of program.body) {
      if (node.type !== 'ImportDeclaration') continue;
      const attrs = node.attributes || (node as any).assertions;
      if (attrs && attrs.length > 0) {
        const attrObj: Record<string, string> = {};
        for (const attr of attrs) {
          const key = attr.key?.type === 'Identifier' ? attr.key.name : attr.key?.value;
          const value = attr.value?.value;
          if (key && value) attrObj[key] = value;
        }
        // Associate with each specifier's local name
        for (const spec of node.specifiers) {
          const localName = spec.local?.name;
          if (localName) {
            importAttributesMap.set(localName, attrObj);
          }
        }
      }
    }

    // Build moduleImports array for SegmentImportContext
    const moduleImportsForContext: SegmentImportContext['moduleImports'] = [];
    for (const [, imp] of originalImports) {
      moduleImportsForContext.push({
        localName: imp.localName,
        importedName: imp.importedName,
        source: imp.source,
        importAttributes: importAttributesMap.get(imp.localName),
      });
    }

    // Collect TS enum declarations for value inlining in segment bodies
    // When transpileTs is enabled, enum member references (Thing.A) are resolved
    // to their literal values (0) in segment bodies
    const enumValueMap = new Map<string, Map<string, string>>();
    if (shouldTranspileTs) {
      for (const node of program.body) {
        let enumDecl: any = null;
        if (node.type === 'TSEnumDeclaration') {
          enumDecl = node;
        } else if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'TSEnumDeclaration') {
          enumDecl = node.declaration;
        }
        if (enumDecl && enumDecl.id?.name && enumDecl.body?.members) {
          const members = new Map<string, string>();
          let autoValue = 0;
          for (const member of enumDecl.body.members) {
            const memberName = member.id?.name ?? member.id?.value;
            if (!memberName) continue;
            if (member.initializer) {
              // Explicit initializer -- extract literal value
              if (member.initializer.type === 'NumericLiteral' || member.initializer.type === 'Literal') {
                const val = String(member.initializer.value);
                members.set(memberName, val);
                autoValue = Number(member.initializer.value) + 1;
              } else if (member.initializer.type === 'StringLiteral') {
                members.set(memberName, JSON.stringify(member.initializer.value));
                autoValue = NaN; // String enums break auto-increment
              } else {
                // Complex initializer -- skip inlining for this member
                autoValue = NaN;
              }
            } else {
              // Auto-incremented value
              members.set(memberName, String(autoValue));
              autoValue++;
            }
          }
          if (members.size > 0) {
            enumValueMap.set(enumDecl.id.name, members);
          }
        }
      }
    }

    for (const ext of updatedExtractions) {
      if (ext.isSync) continue; // sync$ is inlined, no separate segment module

      // Check if this segment is stripped
      const stripped = isStrippedSegment(
        ext.ctxName,
        ext.ctxKind,
        options.stripCtxName,
        options.stripEventHandlers,
      );

      // If stripped, override loc to [0, 0]
      if (stripped) {
        ext.loc = [0, 0];
      }

      // For inline/hoist strategy, do NOT emit separate segment TransformModules.
      // The parent module already contains everything via _noopQrl + .s() calls.
      // But still emit SegmentAnalysis metadata (as segment modules with no code output).
      if (isInlineStrategy) {
        // Build metadata only -- no separate segment file
        const entryField = resolveEntryField(
          entryStrategy.type,
          ext.symbolName,
          ext.ctxName,
          null,
          'manual' in entryStrategy ? (entryStrategy as any).manual as Record<string, string> | undefined : undefined,
        );

        const segmentAnalysis: SegmentMetadataInternal = {
          origin: ext.origin,
          name: ext.symbolName,
          entry: entryField,
          displayName: ext.displayName,
          hash: ext.hash,
          canonicalFilename: ext.canonicalFilename,
          extension: ext.extension,
          parent: ext.parent,
          ctxKind: ext.ctxKind,
          ctxName: ext.ctxName,
          captures: ext.captures,
          loc: ext.loc,
          captureNames: ext.captureNames,
          paramNames: ext.paramNames,
        };

        // Inline strategy still creates TransformModule entries for metadata tracking
        // but with empty code (the code is in the parent)
        const segmentModule: TransformModule = {
          path: ext.canonicalFilename + ext.extension,
          isEntry: true,
          code: stripped ? generateStrippedSegmentCode(ext.symbolName) : '',
          map: null,
          segment: segmentAnalysis,
          origPath: null,
        };
        allModules.push(segmentModule);
        continue;
      }

      // Default strategy: emit separate segment modules

      // Determine nested QRL declarations for segments that have children
      const children = updatedExtractions.filter((c) => c.parent === ext.symbolName && !c.isSync);
      const isDevMode = emitMode === 'dev';
      const nestedQrlDecls = children.map((child) => {
        if (isDevMode && devFile) {
          return buildQrlDevDeclaration(
            child.symbolName,
            child.canonicalFilename,
            devFile,
            child.loc[0],
            child.loc[1],
            child.displayName,
          );
        }
        return buildQrlDeclaration(child.symbolName, child.canonicalFilename, options.explicitExtensions, child.extension, qrlOutputExt);
      });

      // 2c. Build SegmentCaptureInfo for this extraction
      const captureInfo: SegmentCaptureInfo = {
        captureNames: ext.captureNames,
        autoImports: [],
        movedDeclarations: [],
      };

      // For top-level segments (no parent): wire migration info
      // Skip migration for inlinedQrl -- captures are explicit, not scope-based
      if (ext.parent === null && !ext.isInlinedQrl) {
        // Use pre-rename symbolName for migration lookups (segmentUsage keys and
        // migrationDecision.targetSegment were computed before prod s_ rename)
        const migrationKey = preRenameSymbolName.get(ext.symbolName) ?? ext.symbolName;

        // _auto_ imports: from migration decisions where action is "reexport" and the variable is used by this segment
        // Variables that are already exported don't need _auto_ prefix -- segments can import them directly
        const segUsage = segmentUsage.get(migrationKey);
        if (segUsage) {
          for (const decision of migrationDecisions) {
            if (decision.action === 'reexport' && segUsage.has(decision.varName)) {
              const decl = moduleLevelDecls.find(d => d.name === decision.varName);
              if (decl?.isExported) {
                // Already exported -- segment will import it directly via importContext path
                // Don't add to autoImports (which would add _auto_ prefix)
                continue;
              }
              captureInfo.autoImports.push({
                varName: decision.varName,
                parentModulePath,
              });
            }
          }
        }

        // Moved declarations: from migration decisions where action is "move" and targetSegment matches
        for (const decision of migrationDecisions) {
          if (decision.action === 'move' && decision.targetSegment === migrationKey) {
            const decl = moduleLevelDecls.find((d) => d.name === decision.varName);
            if (decl) {
              // Compute import dependencies: find all identifiers in the declaration
              // text that match imports from originalImports
              const importDeps: Array<{ localName: string; importedName: string; source: string }> = [];
              // Walk the AST nodes within the declaration range to find referenced identifiers
              const declIdentifiers = new Set<string>();
              walk(program, {
                enter(node: any) {
                  if (node.type === 'Identifier' && node.start >= decl.declStart && node.end <= decl.declEnd) {
                    declIdentifiers.add(node.name);
                  }
                },
              });
              // Check which referenced identifiers are imports
              for (const idName of declIdentifiers) {
                const imp = originalImports.get(idName);
                if (imp) {
                  importDeps.push({
                    localName: imp.localName,
                    importedName: imp.importedName,
                    source: imp.source,
                  });
                }
              }
              captureInfo.movedDeclarations.push({ text: decl.declText, importDeps });
            }
          }
        }

        // Top-level segments: variables handled by migration (_auto_ imports or moves)
        // should NOT appear as captures. Filter them out from captureNames and update
        // the captures flag. Only scope-level captures use _captures mechanism.
        const migratedVarNames = new Set<string>();
        for (const decision of migrationDecisions) {
          if (decision.action === 'reexport' || decision.action === 'move') {
            migratedVarNames.add(decision.varName);
          }
        }
        // Remove migrated vars from capture names
        ext.captureNames = ext.captureNames.filter((name) => !migratedVarNames.has(name));
        ext.captures = ext.captureNames.length > 0;

        // Reconcile captures with paramNames after migration filtering:
        // when remaining captures are all delivered as function parameters,
        // the captures flag is false (Rust's scoped_idents is empty).
        if (ext.captures && ext.paramNames.length > 0) {
          const paramSet = new Set(ext.paramNames);
          const allCapturesInParams = ext.captureNames.every(name => paramSet.has(name));
          if (allCapturesInParams) {
            ext.captures = false;
          }
        }

        // For codegen: only use _captures for remaining scope-level captures
        captureInfo.captureNames = ext.captureNames;
      }

      // Build nested call site info for body rewriting
      const nestedCallSites: NestedCallSiteInfo[] = [];
      for (const child of children) {
        const qrlVarName = `q_${child.symbolName}`;
        // Detect if this child came from a JSX $-attr extraction
        const isJsxAttr = child.ctxKind === 'eventHandler' &&
          child.calleeName.endsWith('$') &&
          child.calleeName !== '$';
        if (isJsxAttr) {
          // For component elements (uppercase tag), keep original event name (onClick$)
          // For HTML elements, transform to q-e:click (or q-ep:/q-wp:/q-dp: for passive)
          let propName: string;
          if (child.isComponentEvent) {
            propName = child.calleeName;
          } else {
            // Detect passive events from the display name path in the symbol name.
            // The extraction phase already collected passive directives and encoded them
            // in the context stack (e.g., q_ep_click, q_wp_scroll, q_dp_touchstart).
            // Detect passive events: the extraction phase encodes the passive
            // prefix in the naming context stack. The calleeName (e.g., onClick$)
            // is transformed by the extract phase, and the resulting symbol name
            // contains q_ep_, q_wp_, or q_dp_ for passive events.
            // Instead of parsing the event name from the symbol, just check if
            // the display name (which the extract phase sets) contains the passive prefix
            // and if so, pass the event name from the calleeName.
            const passiveSet = new Set<string>();
            const displayNamePath = child.displayName ?? child.symbolName;
            const callee = child.calleeName; // e.g., onClick$, window:onScroll$
            // Get the event name from the callee: strip scope prefix and $ suffix
            let eventNameForPassive = callee;
            if (eventNameForPassive.startsWith('document:')) eventNameForPassive = eventNameForPassive.slice(9);
            else if (eventNameForPassive.startsWith('window:')) eventNameForPassive = eventNameForPassive.slice(7);
            if (eventNameForPassive.startsWith('on') && eventNameForPassive.endsWith('$')) {
              eventNameForPassive = eventNameForPassive.slice(2, -1).toLowerCase();
            }
            // Check if the display name path contains the passive prefix
            if (displayNamePath.includes('_q_ep_') || displayNamePath.includes('_q_wp_') || displayNamePath.includes('_q_dp_')) {
              passiveSet.add(eventNameForPassive);
            }
            propName = transformEventPropName(child.calleeName, passiveSet) ?? child.calleeName;
          }

          // Detect cross-scope loop captures that need .w() hoisting
          const hasLoopCrossCaptures =
            child.captures &&
            child.captureNames.length > 0 &&
            child.paramNames.length >= 2 &&
            child.paramNames[0] === '_' && child.paramNames[1] === '_1';

          // Extract loop-local param names (paramNames minus _, _1 padding and _N gap placeholders)
          const loopLocalParams: string[] = [];
          if (child.paramNames.length >= 2 && child.paramNames[0] === '_' && child.paramNames[1] === '_1') {
            for (let pi = 2; pi < child.paramNames.length; pi++) {
              const p = child.paramNames[pi];
              // Skip padding placeholders (_2, _3, etc.)
              if (/^_\d+$/.test(p)) continue;
              loopLocalParams.push(p);
            }
          }

          // For JSX attr extractions: replace the entire attribute
          nestedCallSites.push({
            qrlVarName,
            callStart: child.callStart,
            callEnd: child.callEnd,
            isJsxAttr: true,
            attrStart: child.callStart,
            attrEnd: child.callEnd,
            transformedPropName: propName,
            // Cross-scope loop captures: generate .w() hoisting
            hoistedSymbolName: hasLoopCrossCaptures ? child.symbolName : undefined,
            hoistedCaptureNames: hasLoopCrossCaptures ? child.captureNames : undefined,
            // Loop-local params for q:ps injection
            loopLocalParamNames: loopLocalParams.length > 0 ? loopLocalParams : undefined,
            // Unified q:ps params for the whole element (declaration-ordered)
            elementQpParams: elementQpParamsMap.get(child.symbolName),
          });
        } else {
          // Regular $() call site
          nestedCallSites.push({
            qrlVarName,
            callStart: child.callStart,
            callEnd: child.callEnd,
            isJsxAttr: false,
            // Named marker info for calleeQrl() wrapping
            qrlCallee: child.isBare ? undefined : child.qrlCallee || undefined,
            captureNames: child.captureNames.length > 0 ? child.captureNames : undefined,
            importSource: child.importSource || undefined,
          });
        }
      }

      // For inlinedQrl segments, the body already has _captures references, so we skip
      // _captures unpacking injection. But we still need captureNames for import filtering
      // (captured variables should not be imported -- they're delivered via _captures).
      // Set skipCaptureInjection flag so segment-codegen knows not to inject unpacking.
      const effectiveCaptureInfo = ext.isInlinedQrl
        ? (captureInfo.captureNames.length > 0 || captureInfo.autoImports.length > 0 || captureInfo.movedDeclarations.length > 0
            ? { ...captureInfo, skipCaptureInjection: true }
            : undefined)
        : (captureInfo.captureNames.length > 0 || captureInfo.autoImports.length > 0 || captureInfo.movedDeclarations.length > 0)
          ? captureInfo
          : undefined;

      // Build import context for post-transform import re-collection
      const importContext: SegmentImportContext = {
        moduleImports: moduleImportsForContext,
        sameFileExports: sameFileExportNames,
        defaultExportedNames: defaultExportedNames.size > 0 ? defaultExportedNames : undefined,
        renamedExports: renamedExports.size > 0 ? renamedExports : undefined,
        parentModulePath,
        migrationDecisions: migrationDecisions.map(d => {
          const decl = moduleLevelDecls.find(ml => ml.name === d.varName);
          return { varName: d.varName, action: d.action, isExported: decl?.isExported ?? false };
        }),
      };

      // Generate segment code: stripped segments get null exports, others get full codegen
      const segmentResult = stripped
        ? { code: generateStrippedSegmentCode(ext.symbolName) }
        : generateSegmentCode(
            ext,
            nestedQrlDecls.length > 0 ? nestedQrlDecls : undefined,
            effectiveCaptureInfo,
            (shouldTranspileJsx && (ext.extension === '.tsx' || ext.extension === '.jsx' || isJsx))
              ? { enableJsx: true, importedNames, relPath, devOptions: isDevMode ? { relPath } : undefined, keyCounterStart: segmentKeyCounter }
              : undefined,
            nestedCallSites.length > 0 ? nestedCallSites : undefined,
            importContext,
            enumValueMap.size > 0 ? enumValueMap : undefined,
          );
      let segmentCode = segmentResult.code;
      // Advance the running key counter for subsequent segments
      if (segmentResult.keyCounterValue !== undefined) {
        segmentKeyCounter = segmentResult.keyCounterValue;
      }

      // Strip TS types from segment code when transpileTs is enabled
      if (!stripped && shouldTranspileTs) {
        const tsStripOptions: Record<string, any> = { typescript: { onlyRemoveTypeImports: false } };
        if (!shouldTranspileJsx) {
          tsStripOptions.jsx = 'preserve';
        }
        const tsStripped = oxcTransformSync(ext.canonicalFilename + ext.extension, segmentCode, tsStripOptions);
        if (tsStripped.code) {
          segmentCode = tsStripped.code;
        }
      }

      // Apply isServer/isBrowser const replacement to segment bodies
      if (!stripped && options.isServer !== undefined) {
        segmentCode = applySegmentConstReplacement(segmentCode, ext.canonicalFilename + ext.extension, options.isServer);
      }

      // Apply dead code elimination (handles if(false), if(true), nested braces)
      if (!stripped) {
        segmentCode = applySegmentDCE(segmentCode);
      }

      // Apply side-effect simplification (unused variable bindings)
      if (!stripped) {
        segmentCode = applySegmentSideEffectSimplification(segmentCode, ext.canonicalFilename + ext.extension);
      }

      // Clean up unused imports in segment code (after dead code elimination and
      // body rewriting may have removed references to original identifiers)
      if (!stripped) {
        segmentCode = removeUnusedImports(segmentCode, ext.canonicalFilename + ext.extension);
      }

      // 2d. Build segment metadata with captureNames and paramNames
      // Find parent component symbol for component entry strategy
      let parentComponentSymbol: string | null = null;
      if (entryStrategy.type === 'component') {
        // Walk up parent chain to find nearest component extraction
        let current = ext.parent;
        while (current) {
          const parentExt = updatedExtractions.find((e) => e.symbolName === current);
          if (parentExt && parentExt.ctxName === 'component') {
            parentComponentSymbol = parentExt.symbolName;
            break;
          }
          current = parentExt?.parent ?? null;
        }
      }
      const entryField = resolveEntryField(
        entryStrategy.type,
        ext.symbolName,
        ext.ctxName,
        parentComponentSymbol,
        'manual' in entryStrategy ? (entryStrategy as any).manual as Record<string, string> | undefined : undefined,
      );

      const segmentAnalysis: SegmentMetadataInternal = {
        origin: ext.origin,
        name: ext.symbolName,
        entry: entryField,
        displayName: ext.displayName,
        hash: ext.hash,
        canonicalFilename: ext.canonicalFilename,
        extension: ext.extension,
        parent: ext.parent,
        ctxKind: ext.ctxKind,
        ctxName: ext.ctxName,
        captures: ext.captures,
        loc: ext.loc,
        captureNames: ext.captureNames,
        paramNames: ext.paramNames,
      };

      const segmentModule: TransformModule = {
        path: ext.canonicalFilename + ext.extension,
        isEntry: true,
        code: segmentCode,
        map: null,
        segment: segmentAnalysis,
        origPath: null,
      };
      allModules.push(segmentModule);
    }
  }

  // 6. Apply @qwik-disable-next-line suppression to all diagnostics
  // Parse directives from all input files and filter diagnostics
  let filteredDiagnostics = diagnostics;
  for (const input of options.input) {
    const directives = parseDisableDirectives(input.code);
    if (directives.size > 0) {
      filteredDiagnostics = filterSuppressedDiagnostics(filteredDiagnostics, directives);
    }
  }

  return {
    modules: allModules,
    diagnostics: filteredDiagnostics,
    isTypeScript,
    isJsx,
  };
}

// ---------------------------------------------------------------------------
// Diagnostic helper functions
// ---------------------------------------------------------------------------

/**
 * Find all call sites of a named function in an AST.
 * Returns array of { start, end } positions for the callee identifier.
 */
function findCallSites(program: any, funcName: string): Array<{ start: number; end: number }> {
  const sites: Array<{ start: number; end: number }> = [];
  walk(program, {
    enter(node: any) {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === funcName
      ) {
        sites.push({ start: node.callee.start, end: node.callee.end });
      }
    },
  });
  return sites;
}

/**
 * Compute 1-based line and column from a character offset in source text.
 */
function computeLineColFromOffset(source: string, offset: number): [number, number] {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return [line, col];
}

/**
 * Detect preventdefault + passive conflicts on JSX elements.
 * Walks the AST looking for JSXOpeningElement nodes that have both
 * passive:EVENT and preventdefault:EVENT attributes.
 */
function detectPassivePreventdefaultConflicts(
  program: any,
  file: string,
  source: string,
  diagnostics: import('./types.js').Diagnostic[],
): void {
  walk(program, {
    enter(node: any) {
      if (node.type !== 'JSXOpeningElement') return;

      const attrs = node.attributes ?? [];
      const passiveEvents = new Set<string>();
      const preventdefaultEvents = new Set<string>();

      for (const attr of attrs) {
        if (attr.type !== 'JSXAttribute') continue;

        let name: string | null = null;
        if (attr.name?.type === 'JSXIdentifier') {
          name = attr.name.name;
        } else if (attr.name?.type === 'JSXNamespacedName') {
          name = `${attr.name.namespace.name}:${attr.name.name.name}`;
        }
        if (!name) continue;

        if (name.startsWith('passive:')) {
          passiveEvents.add(name.slice('passive:'.length));
        } else if (name.startsWith('preventdefault:')) {
          preventdefaultEvents.add(name.slice('preventdefault:'.length));
        }
      }

      // Check for conflicts
      for (const eventName of passiveEvents) {
        if (preventdefaultEvents.has(eventName)) {
          // Build highlight span for the JSX element
          const [startLine, startCol] = computeLineColFromOffset(source, node.start);
          // Find the closing > of the opening element
          const parent = node.parent;
          const elementEnd = node.end;
          const [endLine, endCol] = computeLineColFromOffset(source, elementEnd);

          diagnostics.push(emitPreventdefaultPassiveCheck(eventName, file, {
            lo: node.start,
            hi: elementEnd,
            startLine,
            startCol,
            endLine,
            endCol,
          }));
        }
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers for loop-aware capture classification
// ---------------------------------------------------------------------------

/**
 * Collect binding names from an AST pattern node into a Set.
 * Handles Identifier, ObjectPattern, ArrayPattern, RestElement, AssignmentPattern.
 */
function collectBindingNamesFromNode(node: any, names: Set<string>): void {
  if (!node) return;
  switch (node.type) {
    case 'Identifier':
      names.add(node.name);
      break;
    case 'ObjectPattern':
      for (const prop of node.properties ?? []) {
        if (prop.type === 'RestElement') {
          collectBindingNamesFromNode(prop.argument, names);
        } else {
          collectBindingNamesFromNode(prop.value, names);
        }
      }
      break;
    case 'ArrayPattern':
      for (const elem of node.elements ?? []) {
        collectBindingNamesFromNode(elem, names);
      }
      break;
    case 'RestElement':
      collectBindingNamesFromNode(node.argument, names);
      break;
    case 'AssignmentPattern':
      collectBindingNamesFromNode(node.left, names);
      break;
    default:
      if (node.parameter) {
        collectBindingNamesFromNode(node.parameter, names);
      }
      break;
  }
}
