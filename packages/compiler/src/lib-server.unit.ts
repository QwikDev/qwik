import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import { describe, expect, test } from 'vitest';
import { transformModules } from './index';

const input = {
  path: 'src/widget.tsx',
  code: `import { component$, useTask$, useSignal } from '@qwik.dev/core';
export const Widget = component$(() => {
  const count = useSignal(0);
  useTask$(() => {
    count.value = 1;
  });
  return <button onClick$={() => count.value++}>{count.value}</button>;
});`,
};

const options = (): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  explicitExtensions: true,
  preserveFilenames: true,
  isServer: true,
  mode: 'lib',
});

describe('lib ssr emission', () => {
  test('the server is never lazy: in-module implementations behind the build-env split', async () => {
    const result = await transformModules(options());
    const main = result.modules.find((module) => module.path.endsWith('widget.tsx'))!.code;

    const taskSymbol = result.modules.find((module) => module.segment?.ctxName === 'useTask$')!
      .segment!.name;
    const eventSymbol = result.modules.find((module) => module.segment?.ctxName === 'onClick$')!
      .segment!.name;

    // build-time env split: server resolves the in-module implementation, client folds to
    // the lazy chunk and drops it
    expect(main).toContain(`import { isServer as qwikBuildIsServer } from '@qwik.dev/core/build';`);
    // the server binds the lazy qrl in place, keeping the chunk name for serialization
    expect(main).toContain(`const q_${taskSymbol}_lazy = /*#__PURE__*/ _qrlWithChunk(`);
    expect(main).toContain(
      `const q_${taskSymbol} = qwikBuildIsServer ` +
        `? (q_${taskSymbol}_lazy.s(${taskSymbol}), q_${taskSymbol}_lazy) : q_${taskSymbol}_lazy;`
    );
    // the implementation itself lives in the module
    expect(main).toContain(`const ${taskSymbol} = `);

    // event segments never run on the server; their qrls stay lazy serialization carriers
    expect(main).toContain(`const q_${eventSymbol} = /*#__PURE__*/ _qrlWithChunk(`);
    expect(main).not.toContain(`q_${eventSymbol}_lazy`);
  });

  test('every client segment keeps a bare import edge, even when it has a pure qrl hoist', async () => {
    // an explicit `$()` value is the case that regressed: it hoists as a pure `q_` const, which a
    // consuming app drops together with the import edge, leaving the server naming a chunk that
    // was never built
    const explicitQrl = {
      path: 'src/widget.tsx',
      code: `import { component$, $, useSignal } from '@qwik.dev/core';
export const Widget = component$(() => {
  const count = useSignal(0);
  const bump = $(() => { count.value++; });
  return <button onClick$={bump}>{count.value}</button>;
});`,
    };
    const result = await transformModules({
      ...options(),
      input: [explicitQrl],
      isServer: false,
    });
    const main = result.modules.find((module) => module.path.endsWith('widget.tsx'))!.code;
    const segments = result.modules.flatMap((module) => module.segment ?? []);

    expect(segments.some((segment) => main.includes(`const q_${segment.name} = `))).toBe(true);
    for (const segment of segments) {
      // anchored: the pure `const q_… = _qrlWithChunk(…)` form contains the same call text
      const bareEdge = new RegExp(`^_qrlWithChunk\\("\\./widget\\.tsx_${segment.name}\\.js"`, 'm');
      expect(main).toMatch(bareEdge);
    }
  });
});
