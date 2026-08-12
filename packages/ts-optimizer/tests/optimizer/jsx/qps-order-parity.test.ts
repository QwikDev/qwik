import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

// Three scoped handlers on one element, each capturing a different store. The
// client build assigns each handler a positional slot; the SSR build must
// serialize `q:ps` in exactly that slot order or resumed handlers write into
// the wrong store.
const code = `
import { component$, useStore } from '@qwik.dev/core';
export const MouseEvents = component$(() => {
  const mouseDoc2 = useStore({ x: 0, y: 0 });
  const mouseWin2 = useStore({ x: 0, y: 0 });
  const mouseSelf2 = useStore({ x: 0, y: 0 });
  return (
    <div
      onMouseMove$={(event) => {
        mouseSelf2.x = event.clientX;
      }}
      window:onMouseMove$={(event) => {
        mouseWin2.x = event.clientX;
      }}
      document:onMouseMove$={(event) => {
        mouseDoc2.x = event.clientX;
      }}
    >
      <p>{mouseSelf2.x}</p>
    </div>
  );
});
export const CaseSort = component$(() => {
  const colors = useStore({ n: 0 });
  const colorSignal = useStore({ v: 'black' });
  return (
    <button
      id="case-sort"
      onClick$={() => {
        colors.n++;
        colorSignal.v = String(colors.n);
      }}
    >
      go
    </button>
  );
});
`;

it('SSR q:ps order matches client handler param slots', () => {
  const base = {
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev' as const,
  };
  const ssr = transformModule({
    ...base,
    isServer: true,
    entryStrategy: { type: 'hoist' },
    stripCtxName: ['useVisibleTask'],
    stripEventHandlers: true,
  });
  const client = transformModule({
    ...base,
    isServer: false,
    entryStrategy: { type: 'segment' },
  });

  const ssrCode = ssr.modules.map((m) => m.code).join('\n');
  const qpsArrays = [...ssrCode.matchAll(/"q:ps": \[([^\]]+)\]/g)].map((m) =>
    m[1].split(',').map((s) => s.trim())
  );
  expect(qpsArrays.length, 'SSR q:ps present').toBe(2);

  // Slot index per capture from the client segments' param lists.
  const slots = new Map<string, Map<string, number>>();
  for (const m of client.modules) {
    const fn = m.code.match(/= \(([^)]*)\) => \{/);
    if (!fn) continue;
    const params = fn[1].split(',').map((s) => s.trim());
    for (let i = 2; i < params.length; i++) {
      if (/^(mouse|color)/.test(params[i])) {
        const group = params[i].startsWith('mouse') ? 'mouse' : 'color';
        let map = slots.get(group);
        if (!map) slots.set(group, (map = new Map()));
        const prev = map.get(params[i]);
        if (prev !== undefined) expect(prev, `slot for ${params[i]}`).toBe(i - 2);
        map.set(params[i], i - 2);
      }
    }
  }
  for (const [group, map] of slots) {
    const clientOrder = [...map.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
    const ssrOrder = qpsArrays.find((arr) => arr[0].startsWith(group));
    expect(ssrOrder, `q:ps for ${group} group`).toEqual(clientOrder);
  }
});
