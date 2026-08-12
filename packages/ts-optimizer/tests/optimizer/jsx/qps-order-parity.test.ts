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
  const qpsMatch = ssrCode.match(/"q:ps": \[([^\]]+)\]/);
  expect(qpsMatch, 'SSR q:ps present').toBeTruthy();
  const ssrOrder = qpsMatch![1].split(',').map((s) => s.trim());

  // Slot index per store from the client segments' param lists.
  const slotOf = new Map<string, number>();
  for (const m of client.modules) {
    const fn = m.code.match(/= \(([^)]*)\) => \{/);
    if (!fn) continue;
    const params = fn[1].split(',').map((s) => s.trim());
    for (let i = 2; i < params.length; i++) {
      if (params[i].startsWith('mouse')) slotOf.set(params[i], i - 2);
    }
  }
  expect(slotOf.size).toBe(3);
  const clientOrder = [...slotOf.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  expect(ssrOrder).toEqual(clientOrder);
});
