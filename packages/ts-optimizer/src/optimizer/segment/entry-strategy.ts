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

const RENDER_CTX_NAMES = new Set(['component$', 'useStyles$', 'useStylesScoped$']);

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

function getRootEntry(segment: EntrySegment, group: 'entry' | 'render' = 'entry'): string | null {
  const root = getRootEntryName(segment);
  return root ? `${segment.origin}_${group}_${root}` : null;
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
      return getRootEntry(segment, RENDER_CTX_NAMES.has(segment.ctxName) ? 'render' : 'entry');
  }
}
