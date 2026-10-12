import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';
import { testInput } from './snapshot-runner';

describe.each(['csr', 'ssr'] as const)('%s: Catch', (mode) => {
  const compile = (jsx: string) =>
    transformModules({
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: mode === 'ssr',
      input: [
        {
          path: 'src/app.tsx',
          code: `import { component$, Catch as Boundary, $, useSignal } from '@qwik.dev/core';
export default component$(() => { const label = useSignal('failed'); const existingFallback = $((error: Error) => <p>{label.value}: {error.message}</p>); return ${jsx}; });`,
        },
      ],
    });

  test.each([
    '<Boundary fallback$={(error) => <p>{label.value}: {error.message}</p>}><span>ready</span></Boundary>',
    '<Boundary fallback$={$((error) => error.message)}><span>ready</span></Boundary>',
    '<Boundary fallback$={existingFallback}><span>ready</span></Boundary>',
  ])('erases the marker and lowers the fallback: %s', async (jsx) => {
    const output = await compile(jsx);
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).toContain(mode === 'csr' ? 'createCatch' : 'createSsrCatch');
    expect(code).not.toContain('Catch as Boundary');
    expect(code).toContain(mode === 'csr' ? 'createDynamicContent' : 'renderSsrDynamicContent');
    expect(code).toMatch(/\(ctx\d*, error\d*\)/);
  });

  test.each([
    ['<Boundary><span>ready</span></Boundary>', 'catch-fallback'],
    ['<Boundary fallback$={() => null} onError$={() => {}} />', 'catch-attribute'],
    ['<Boundary fallback$={[(error) => <p>{error.message}</p>]} />', 'catch-fallback'],
    ['<Boundary fallback$={[[() => null]]} />', 'catch-fallback'],
  ])('diagnoses an invalid boundary: %s', async (jsx, code) => {
    expect((await compile(jsx)).diagnostics).toMatchObject([{ code }]);
  });

  test('snapshots the content program and an imported fallback', async () => {
    const output = await testInput(mode, 'catch-boundary', {
      code: `import { component$, Catch, useSignal } from '@qwik.dev/core';
import { fallback } from './fallback';
export default component$(() => {
  const count = useSignal(0);
  return <section><Catch fallback$={fallback}><button onClick$={() => count.value++}>{count.value}</button></Catch></section>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules.map((module) => module.code).join('\n')).toContain(
      mode === 'csr' ? 'createDynamicContent' : 'renderSsrDynamicContent'
    );
    expect(output.modules.map((module) => module.code).join('\n')).toContain(
      mode === 'csr' ? 'createCatch' : 'createSsrCatch'
    );
  });
});
