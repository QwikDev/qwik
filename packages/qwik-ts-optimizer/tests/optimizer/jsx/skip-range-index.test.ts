/**
 * Tests for the binary-searchable skip-range index used by the JSX walk.
 *
 * The contract under test: for any skip-range set, querying the built
 * index gives exactly the same answer as the naive linear scan over the
 * original ranges ("is this node contained in at least one range?").
 * The index drops contained ranges and probes a single candidate, so the
 * interesting inputs are nested, partially-overlapping, and duplicate
 * ranges — shapes where a wrong candidate choice would diverge from the
 * linear scan.
 */

import { describe, it, expect } from 'vitest';
import { buildSkipRangeIndex, isInSkipRange } from '../../../src/optimizer/jsx/jsx.js';

type Range = { start: number; end: number };

function naiveIsInSkipRange(nodeStart: number, nodeEnd: number, ranges: Range[]): boolean {
  return ranges.some((r) => nodeStart >= r.start && nodeEnd <= r.end);
}

function expectParity(ranges: Range[], maxPos: number): void {
  const index = buildSkipRangeIndex(ranges);
  for (let start = 0; start <= maxPos; start++) {
    for (let end = start; end <= maxPos; end++) {
      expect(isInSkipRange(start, end, index), `node [${start}, ${end}] over ${JSON.stringify(ranges)}`)
        .toBe(naiveIsInSkipRange(start, end, ranges));
    }
  }
}

describe('skip-range index', () => {
  it('returns false for an empty range set', () => {
    expect(isInSkipRange(0, 10, buildSkipRangeIndex([]))).toBe(false);
  });

  it('matches the linear scan on disjoint ranges', () => {
    expectParity([{ start: 2, end: 5 }, { start: 8, end: 11 }], 13);
  });

  it('matches the linear scan on nested ranges', () => {
    // The wide range arrives after the narrow one, so a sort-free probe
    // of the rightmost start would pick the narrow range and miss
    // containment in the wide one.
    expectParity([{ start: 4, end: 6 }, { start: 0, end: 12 }, { start: 5, end: 5 }], 14);
  });

  it('matches the linear scan on partially overlapping ranges', () => {
    expectParity([{ start: 0, end: 7 }, { start: 4, end: 12 }], 14);
  });

  it('matches the linear scan on duplicate and same-start ranges', () => {
    expectParity(
      [{ start: 3, end: 9 }, { start: 3, end: 9 }, { start: 3, end: 5 }, { start: 6, end: 9 }],
      11,
    );
  });

  it('matches the linear scan on a deterministic pseudo-random sweep', () => {
    // Seeded LCG so the sweep is reproducible; covers range-set shapes
    // (counts 1-6 over a small coordinate space, forcing dense overlap)
    // the structured cases above don't enumerate.
    let seed = 0x2f6e2b1;
    const next = (bound: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % bound;
    };
    for (let trial = 0; trial < 50; trial++) {
      const count = 1 + next(6);
      const ranges: Range[] = [];
      for (let i = 0; i < count; i++) {
        const a = next(16);
        const b = next(16);
        ranges.push({ start: Math.min(a, b), end: Math.max(a, b) });
      }
      expectParity(ranges, 17);
    }
  });
});
