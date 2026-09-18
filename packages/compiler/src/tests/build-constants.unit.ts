/**
 * Build constants are the build's own answers: the link decides each read for the environment and
 * mode it is linking. Only the neutral plan leaves one standing, and no build produces that.
 */
import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';

const SOURCE = `import { isDev, isServer, useTask$ } from '@qwik.dev/core';
export default () => {
  useTask$(() => {
    observe(isServer, isDev);
  });
  return <b>x</b>;
};
`;

async function taskChunk(isServer: boolean, mode?: 'dev' | 'lib') {
  const output = await transformModules({
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer,
    ...(mode === undefined ? {} : { mode }),
    input: [{ path: 'src/app.tsx', code: SOURCE }],
  });
  return output.modules.find((module) => /useTaskqrl/.test(module.path))!.code;
}

describe('build constants', () => {
  test('a shorthand property keeps its key', async () => {
    const output = await transformModules({
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
      input: [
        {
          path: 'src/app.tsx',
          code: `import { isServer, useTask$ } from '@qwik.dev/core';
export default () => {
  useTask$(() => {
    observe({ isServer: isServer });
  });
  return <b>x</b>;
};
`,
        },
      ],
    });
    const chunk = output.modules.find((module) => /useTaskqrl/.test(module.path))!.code;
    expect(chunk).toContain('{ isServer: true }');
  });

  test('the server answers isServer true and the browser false', async () => {
    expect(await taskChunk(true)).toContain('observe(true, false)');
    expect(await taskChunk(false)).toContain('observe(false, false)');
  });

  test('dev answers isDev true, production false', async () => {
    expect(await taskChunk(true, 'dev')).toContain('observe(true, true)');
    expect(await taskChunk(true)).toContain('observe(true, false)');
  });

  test('a library build answers them too, since its environment is decided', async () => {
    expect(await taskChunk(true, 'lib')).toContain('observe(true, false)');
  });
});
