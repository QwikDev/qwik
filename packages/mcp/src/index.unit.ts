import { expect, test } from 'vitest';
import { qwikMcp } from './index';
import { isLoopback } from './access';
import { transformComponentFile } from '../../devtools/plugin/src/transforms/component-transform';

test('internal endpoint addresses are restricted to loopback', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    expect(isLoopback(address)).toBe(true);
  }
  for (const address of [undefined, '192.168.1.2', '0.0.0.0', '::', '127.0.0.1.evil']) {
    expect(isLoopback(address)).toBe(false);
  }
});

test('MCP and DevTools reuse a single component collector', () => {
  const code =
    "import { component$, useSignal } from '@qwik.dev/core'; export default component$(() => { const count = useSignal(0); return <p>{count.value}</p>; });";
  const plugin = qwikMcp();
  const transform = plugin.transform as (code: string, id: string) => { code: string };
  const result = transform(code, '/src/root.tsx');
  expect(transformComponentFile(result.code, '/src/root.tsx')).toBe(result.code);
  expect((result.code.match(/const collecthook/g) ?? []).length).toBe(1);
});
