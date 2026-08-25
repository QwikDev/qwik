import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('flattened binding shadowing a browser global is captured by fnSignal', () => {
  // `const { url } = useLocation()` flattens to `const location = useLocation()`;
  // the local must shadow the `location` browser global (rust parity), or the
  // hoisted fnSignal references an undefined global during SSR.
  const code = `
import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
export default component$(() => {
  const { url } = useLocation();
  return <a class={{ 'is-active': url.pathname === '/x' }}>hi</a>;
});
`;
  const out = transformModule({
    input: [{ path: mkFilePath('routes/probe/index.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    entryStrategy: { type: 'hoist' },
  })
    .modules.map((m) => m.code)
    .join('\n');
  expect(out).toContain('const location = useLocation()');
  expect(out).toMatch(/_fnSignal\(_hf0, \[\s*location\s*\]/);
  expect(out).toContain('p0.url.pathname');
});
