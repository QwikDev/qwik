/**
 * Tests for JSX key counter assignment order.
 *
 * SWC consumes JSX keys per source position: top-level extractions in
 * SOURCE order, with each subtree traversed depth-first (children'
 * JSX keys consumed before their parent). The pre-fix TS pipeline
 * consumed keys globally in depth-first sorted order (all depth-N
 * before depth-(N-1)), which mixes subtrees across top-level extractions
 * and produces SWC-divergent keys when two sibling top-level extractions
 * both contain JSX.
 *
 * Surfacing fixture: `example_qwik_conflict` (after the parent
 * mismatch from Bug A was fixed, the segment comparison exposed the
 * `u6_0`/`u6_1` swap between Foo's JSX and Root_1's nested JSX).
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transform(source: string) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
  });
}

function jsxKeysInOrder(code: string): string[] {
  const keys: string[] = [];
  const re = /"(u6_\d+)"/g;
  let match;
  while ((match = re.exec(code)) !== null) keys.push(match[1]);
  return keys;
}

describe('JSX key counter ordering', () => {
  it('assigns JSX keys to two sibling top-level component$ in source order', () => {
    // Foo at source position before Root. Both have JSX. SWC consumes
    // Foo's JSX key first.
    const source = `
import { component$ } from '@qwik.dev/core';

export const Foo = component$(() => {
  return <div>Foo</div>;
});

export const Root = component$(() => {
  return <span>Root</span>;
});
`;
    const result = transform(source);
    const segments = result.modules.filter(m => m.kind === 'segment');

    const fooSeg = segments.find(s => s.kind === 'segment' && s.segment.name.startsWith('Foo_'));
    const rootSeg = segments.find(s => s.kind === 'segment' && s.segment.name.startsWith('Root_'));
    if (fooSeg?.kind !== 'segment' || rootSeg?.kind !== 'segment') {
      throw new Error('expected Foo and Root segments');
    }

    // Foo's body JSX gets the lower key (source-order first).
    expect(jsxKeysInOrder(fooSeg.code)).toEqual(['u6_0']);
    expect(jsxKeysInOrder(rootSeg.code)).toEqual(['u6_1']);
  });

  it('within a single subtree assigns keys depth-first (child JSX before parent JSX)', () => {
    // Inner is nested inside Foo. Inner has its own JSX, Foo has its
    // own JSX. SWC's rule: depth-first within the subtree — Inner's keys
    // come before Foo's. The exact intra-segment count depends on how the
    // JSX transform classifies children; assert only that Inner's last
    // key is strictly less than Foo's first key (the cross-segment
    // ordering is what this test pins).
    const source = `
import { component$, useSignal } from '@qwik.dev/core';

const Foo = component$(() => {
  const data = useSignal([]);
  const Inner = component$(() => {
    return <p>nested</p>;
  });
  return <Inner data={data} />;
});
`;
    const result = transform(source);
    const innerSeg = result.modules.find(
      m => m.kind === 'segment' && m.segment.name.includes('Inner_component'),
    );
    const fooSeg = result.modules.find(
      m => m.kind === 'segment' && m.segment.name.startsWith('Foo_component_') &&
        !m.segment.name.includes('Inner'),
    );
    if (innerSeg?.kind !== 'segment' || fooSeg?.kind !== 'segment') {
      throw new Error('expected Inner and Foo segments');
    }

    const innerKeys = jsxKeysInOrder(innerSeg.code);
    const fooKeys = jsxKeysInOrder(fooSeg.code);
    expect(innerKeys.length).toBeGreaterThan(0);
    expect(fooKeys.length).toBeGreaterThan(0);
    // Cross-segment ordering: Inner's keys are all numerically less
    // than Foo's keys (depth-first within Foo's subtree consumes
    // Inner's JSX first).
    const lastInner = parseInt(innerKeys[innerKeys.length - 1].slice(3), 10);
    const firstFoo = parseInt(fooKeys[0].slice(3), 10);
    expect(lastInner).toBeLessThan(firstFoo);
  });

  it('skips segments that have no JSX (no key consumed for empty bodies)', () => {
    // Foo's body has JSX (1 key). The click handler is a nested segment
    // with no JSX. Root has its own JSX (gets the next key).
    const source = `
import { component$ } from '@qwik.dev/core';

export const Foo = component$(() => {
  return <button onClick$={() => console.log('hi')}>X</button>;
});

export const Root = component$(() => {
  return <span/>;
});
`;
    const result = transform(source);
    const clickSeg = result.modules.find(
      m => m.kind === 'segment' && m.segment.ctxKind === 'eventHandler',
    );
    const rootSeg = result.modules.find(
      m => m.kind === 'segment' && m.segment.name.startsWith('Root_component_'),
    );
    if (clickSeg?.kind !== 'segment' || rootSeg?.kind !== 'segment') {
      throw new Error('expected click handler and Root segments');
    }

    // Click handler segment has no JSX → no keys.
    expect(jsxKeysInOrder(clickSeg.code)).toEqual([]);
    // Root's JSX consumes the next key after Foo's u6_0 — that's u6_1.
    expect(jsxKeysInOrder(rootSeg.code)).toEqual(['u6_1']);
  });
});
