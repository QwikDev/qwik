/**
 * In dev the browser derives a segment URL from its parent module (`<parent>_<symbol>.js`), so a
 * server-side QRL stand-in must name the authored module; otherwise the client requests
 * `/<symbol>.js` and 404s.
 */
import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';
import { testInput } from './snapshot-runner';

const SOURCE = `import { component$, useSignal } from '@qwik.dev/core';
import { server$ } from '@qwik.dev/router';
export default component$(() => {
  const count = useSignal(0);
  const read = server$(() => count.value);
  return <button onClick$={() => count.value++}>{count.value}</button>;
});
`;

const INPUT = { code: SOURCE, path: 'src/routes/index.tsx', devPath: '/src/routes/index.tsx' };
const OPTIONS = { mode: 'dev' as const, stripCtxName: ['server$'] };

async function serverModule(devPath?: string) {
  const output = await transformModules({
    ...OPTIONS,
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer: true,
    input: [{ ...INPUT, devPath }],
  });
  return output.modules.find((module) => module.path === INPUT.path)!.code;
}

describe('dev server QRL stand-ins', () => {
  test('ssr', () => testInput('ssr', 'dev-qrl-parent', INPUT, OPTIONS));
  test('csr', () => testInput('csr', 'dev-qrl-parent', INPUT, OPTIONS));

  test('name the authored module so the browser can derive the segment URL', async () => {
    const code = await serverModule(INPUT.devPath);
    expect(code).toMatch(
      /_noopQrlDEV\("index_q_e_click_segment_\d+_[a-z0-9]+", \{"file":"\/src\/routes\/index.tsx","lo":\d+,"hi":\d+\}\)/
    );
    expect(code).toMatch(
      /_noopQrlDEV\("index_read_segment_\d+_[a-z0-9]+", \{"file":"\/src\/routes\/index.tsx","lo":\d+,"hi":\d+\}\)/
    );
    expect(code).toMatch(/q_index_read_segment_\d+_[a-z0-9]+\.w\(\[count\]\)/);
    expect(code).not.toMatch(/\b_noopQrl\(/);
  });

  test('stay plain when no dev path is known', async () => {
    const code = await serverModule();
    expect(code).toMatch(/\b_noopQrl\("index_q_e_click_segment_/);
    expect(code).not.toContain('_noopQrlDEV');
  });
});
