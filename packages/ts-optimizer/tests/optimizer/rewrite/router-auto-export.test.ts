import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function routeTransform(code: string): string {
  return transformModule({
    input: [{ path: mkFilePath('routes/probe/index.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
    stripEventHandlers: true,
    regCtxName: ['server'],
  })
    .modules.map((m) => m.code)
    .join('\n');
}

it('router-marker detection is structural, not textual', () => {
  const out = routeTransform(`
import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
const hint = 'x = routeLoader$(y)';
const limit = 5, useM = routeLoader$(async () => 6);
const useC = routeLoader$(async () => 7) as any;
export default component$(() => <div title={hint}>{limit}{useM().value}{useC().value}</div>);
`);
  // A loader-shaped string or a sibling declarator must not surface.
  expect(out).not.toContain('_auto_hint');
  expect(out).not.toContain('_auto_limit');
  expect(out).toContain('export { useM as _auto_useM };');
  // A TS as-cast around the marker call still counts.
  expect(out).toContain('export { useC as _auto_useC };');
});

it('un-exported loaders and actions surface as _auto_ exports', () => {
  // The router discovers loaders/actions by scanning route-module exports.
  const code = `
import { component$ } from '@qwik.dev/core';
import { routeLoader$, routeAction$, globalAction$, server$ } from '@qwik.dev/router';
const useL = routeLoader$(async () => 1);
const useA = routeAction$(async () => 2);
const useG = globalAction$(async () => 3);
const fn = server$(() => 4);
export default component$(() => <div onClick$={() => fn()}>{useL().value}{useA().actionPath}{useG().actionPath}</div>);
`;
  const out = transformModule({
    input: [{ path: mkFilePath('routes/probe/index.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
    stripEventHandlers: true,
    regCtxName: ['server'],
  })
    .modules.map((m) => m.code)
    .join('\n');
  expect(out).toContain('export { useA as _auto_useA };');
  expect(out).toContain('export { useG as _auto_useG };');
  expect(out).toContain('export { useL as _auto_useL };');
  // server$ results are not export-scanned — no auto export (rust parity).
  expect(out).not.toContain('_auto_fn');
});
