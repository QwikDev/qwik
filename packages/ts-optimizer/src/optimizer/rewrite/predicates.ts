/** Shared predicates over `ExtractionResult` and related extraction shapes. */

import type { ExtractionResult } from '../extraction/extract.js';

/** Whether `ext.calleeName` matches a registered context name (e.g., `'server'` matches `server$`). */
export function matchesRegCtxName(ext: ExtractionResult, regCtxName?: readonly string[]): boolean {
  if (!regCtxName || regCtxName.length === 0) {
    return false;
  }
  for (const name of regCtxName) {
    if (ext.calleeName === name + '$') {
      return true;
    }
  }
  return false;
}

/**
 * Whether the extraction's context is a JSX event handler (`onClick$`) or a JSX-prop binding — both
 * share the same QRL-as-attribute output shape.
 */
export function isEventHandlerOrJsxProp(ctxKind: ExtractionResult['ctxKind'] | undefined): boolean {
  return ctxKind === 'eventHandler' || ctxKind === 'jSXProp';
}

/** Whether the parameter list carries loop-handler positional padding. */
export function hasUnderscorePlaceholderParams(
  paramNames: readonly string[],
  movedCaptures?: boolean
): boolean {
  // Promotion appends captures after the (event, element) positions — with
  // preserved author params the padded prefix may be absent, so the
  // `movedCaptures` flag is the authoritative signal.
  if (movedCaptures && paramNames.length >= 3) {
    return true;
  }
  return paramNames.length >= 2 && paramNames[1] === '_1';
}

/**
 * Whether `ctxName` is a pre-extraction component segment — the source-level `component$(...)`
 * marker or its `componentQrl(...)` sibling. For the post-extraction `'component'` form, see
 * {@link isAnyComponentCtx}.
 */
export function isComponentCtx(ctxName: string): boolean {
  return ctxName === 'component$' || ctxName === 'componentQrl';
}

/**
 * Whether `ctxName` is a component segment in any phase: the pre-extraction
 * `component$`/`componentQrl` markers or the post-extraction `'component'` form. Three-arm version
 * of {@link isComponentCtx}.
 */
export function isAnyComponentCtx(ctxName: string): boolean {
  return isComponentCtx(ctxName) || ctxName === 'component';
}

/**
 * Whether a segment should be stripped to a `null` body: its ctxName starts with a `stripCtxName`
 * prefix, or `stripEventHandlers` is set and ctxKind is `"eventHandler"`. Stripped segments emit
 * `export const {symbolName} = null;`.
 */
export function isStrippedSegment(
  ctxName: string,
  ctxKind: string,
  stripCtxName?: readonly string[],
  stripEventHandlers?: boolean
): boolean {
  if (stripCtxName && stripCtxName.length > 0) {
    for (const prefix of stripCtxName) {
      if (ctxName.startsWith(prefix)) {
        return true;
      }
    }
  }

  if (stripEventHandlers && ctxKind === 'eventHandler') {
    return true;
  }

  return false;
}

/**
 * Strip decision for a whole extraction.
 *
 * `inlinedQrl` segments are pre-baked QRLs from an upstream tool and are **never** stripped,
 * regardless of `stripCtxName`/`stripEventHandlers`: stripping one whose ctxName happens to match a
 * strip prefix (e.g. a router lib's `serverQrl` dispatcher vs `stripCtxName: ['server']`) would
 * collapse its QRL to a chunkless `_noopQrl` and break `server$` RPC at runtime.
 */
export function isStrippedExtraction(
  ext: { readonly ctxName: string; readonly ctxKind: string; readonly isInlinedQrl?: boolean },
  stripCtxName?: readonly string[],
  stripEventHandlers?: boolean
): boolean {
  if (ext.isInlinedQrl) {
    return false;
  }
  return isStrippedSegment(ext.ctxName, ext.ctxKind, stripCtxName, stripEventHandlers);
}

export function advancesSentinelCounter(
  ext: { readonly parent: string | null; readonly ctxKind: string },
  isStripped: boolean
): boolean {
  return isStripped || (ext.parent !== null && ext.ctxKind !== 'jSXProp');
}

export function inlineSentinelStep(
  ext: ExtractionResult,
  isStripped: boolean,
  regCtxName?: readonly string[]
): number {
  if (!advancesSentinelCounter(ext, isStripped)) {
    return 0;
  }
  return matchesRegCtxName(ext, regCtxName) ? 3 : 2;
}
