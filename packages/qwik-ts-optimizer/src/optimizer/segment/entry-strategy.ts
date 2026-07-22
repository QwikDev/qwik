type EntryStrategyType = 'smart' | 'segment' | 'hook' | 'component' | 'single' | 'inline' | 'hoist';

export function resolveEntryField(
  strategyType: EntryStrategyType,
  symbolName: string,
  ctxName: string,
  parentComponentSymbol: string | null,
  manual: Record<string, string> | undefined,
): string | null {
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
      if (ctxName === 'component') return null;
      return parentComponentSymbol ?? null;

    case 'single':
      return 'entry_hooks';

    default:
      return null;
  }
}
