import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function segments(source: string): readonly TransformModule[] {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'segment' },
    transpileTs: true,
    transpileJsx: true,
  });
  return result.modules.filter((m) => m.kind === 'segment');
}

// A `*Qrl` callee only resolves to core when nothing better is known. When the
// module actually imports it, that import names the package it comes from.
describe('migrated *Qrl callees keep the package they were imported from', () => {
  it('imports reactifyQrl from @qwik.dev/react, not @qwik.dev/core', () => {
    const mods = segments(`
/** @jsxImportSource react */
import { qwikify$, reactify$ } from '@qwik.dev/react';
import { QwikCounter } from './counter';

const Counter = reactify$(QwikCounter);

function Card() {
  return <div><Counter label="Clicks" /></div>;
}

export const QCard = qwikify$(Card, { eagerness: 'idle' });
`);
    const withReactify = mods.filter((m) => m.code.includes('reactifyQrl'));
    expect(withReactify.length).toBeGreaterThan(0);
    for (const mod of withReactify) {
      expect(mod.code).not.toMatch(
        /import \{[^}]*reactifyQrl[^}]*\} from ["']@qwik\.dev\/core["']/
      );
      expect(mod.code).toMatch(/import \{[^}]*reactifyQrl[^}]*\} from ["']@qwik\.dev\/react["']/);
    }
  });

  it('keeps a non-qwik package source for its own $ marker', () => {
    const mods = segments(`
import { component$ } from '@qwik.dev/core';
import { custom$ } from 'some-lib';

const thing = custom$(() => 1);

export const C = component$(() => {
  return <div onClick$={() => thing()}>x</div>;
});
`);
    for (const mod of mods.filter((m) => m.code.includes('customQrl'))) {
      expect(mod.code).toMatch(/import \{[^}]*customQrl[^}]*\} from ["']some-lib["']/);
    }
  });
});
