import { getFileStem } from '../../paths.js';

type EntryStrategyType = 'smart' | 'segment' | 'hook' | 'component' | 'single' | 'inline' | 'hoist';

interface EntrySegment {
  symbolName: string;
  rootContext: string | null;
  origin: string;
  ctxKind: 'eventHandler' | 'function' | 'jSXProp';
  ctxName: string;
  captures: boolean;
}

const routeParamFileStem = /^\[\[\.\.\.(.+)\]\]$|^\[(.+)\]$/;

/** Rust names a default export's entry after the raw file stem, brackets included. */
function getRootEntryName(segment: EntrySegment): string | null {
  const root = segment.rootContext;
  if (root === null) {
    return null;
  }
  const fileStem = getFileStem(segment.origin);
  const routeParam = fileStem.match(routeParamFileStem)?.slice(1).find(Boolean);
  return routeParam === root ? fileStem : root;
}

function getRootEntry(segment: EntrySegment): string | null {
  const root = getRootEntryName(segment);
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
      return getRootEntry(segment) ?? 'entry_segments';
    case 'smart':
      // Capture-free handlers load on their own; everything else loads with its root.
      if (!segment.captures && (segment.ctxKind !== 'function' || segment.ctxName === 'event$')) {
        return null;
      }
      return getRootEntry(segment);
  }
}
