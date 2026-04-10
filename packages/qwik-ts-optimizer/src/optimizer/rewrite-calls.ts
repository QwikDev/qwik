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
): string {
  return `const q_${symbolName} = /*#__PURE__*/ qrl(()=>import("./${canonicalFilename}"), "${symbolName}");`;
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

/**
 * Get the import source for a Qrl callee.
 *
 * Most come from @qwik.dev/core, but qwikifyQrl comes from @qwik.dev/react.
 */
export function getQrlImportSource(qrlCalleeName: string): string {
  if (qrlCalleeName === 'qwikifyQrl') return '@qwik.dev/react';
  return '@qwik.dev/core';
}
