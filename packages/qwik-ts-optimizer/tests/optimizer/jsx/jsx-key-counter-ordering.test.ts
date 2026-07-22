
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

    expect(jsxKeysInOrder(fooSeg.code)).toEqual(['u6_0']);
    expect(jsxKeysInOrder(rootSeg.code)).toEqual(['u6_1']);
  });

  it('within a single subtree assigns keys depth-first (child JSX before parent JSX)', () => {
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
    const lastInner = parseInt(innerKeys[innerKeys.length - 1].slice(3), 10);
    const firstFoo = parseInt(fooKeys[0].slice(3), 10);
    expect(lastInner).toBeLessThan(firstFoo);
  });

  it('skips segments that have no JSX (no key consumed for empty bodies)', () => {
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

    expect(jsxKeysInOrder(clickSeg.code)).toEqual([]);
    expect(jsxKeysInOrder(rootSeg.code)).toEqual(['u6_1']);
  });
});
