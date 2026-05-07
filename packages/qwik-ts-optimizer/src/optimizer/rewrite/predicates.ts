/**
 * Shared predicates over `ExtractionResult` and related extraction shapes.
 *
 * These exist because the same checks were inline-duplicated across
 * `inline-body.ts`, `output-assembly.ts`, `rewrite/index.ts`,
 * `segment-codegen.ts`, `transform/index.ts`, `transform/post-process.ts`,
 * `transform/segment-generation.ts`, and `strip-ctx.ts`. Centralising here
 * gives each predicate one canonical home, prevents silent drift between
 * copies, and lets future MIG/F-cluster work pattern-match against named
 * domain concepts rather than rediscovering the inline form by reading
 * surrounding code.
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

/**
 * Whether `ctxName` denotes a pre-extraction component segment — either
 * the source-level `component$(...)` marker or its already-named-Qrl
 * sibling `componentQrl(...)`.
 *
 * Use this when the caller is reasoning about extraction-time decisions
 * (e.g., applying `_rawProps` rewrites that only ever fire for
 * components). For the post-extraction "component" form synthesised
 * during inline-strategy emission, see {@link isAnyComponentCtx}.
 */
export function isComponentCtx(ctxName: string): boolean {
  return ctxName === 'component$' || ctxName === 'componentQrl';
}

/**
 * Whether `ctxName` denotes a component segment in any phase: the
 * pre-extraction `component$` / `componentQrl` markers OR the
 * post-extraction synthesised `'component'` ctxName used by the
 * inline-strategy hoist pipeline and HMR injection.
 *
 * Three-arm version of {@link isComponentCtx}. Use this when a code
 * path runs after extraction and must treat all component-shaped
 * segments uniformly (e.g., HMR injection in `post-process.ts`).
 */
export function isAnyComponentCtx(ctxName: string): boolean {
  return isComponentCtx(ctxName) || ctxName === 'component';
}

/**
 * Whether a segment should be stripped to a `null` body based on the
 * configured strip options.
 *
 * A segment is stripped when:
 * 1. Its ctxName starts with any prefix in `stripCtxName`, OR
 * 2. `stripEventHandlers` is true and ctxKind is `"eventHandler"`.
 *
 * Stripped segments emit `export const {symbolName} = null;` as their
 * code (see `generateStrippedSegmentCode` in `strip-ctx.ts`) and have
 * `loc` set to `[0, 0]`. Implements MODE-04, MODE-05.
 *
 * Lived in `strip-ctx.ts` until OSS-344 consolidated extraction
 * predicates here; the codegen counterpart stays in `strip-ctx.ts`.
 */
export function isStrippedSegment(
  ctxName: string,
  ctxKind: string,
  stripCtxName?: string[],
  stripEventHandlers?: boolean,
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
