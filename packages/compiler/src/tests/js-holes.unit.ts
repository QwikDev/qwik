/**
 * A hole is authored JavaScript the plan carries as text. Under `forbid` the link names every one
 * the server reaches, which is the number step 10 drives down; client-only bodies stay text.
 */
import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';

const SOURCE = `import { component$, useComputed$, useTask$, useVisibleTask$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  const doubled = useComputed$(() => count.value * 2);
  useTask$(() => {
    observe(doubled.value);
  });
  useVisibleTask$(() => {
    observe(document.title);
  });
  return <button onClick$={() => count.value++}>{doubled.value}</button>;
});
`;

async function holes(isServer: boolean, jsHoles?: 'forbid') {
  const output = await transformModules({
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer,
    ...(jsHoles === undefined ? {} : { jsHoles }),
    input: [{ path: 'src/app.tsx', code: SOURCE }],
  });
  return output.diagnostics
    .filter((entry) => entry.code === 'js-hole')
    .map((entry) => entry.message);
}

describe('js holes', () => {
  test('names every body the server reaches', async () => {
    const reported = await holes(true, 'forbid');

    expect(reported).toHaveLength(2);
    expect(reported.join('\n')).toContain('useComputed$');
    expect(reported.join('\n')).toContain('useTask$');
  });

  test('leaves the browser its own bodies', async () => {
    const reported = (await holes(true, 'forbid')).join('\n');

    // an event handler and a visible task only ever run where there is a document
    expect(reported).not.toContain('onClick$');
    expect(reported).not.toContain('useVisibleTask$');
  });

  test('says nothing unless asked, and nothing for the browser', async () => {
    expect(await holes(true)).toEqual([]);
    expect(await holes(false, 'forbid')).toEqual([]);
  });
});
