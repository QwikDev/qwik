/**
 * Entry strategy resolution for the Qwik optimizer.
 *
 * Determines the `entry` field value in segment metadata based on
 * the configured entry strategy type.
 */
/**
 * Resolve the `entry` field for a segment's metadata based on the entry strategy.
 *
 * - smart/segment/hook: null (each segment is a separate file)
 * - component: parent component's symbol name for non-component segments; null for component segments
 * - single: fixed entry name (all segments grouped together)
 * - inline/hoist: null (no separate segment files)
 * - manual map overrides everything
 */
export function resolveEntryField(strategyType, symbolName, ctxName, parentComponentSymbol, manual) {
    if (manual && symbolName in manual) {
        return manual[symbolName];
    }
    switch (strategyType) {
        case 'smart':
        case 'segment':
        case 'hook':
        case 'inline':
        case 'hoist':
            return null;
        case 'component':
            if (ctxName === 'component')
                return null;
            return parentComponentSymbol ?? null;
        case 'single':
            return 'entry_hooks';
        default:
            return null;
    }
}
//# sourceMappingURL=entry-strategy.js.map