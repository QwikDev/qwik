/**
 * Context name stripping logic for server/client mode.
 *
 * When stripCtxName is configured, segments whose ctxName starts with any
 * of the strip prefixes are replaced with null exports. Similarly,
 * stripEventHandlers replaces all eventHandler segments with null.
 *
 * Implements: MODE-04, MODE-05
 */
// ---------------------------------------------------------------------------
// Strip detection
// ---------------------------------------------------------------------------
/**
 * Determine if a segment should be stripped based on its context name and kind.
 *
 * A segment is stripped when:
 * 1. Its ctxName starts with any prefix in stripCtxName, OR
 * 2. stripEventHandlers is true and ctxKind is "eventHandler"
 *
 * Stripped segments emit `export const {symbolName} = null;` as their code
 * and have loc set to [0, 0].
 */
export function isStrippedSegment(ctxName, ctxKind, stripCtxName, stripEventHandlers) {
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
// ---------------------------------------------------------------------------
// Stripped segment code generation
// ---------------------------------------------------------------------------
/**
 * Generate the code for a stripped segment module.
 *
 * Format (verified from example_strip_server_code snapshot):
 * ```
 * export const {symbolName} = null;
 * ```
 */
export function generateStrippedSegmentCode(symbolName) {
    return `export const ${symbolName} = null;`;
}
//# sourceMappingURL=strip-ctx.js.map