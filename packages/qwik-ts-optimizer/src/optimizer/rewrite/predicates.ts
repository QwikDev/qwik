/**
 * Shared predicates over `ExtractionResult` and related extraction shapes.
 *
 * These exist because the same checks were inline-duplicated across
 * `inline-body.ts`, `output-assembly.ts`, `rewrite/index.ts`, and
 * `segment-codegen.ts`. Centralising here gives each predicate one
 * canonical home, prevents silent drift between copies, and lets future
 * MIG/F-cluster work pattern-match against named domain concepts rather
 * than rediscovering the inline form by reading surrounding code.
 */

import type { ExtractionResult } from '../extract.js';

/**
 * Whether `ext.calleeName` matches one of the registered context names
 * (e.g., `'server'` matches `server$`). Used to decide regCtxName-specific
 * code paths in inline body transformation, segment output assembly, and
 * top-level rewriting.
 *
 * Previously duplicated byte-for-byte in three modules; this is the
 * canonical version.
 */
export function matchesRegCtxName(ext: ExtractionResult, regCtxName?: string[]): boolean {
  if (!regCtxName || regCtxName.length === 0) return false;
  for (const name of regCtxName) {
    if (ext.calleeName === name + '$') return true;
  }
  return false;
}

/**
 * Whether the extraction's context is a JSX event handler attribute
 * (`onClick$`, etc.) or a JSX-prop binding. Both share the same
 * QRL-as-attribute output shape, so most rewriting code paths treat
 * them identically.
 */
export function isEventHandlerOrJsxProp(ctxKind: ExtractionResult['ctxKind'] | undefined): boolean {
  return ctxKind === 'eventHandler' || ctxKind === 'jSXProp';
}

/**
 * Whether the extraction's parameter list begins with `(_, _1, ...)` —
 * the SWC convention for loop callbacks where the first two slots are
 * positional placeholders for the surrounding loop's index and item.
 * Real captures begin at index 2.
 */
export function hasUnderscorePlaceholderParams(paramNames: string[]): boolean {
  return paramNames.length >= 2 && paramNames[0] === '_' && paramNames[1] === '_1';
}
