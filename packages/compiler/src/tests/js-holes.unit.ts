/**
 * A body carried as JavaScript text costs a JavaScript engine nothing and costs a native one an
 * embedded runtime, so only a native target hears about it. `native$` is the author's answer.
 */
import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';

const SOURCE = `import { component$, useComputed$, useTask$, useVisibleTask$, useSignal } from '@qwik.dev/core';
import { Button } from './button';
export default component$(() => {
  const count = useSignal(0);
  const doubled = useComputed$(() => count.value * 2);
  useTask$(() => {
    observe(doubled.value);
  });
  useVisibleTask$(() => {
    observe(document.title);
  });
  return (
    <div onClick$={() => count.value++}>
      <Button click$={() => count.value++}>{doubled.value}</Button>
    </div>
  );
});
`;

async function holes(isServer: boolean, engine?: 'native') {
  const output = await transformModules({
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer,
    ...(engine === undefined ? {} : { engine }),
    input: [{ path: 'src/app.tsx', code: SOURCE }],
  });
  return output.diagnostics
    .filter((entry) => entry.code === 'js-hole')
    .map((entry) => entry.message);
}

describe('js holes', () => {
  test('names every body the server reaches, as a warning', async () => {
    const reported = await holes(true, 'native');

    expect(reported).toHaveLength(2);
    expect(reported.join('\n')).toContain('native$');
    expect(reported.join('\n')).toContain('useComputed$');
    expect(reported.join('\n')).toContain('useTask$');
  });

  test('leaves the browser its own bodies', async () => {
    const reported = (await holes(true, 'native')).join('\n');

    // the server writes these into the HTML and the browser runs them, whatever they are called
    expect(reported).not.toContain('onClick$');
    expect(reported).not.toContain('click$');
    expect(reported).not.toContain('useVisibleTask$');
  });

  test('says nothing to a javascript engine, nor about the browser', async () => {
    expect(await holes(true)).toEqual([]);
    expect(await holes(false, 'native')).toEqual([]);
  });
});
