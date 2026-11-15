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
export default component$(() => { const label = useSignal('failed'); const existingFallback = $((error: Error) => <p>{label.value}: {error.message}</p>); const existingOnError = $((error: Error) => console.log(label.value, error.message)); function reportError(error: Error) { console.log(label.value, error.message); } return ${jsx}; });`,
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
    ['<Boundary fallback$={() => null} onError={() => {}} />', 'catch-attribute'],
    ['<Boundary fallback$={() => null} reset$={() => {}} />', 'catch-attribute'],
    ['<Boundary fallback$={() => null} onError$={[() => {}]} />', 'catch-attribute'],
    [
      '<Boundary fallback$={() => null} onError$={label.value ? reportError : null} />',
      'catch-attribute',
    ],
    ['<Boundary fallback$={[(error) => <p>{error.message}</p>]} />', 'catch-fallback'],
    ['<Boundary fallback$={[[() => null]]} />', 'catch-fallback'],
  ])('diagnoses an invalid boundary: %s', async (jsx, code) => {
    expect((await compile(jsx)).diagnostics).toMatchObject([{ code }]);
  });

  test.each([
    ['an inline callback', '(error, info) => console.log(label.value, error.message, info.phase)'],
    ['a $() callback', '$((error) => console.log(error.message))'],
    ['a local QRL', 'existingOnError'],
    ['a local function', 'reportError'],
  ])('passes onError$ given as %s to the boundary', async (_, onError) => {
    const output = await compile(
      `<Boundary fallback$={existingFallback} onError$={${onError}}><span>ready</span></Boundary>`
    );
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    const args = catchArguments(code, mode === 'csr' ? 'createCatch' : 'createSsrCatch');
    expect(args).toHaveLength(mode === 'csr' ? 6 : 5);
    expect(args.at(-1)).not.toMatch(/console\.log/);
  });

  test('passes no onError$ argument when the boundary has none', async () => {
    const output = await compile(
      '<Boundary fallback$={existingFallback}><span>ready</span></Boundary>'
    );
    const code = output.modules.map((module) => module.code).join('\n');
    const args = catchArguments(code, mode === 'csr' ? 'createCatch' : 'createSsrCatch');
    expect(args).toHaveLength(mode === 'csr' ? 5 : 4);
  });

  test('snapshots an onError$ callback with captures', async () => {
    const output = await testInput(mode, 'catch-on-error', {
      code: `import { component$, Catch, useSignal } from '@qwik.dev/core';
import { fallback } from './fallback';
export default component$(() => {
  const label = useSignal('boundary');
  return <Catch fallback$={fallback} onError$={(error, info) => console.log(label.value, error.message, info.phase)}><span>ready</span></Catch>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
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

test('SSR keeps Catch content and fallback tags available for inherited useOn', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    transpileTs: true,
    input: [
      {
        path: 'src/app.tsx',
        code: `import { component$, Catch, useOn, $, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  useOn('click', $(() => count.value++));
  return <Catch fallback$={() => <button id="fallback">{count.value}</button>}>
    <button id="content">{count.value}</button>
  </Catch>;
});`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const content = output.modules.find((module) => module.segment?.ctxName === 'catch:content')!;
  expect(content.code).toContain('createSsrOpenTag(');
  const fallback = output.modules.find((module) => module.segment?.ctxName === 'jsx')!;
  expect(fallback.code).toContain('createSsrOpenTag(');
});

/** The top-level arguments of the first `name(...)` call in `code`. */
function catchArguments(code: string, name: string): string[] {
  const start = code.indexOf(`${name}(`) + name.length + 1;
  const args: string[] = [];
  let depth = 0;
  let from = start;
  for (let i = start; i < code.length; i++) {
    const char = code[i];
    if ('([{'.includes(char)) {
      depth++;
    } else if (')]}'.includes(char) && depth-- === 0) {
      args.push(code.slice(from, i).trim());
      return args;
    } else if (char === ',' && depth === 0) {
      args.push(code.slice(from, i).trim());
      from = i + 1;
    }
  }
  return args;
}
