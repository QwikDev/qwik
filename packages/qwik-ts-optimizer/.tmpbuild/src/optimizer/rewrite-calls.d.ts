/**
 * Call form rewriting utilities for the Qwik optimizer.
 *
 * Transforms marker function calls to their Qrl equivalents:
 * - component$ -> componentQrl
 * - useTask$ -> useTaskQrl
 * - $ -> (bare QRL reference, no wrapper)
 * - sync$ -> _qrlSync
 */
/**
 * Get the Qrl callee name from a marker name.
 *
 * - "$" -> "" (bare QRL, no wrapper)
 * - "sync$" -> "_qrlSync"
 * - "component$" -> "componentQrl"
 * - "useTask$" -> "useTaskQrl"
 */
export declare function getQrlCalleeName(markerName: string): string;
/**
 * Build a QRL const declaration string.
 *
 * When explicit extensions are requested, appends the output extension.
 */
export declare function buildQrlDeclaration(symbolName: string, canonicalFilename: string, explicitExtensions?: boolean, _segmentExtension?: string, outputExtension?: string): string;
/**
 * Build the sync$ transformation.
 * sync$ does NOT extract a segment -- it wraps with _qrlSync instead.
 */
export declare function buildSyncTransform(originalFnText: string): string;
/**
 * Determine if a QRL wrapper call needs a PURE annotation.
 */
export declare function needsPureAnnotation(qrlCalleeName: string): boolean;
/**
 * Get the import source for a Qrl callee.
 *
 * Non-Qwik packages import the Qrl variant from the same package.
 * Qwik sub-packages preserve their source (with legacy rewriting).
 */
export declare function getQrlImportSource(qrlCalleeName: string, originalSource?: string): string;
//# sourceMappingURL=rewrite-calls.d.ts.map