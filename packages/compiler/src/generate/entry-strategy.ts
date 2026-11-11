/** Which chunk group a segment joins: the v2 optimizers' entry rules, kept identical. */
import type { EntryStrategy, SegmentAnalysis } from '@qwik.dev/optimizer';

type EntrySegment = Pick<
  SegmentAnalysis,
  'name' | 'canonicalFilename' | 'origin' | 'ctxKind' | 'ctxName' | 'captures'
> & {
  rootContext: string | null;
  /** Referenced only by event handlers, so loading it never blocks a render. */
  isEventOnly: boolean;
};

export function resolveSegmentEntry(
  strategy: EntryStrategy | undefined,
  segment: EntrySegment
): string | null {
  if (strategy === undefined) {
    return null;
  }
  const manual =
    strategy.type === 'inline' || strategy.type === 'hoist' ? undefined : strategy.manual;
  if (manual !== undefined && segment.name in manual) {
    return manual[segment.name];
  }
  switch (strategy.type) {
    case 'single':
      return 'entry_segments';
    case 'inline':
    case 'hoist':
    case 'segment':
    case 'hook':
      return null;
    case 'component':
      return rootEntry(segment) ?? 'entry_segments';
    case 'smart':
      if (segment.isEventOnly) {
        return segment.canonicalFilename;
      }
      // Known events stay separate even when they capture state.
      if (
        segment.ctxKind === 'eventHandler' ||
        segment.ctxName === 'event$' ||
        (!segment.captures && segment.ctxKind !== 'function')
      ) {
        return null;
      }
      return rootEntry(segment);
  }
}

function rootEntry(segment: EntrySegment): string | null {
  return segment.rootContext === null ? null : `${segment.origin}_entry_${segment.rootContext}`;
}
