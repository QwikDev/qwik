import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const transform = (code: string) =>
  transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'segment' },
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
  });

it('keeps the binding of a $-suffixed qrl const that is referenced', () => {
  // \b never matches after `$`, so the liveness regex missed real uses.
  const out = transform(`
import { component$, $ } from '@qwik.dev/core';
const handleClick$ = $(() => console.log('hi'));
export const A = component$(() => <button onClick$={handleClick$}>a</button>);
export const B = component$(() => <button onClick$={handleClick$}>b</button>);
`).modules.find((m) => m.kind === 'parent')!.code;
  expect(out).toContain('const handleClick$ = ');
});

it('classifies a $-prefixed store root the same as a plain one', () => {
  const fixture = (name: string) =>
    transform(`
import { component$, useStore } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const ${name} = useStore({ n: 0 });
  return <Inner value={${name}.n} />;
});
`)
      .modules.map((m) => m.code)
      .join('\n');
  // The $ prefix must not change const/var bag placement.
  const plain = fixture('zstate').replaceAll('zstate', 'X');
  const dollar = fixture('$state').replaceAll('$state', 'X');
  expect(dollar).toBe(plain);
});
