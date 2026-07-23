import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('Inline strategy keeps captureNames intact for non-loop nested handlers', () => {
  it('emits inline-style body with _captures[N] unpacking + _rawProps.X rewriting', () => {
    const input = `
import { component$ } from '@qwik.dev/core';

export const AtomStatus = component$(({ctx, atom}) => {
  return (
    <span onClick$={(ev) => atomStatusClick(ctx, ev, [atom])}>
    </span>
  );
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const parent = findParent(result);
    const code = parent.code;

    expect(code).toContain('_captures');
    expect(code).toContain('_rawProps = _captures[0]');
    expect(code).toContain('_rawProps.atom');
    expect(code).toContain('_rawProps.ctx');
    expect(code).toMatch(/q_\w+\.w\(\[\s*_rawProps\s*\]\)/);
    expect(code).not.toMatch(/\(_,\s*_1,\s*atom,\s*ctx\)\s*=>/);
  });

  it('keeps Hoist strategy unchanged — still pads paramNames with (_, _1, capture)', () => {
    const input = `
import { component$, useSignal } from '@qwik.dev/core';

export const Foo = component$(({description = '', other}: any) => {
  const counter = useSignal(0);
  return (
    <button onClick$={() => counter.value++}>
      Increment
    </button>
  );
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'hoist' },
      transpileTs: true,
      transpileJsx: true,
    });

    const parent = findParent(result);
    const code = parent.code;

    expect(code).toMatch(/=\s*\(_,\s*_1,\s*counter\)\s*=>\s*counter\.value\+\+/);
    expect(code).not.toContain('_captures[0]');
  });

  it('default (smart) strategy keeps captureNames empty after promotion (segment-file path)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';

export const AtomStatus = component$(({ctx, atom}) => {
  return (
    <span onClick$={(ev) => atomStatusClick(ctx, ev, [atom])}>
    </span>
  );
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const eventHandlerSeg = result.modules.find(
      (m) => m.kind === 'segment' && m.path.includes('span_q_e_click')
    );
    expect(eventHandlerSeg?.code).toBeTruthy();
    expect(eventHandlerSeg!.code).toMatch(/\(_,\s*_1,\s*atom,\s*ctx\)\s*=>/);
  });
});

describe('q:p capture value resolves through _rawProps in the consolidated parent scope', () => {
  const INPUT = `
import { component$, useSignal } from '@qwik.dev/core';

export const Panel = component$(({ showAll }: any) => {
  return (
    <button onClick$={() => { showAll.value = true; }}>
      Show all
    </button>
  );
});
`;

  for (const strat of ['smart', 'hoist'] as const) {
    it(`${strat}: q:p delivers _rawProps.showAll, never the bare destructured name`, () => {
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(INPUT) }],
        srcDir: mkFilePath('.'),
        entryStrategy: { type: strat },
        transpileTs: true,
        transpileJsx: true,
      });

      const withQp = result.modules.find((m) => m.code.includes('"q:p"'));
      expect(withQp, 'expected a module emitting a q:p prop').toBeTruthy();
      const code = withQp!.code;

      expect(code, 'q:p value reaches the field via _rawProps').toContain(
        '"q:p": _rawProps.showAll'
      );
      expect(code, 'bare destructured name must not leak into the parent scope').not.toMatch(
        /"q:p":\s*showAll\b/
      );
    });
  }
});
