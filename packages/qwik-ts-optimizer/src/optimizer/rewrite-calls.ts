/**
 * Call form rewriting utilities for the Qwik optimizer.
 *
 * Transforms marker function calls to their Qrl equivalents:
 * - component$ -> componentQrl
 * - useTask$ -> useTaskQrl
 * - $ -> (bare QRL reference, no wrapper)
 * - sync$ -> _qrlSync
 *
 * Also handles QRL declaration generation, PURE annotations,
 * and import source determination.
 *
 * Implements: CALL-01, CALL-02, CALL-03, CALL-04, CALL-05
 */

import { rewriteImportSource } from './rewrite-imports.js';

// ---------------------------------------------------------------------------
// Callee name transformation
// ---------------------------------------------------------------------------

/**
 * Get the Qrl callee name from a marker name.
 *
 * - "$" -> "" (bare QRL, no wrapper)
 * - "sync$" -> "_qrlSync"
 * - "component$" -> "componentQrl"
 * - "useTask$" -> "useTaskQrl"
 */
export function getQrlCalleeName(markerName: string): string {
  if (markerName === '$') return '';
  if (markerName === 'sync$') return '_qrlSync';
  return markerName.slice(0, -1) + 'Qrl';
}

// ---------------------------------------------------------------------------
// QRL declaration generation
// ---------------------------------------------------------------------------

/**
 * Build a QRL const declaration string.
 *
 * Format (verified from all snapshots):
 * ```
 * const q_{symbolName} = /*#__PURE__* / qrl(()=>import("./{canonicalFilename}"), "{symbolName}");
 * ```
 *
 * Note: no space after `=>`, one space after PURE annotation.
 */
export function buildQrlDeclaration(
  symbolName: string,
  canonicalFilename: string,
  explicitExtensions?: boolean,
  segmentExtension?: string,
  outputExtension?: string,
): string {
  // When explicit extensions are requested, append the output extension.
  // The caller determines the correct extension based on transpilation settings:
  // - transpileTs: .js (TypeScript is fully stripped)
  // - transpileJsx only: .ts (JSX gone, TS remains)
  // - neither: source extension (.tsx, .ts, etc.)
  let ext = '';
  if (explicitExtensions) {
    ext = outputExtension ?? '.js';
  }
  return `const q_${symbolName} = /*#__PURE__*/ qrl(()=>import("./${canonicalFilename}${ext}"), "${symbolName}");`;
}

// ---------------------------------------------------------------------------
// sync$ transformation
// ---------------------------------------------------------------------------

/**
 * Minify a function body string for sync$ serialization.
 *
 * Strips comments, collapses whitespace, trims unnecessary whitespace
 * around operators, braces, and parens.
 */
function minifyFunctionText(text: string): string {
  let result = text;

  // Remove block comments /* ... */
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove line comments // ...
  result = result.replace(/\/\/[^\n]*/g, '');

  // Collapse consecutive whitespace to single space
  result = result.replace(/\s+/g, ' ');

  // Remove spaces around common operators and delimiters
  result = result.replace(/\s*([{}(),:;=<>+\-*/%&|!?.])\s*/g, '$1');

  // Trim
  result = result.trim();

  // Strip parentheses around single arrow function parameter
  // (event)=>{...} -> event=>{...}
  result = result.replace(/^\((\w+)\)=>/, '$1=>');

  return result;
}

/**
 * Build the sync$ transformation.
 *
 * sync$ does NOT extract a segment. Instead it wraps with:
 * `_qrlSync({originalFnText}, "{minifiedFnText}")`
 */
export function buildSyncTransform(originalFnText: string): string {
  const minified = minifyFunctionText(originalFnText);
  return `_qrlSync(${originalFnText}, "${minified}")`;
}

// ---------------------------------------------------------------------------
// PURE annotation
// ---------------------------------------------------------------------------

/** Set of Qrl callee names that get PURE annotations. */
const PURE_CALLEES = new Set(['componentQrl', 'qrl', 'qrlDEV']);

/**
 * Determine if a QRL wrapper call needs a PURE annotation.
 *
 * true for: componentQrl, qrl (in declarations)
 * false for: useTaskQrl, useStylesQrl, serverQrl, etc.
 */
export function needsPureAnnotation(qrlCalleeName: string): boolean {
  return PURE_CALLEES.has(qrlCalleeName);
}

// ---------------------------------------------------------------------------
// Import source
// ---------------------------------------------------------------------------

/** Known Qwik package prefixes -- mirrors QWIK_CORE_PREFIXES in marker-detection.ts */
const QWIK_PACKAGES = [
  '@qwik.dev/core',
  '@qwik.dev/react',
  '@qwik.dev/router',
  '@builder.io/qwik-react',
  '@builder.io/qwik-city',
  '@builder.io/qwik',
];

/** Check if a module source is a Qwik package. */
function isQwikPackage(source: string): boolean {
  for (const prefix of QWIK_PACKAGES) {
    if (source === prefix || source.startsWith(prefix + '/')) {
      return true;
    }
  }
  return false;
}

/**
 * Get the import source for a Qrl callee.
 *
 * For non-Qwik packages (e.g., 'forms', '@auth/qwik'), the Qrl variant
 * is imported from the same package as the original marker.
 * For Qwik packages, uses standard resolution (most from @qwik.dev/core).
 */
export function getQrlImportSource(qrlCalleeName: string, originalSource?: string): string {
  // Non-Qwik packages: import Qrl variant from the same package
  if (originalSource && !isQwikPackage(originalSource)) {
    return originalSource;
  }
  // Qwik sub-packages (not @qwik.dev/core): preserve the original source,
  // but rewrite legacy @builder.io/* to @qwik.dev/* first.
  if (originalSource && originalSource !== '@qwik.dev/core' &&
      originalSource !== '@builder.io/qwik' && isQwikPackage(originalSource)) {
    return rewriteImportSource(originalSource);
  }
  if (qrlCalleeName === 'qwikifyQrl') return '@qwik.dev/react';
  const ROUTER_QRLS = new Set([
    'globalActionQrl', 'routeActionQrl', 'routeLoaderQrl',
    'zodQrl',
  ]);
  if (ROUTER_QRLS.has(qrlCalleeName)) return '@qwik.dev/router';
  return '@qwik.dev/core';
}
