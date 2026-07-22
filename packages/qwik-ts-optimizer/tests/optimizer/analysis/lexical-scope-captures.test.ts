
import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type {
  TransformModule,
  SegmentMetadataInternal,
} from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findSegment(modules: readonly TransformModule[]): TransformModule {
  const seg = modules.find((m) => m.kind === 'segment');
  if (!seg) throw new Error('expected a segment module in output');
  return seg;
}

function findParent(modules: readonly TransformModule[]): TransformModule {
  const parent = modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('expected a parent module in output');
  return parent;
}

function segmentMeta(m: TransformModule): SegmentMetadataInternal {
  if (m.kind !== 'segment') throw new Error('expected segment kind');
  return m.segment as SegmentMetadataInternal;
}

function transform(src: string) {
  return transformModule({
    input: [{ code: mkSourceText(src), path: mkFilePath('test.tsx') }],
    srcDir: mkFilePath('/tmp'),
    entryStrategy: { type: 'smart' },
    sourceMaps: false,
    mode: 'prod',
    transpileJsx: false,
  });
}

describe('Bug 3 — lexical scope chain for captures', () => {
  it('module-level arrow with marker call captures both outer param and outer const', () => {
    const src = `
import { useVisibleTask$, useContext } from '@qwik.dev/core';
export const usePreventNavigateQrl = (fn) => {
  const registerPreventNav = useContext(X);
  useVisibleTask$(() => registerPreventNav(fn));
};
`;
    const result = transform(src);
    const seg = findSegment(result.modules);
    const meta = segmentMeta(seg);

    expect(meta.captures).toBe(true);
    expect(meta.captureNames).toEqual(['fn', 'registerPreventNav']);

    expect(seg.code).toContain('_captures[0]');
    expect(seg.code).toContain('_captures[1]');

    const parent = findParent(result.modules);
    expect(parent.code).toMatch(/\.w\(\[\s*fn,\s*registerPreventNav\s*\]\)/);
  });

  it('module-level function declaration with marker call captures from its scope', () => {
    const src = `
import { useTask$ } from '@qwik.dev/core';
export function setup(initial) {
  const helper = initial * 2;
  useTask$(() => helper);
}
`;
    const result = transform(src);
    const meta = segmentMeta(findSegment(result.modules));
    expect(meta.captureNames).toEqual(['helper']);
    expect(meta.captures).toBe(true);
  });

  it('intermediate non-marker function between two markers contributes its scope', () => {
    const src = `
import { component$, useTask$ } from '@qwik.dev/core';
export const C = component$((props) => {
  const f = (x) => {
    useTask$(() => props.foo + x);
  };
  f(42);
});
`;
    const result = transform(src);
    const segs = result.modules.filter((m) => m.kind === 'segment');
    const inner = segs.find((m) =>
      m.kind === 'segment' && m.segment.ctxName === 'useTask$'
    );
    if (!inner) {
      throw new Error('expected a useTask$ segment');
    }
    const meta = segmentMeta(inner);
    expect(meta.captures).toBe(true);
    expect(meta.captureNames).toEqual(['props', 'x']);
  });

  it('component$ baseline still works (no regression)', () => {
    const src = `
import { component$, useVisibleTask$, useContext } from '@qwik.dev/core';
export const C = component$((props) => {
  const fn = props.fn;
  const registerPreventNav = useContext(X);
  useVisibleTask$(() => registerPreventNav(fn));
});
`;
    const result = transform(src);
    const segs = result.modules.filter((m) => m.kind === 'segment');
    const innerTask = segs.find((m) =>
      m.kind === 'segment' && m.segment.ctxName === 'useVisibleTask$'
    );
    if (!innerTask) {
      throw new Error('expected a useVisibleTask$ segment');
    }
    expect(segmentMeta(innerTask).captureNames).toEqual(['fn', 'registerPreventNav']);
  });

  it('negative scope: closure that references nothing outside still has no captures', () => {
    const src = `
import { useTask$ } from '@qwik.dev/core';
export const fn1 = () => {
  useTask$(() => 42);
};
`;
    const result = transform(src);
    const meta = segmentMeta(findSegment(result.modules));
    expect(meta.captures).toBe(false);
    expect(meta.captureNames).toEqual([]);
  });

  it('negative scope: sibling functions do not contribute their scope', () => {
    const src = `
import { useTask$ } from '@qwik.dev/core';
export const target = (a) => {
  useTask$(() => a + 1);
};
export const other = (y) => y * 2;
`;
    const result = transform(src);
    const meta = segmentMeta(findSegment(result.modules));
    expect(meta.captures).toBe(true);
    expect(meta.captureNames).toEqual(['a']);
    expect(meta.captureNames).not.toContain('y');
  });
});
