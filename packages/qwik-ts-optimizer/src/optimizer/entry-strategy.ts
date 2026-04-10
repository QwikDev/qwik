/**
 * Entry strategy resolution for the Qwik optimizer.
 *
 * Determines the `entry` field value in segment metadata based on
 * the configured entry strategy type.
 *
 * Implements: ENT-01, ENT-03, ENT-04
 */

// ---------------------------------------------------------------------------
// Entry strategy types
// ---------------------------------------------------------------------------

type EntryStrategyType = 'smart' | 'segment' | 'hook' | 'component' | 'single' | 'inline' | 'hoist';

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Resolve the `entry` field for a segment's metadata based on the entry strategy.
 *
 * - smart/segment/hook: null (each segment is a separate file)
 * - component: parent component's symbol name for non-component segments; null for component segments
 * - single: fixed entry name (all segments grouped together)
 * - manual map: overrides the strategy-based value if the symbol is in the map
 *
 * @param strategyType - The entry strategy type
 * @param symbolName - The segment's symbol name
 * @param ctxName - The context name (e.g., "component", "useTask")
 * @param parentComponentSymbol - The nearest parent component's symbol name, or null
 * @param manual - Optional manual map for custom entry grouping
 * @returns The entry field value, or null
 */
export function resolveEntryField(
  strategyType: EntryStrategyType,
  symbolName: string,
  ctxName: string,
  parentComponentSymbol: string | null,
  manual: Record<string, string> | undefined,
): string | null {
  // Manual map overrides everything
  if (manual && symbolName in manual) {
    return manual[symbolName];
  }

  switch (strategyType) {
    case 'smart':
    case 'segment':
    case 'hook':
      return null;

    case 'component':
      // Component segments themselves get null entry;
      // non-component segments get their parent component's symbol
      if (ctxName === 'component') return null;
      return parentComponentSymbol ?? null;

    case 'single':
      return 'entry_hooks';

    case 'inline':
    case 'hoist':
      // Inline/hoist strategies don't emit separate segment files,
      // entry field is not relevant but return null for consistency
      return null;

    default:
      return null;
  }
}
