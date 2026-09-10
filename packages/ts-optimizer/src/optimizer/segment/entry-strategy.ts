import { getFileStem } from '../../paths.js';

type EntryStrategyType = 'smart' | 'segment' | 'hook' | 'component' | 'single' | 'inline' | 'hoist';

interface EntrySegment {
  symbolName: string;
  origin: string;
  ctxKind: 'eventHandler' | 'function' | 'jSXProp';
  ctxName: string;
  captures: boolean;
}

function getRootComponent(segment: EntrySegment): string | null {
  const marker = '_component';
  const markerIndex = segment.symbolName.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const root = segment.symbolName.slice(0, markerIndex);
  const fileStem = getFileStem(segment.origin);
  const routeName = fileStem
    .match(/^\[\[\.\.\.(.+)\]\]$|^\[(.+)\]$/)
    ?.slice(1)
    .find(Boolean);
  return routeName === root ? fileStem : root;
}

function getComponentEntry(segment: EntrySegment): string | null {
  const root = getRootComponent(segment);
  return root ? `${segment.origin}_entry_${root}` : null;
}

export function resolveEntryField(
  strategyType: EntryStrategyType,
  segment: EntrySegment,
  manual: Record<string, string> | undefined
): string | null {
  if (manual && segment.symbolName in manual) {
    return manual[segment.symbolName]!;
  }

  switch (strategyType) {
    case 'single':
      return 'entry_segments';
    case 'inline':
    case 'hoist':
    case 'segment':
    case 'hook':
      return null;
    case 'component':
      return getComponentEntry(segment) ?? 'entry_segments';
    case 'smart':
      if (!segment.captures && (segment.ctxKind !== 'function' || segment.ctxName === 'event$')) {
        return null;
      }
      return getComponentEntry(segment);
  }
}
