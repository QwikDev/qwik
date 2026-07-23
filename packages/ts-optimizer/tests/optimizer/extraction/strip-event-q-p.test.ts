import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transformDefault(source: string, extra: Record<string, unknown> = {}) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
    transpileTs: true,
    transpileJsx: true,
    ...extra,
  } as Parameters<typeof transformModule>[0]);
}

function transformInline(source: string, extra: Record<string, unknown> = {}) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'inline' },
    mode: 'test',
    transpileTs: true,
    transpileJsx: true,
    ...extra,
  } as Parameters<typeof transformModule>[0]);
}

describe('ctxKind + q:p propagation for stripped events', () => {
  describe('Fix 1: ctxKind harmonisation (default strategy so segments are separate modules)', () => {
    it('transpileJsx=true: HTML + `shouldRemove$` (non-on*) → eventHandler', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div shouldRemove$={() => 1}>x</div>;
});
`);
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.segment.ctxName === 'shouldRemove$'
      );
      if (handler?.kind !== 'segment') throw new Error('shouldRemove$ segment missing');
      expect(handler.segment.ctxKind).toBe('eventHandler');
    });

    it('transpileJsx=true: Component + `onClick$` → jSXProp (NOT eventHandler)', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  return <Card onClick$={() => 1}/>;
});
`);
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.segment.ctxName === 'onClick$'
      );
      if (handler?.kind !== 'segment') throw new Error('Card onClick$ segment missing');
      expect(handler.segment.ctxKind).toBe('jSXProp');
    });

    it('transpileJsx=false: Component + `onClick$` → eventHandler (name-prefix rule)', () => {
      const result = transformModule({
        input: [
          {
            path: mkFilePath('test.tsx'),
            code: mkSourceText(`
import { component$ } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  return <Card onClick$={() => 1}/>;
});
`),
          },
        ],
        srcDir: mkFilePath('.'),
        mode: 'test',
      });
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.segment.ctxName === 'onClick$'
      );
      if (handler?.kind !== 'segment') throw new Error('Card onClick$ segment missing');
      expect(handler.segment.ctxKind).toBe('eventHandler');
    });
  });

  describe('Fix 2: `q_<sym>.w([captures])` const-classification', () => {
    it('Component-prop QRL `.w([state])` lands in const-bag (3rd `_jsxSorted` arg)', () => {
      const result = transformInline(`
import { component$, useStore } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  const state = useStore({text: ''});
  return <Card render$={() => state.text}/>;
});
`);
      const parent = result.modules[0];
      expect(parent.code).toMatch(
        /_jsxSorted\(\s*Card\s*,\s*null\s*,\s*\{\s*render\$:\s*q_[A-Za-z_0-9]+\.w\(\[\s*state\s*\]\)/
      );
    });
  });

  describe('Fix 3: q:p propagation from stripped events (inline strategy)', () => {
    it('single capture from a stripped HTML event → emits `q:p: state` in var-bag', () => {
      const result = transformInline(
        `
import { component$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const state = useStore({text: ''});
  return (
    <div
      shouldRemove$={() => state.text}
      onClick$={() => console.log('parent', state)}
    >
      child
    </div>
  );
});
`,
        { stripEventHandlers: true }
      );
      const parent = result.modules[0];
      expect(parent.code).toMatch(/_jsxSorted\("div",\s*\{\s*"q:p":\s*state\s*\}/);
    });

    it('multi-capture union in source-decl order → emits `q:ps: [alpha, beta]`', () => {
      const result = transformInline(
        `
import { component$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const alpha = useStore({n: 0});
  const beta = useStore({n: 0});
  return (
    <div
      shouldRemove$={() => alpha.n}
      onClick$={() => beta.n}
    >
      x
    </div>
  );
});
`,
        { stripEventHandlers: true }
      );
      const parent = result.modules[0];
      expect(parent.code).toMatch(
        /_jsxSorted\("div",\s*\{\s*"q:ps":\s*\[\s*alpha\s*,\s*beta\s*\]\s*\}/
      );
    });

    it('negative scope: no strip config → no q:p injection', () => {
      const result = transformInline(`
import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div onClick$={() => 1}>x</div>;
});
`);
      const parent = result.modules[0];
      expect(parent.code).not.toMatch(/"q:ps?":/);
    });

    it('negative scope: Component element with stripEventHandlers → ctxKind is jSXProp (not stripped) → no q:p', () => {
      const result = transformInline(
        `
import { component$, useStore } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  const state = useStore({n: 0});
  return <Card onClick$={() => state.n}/>;
});
`,
        { stripEventHandlers: true }
      );
      const parent = result.modules[0];
      expect(parent.code).not.toMatch(/"q:ps?":/);
    });
  });
});
