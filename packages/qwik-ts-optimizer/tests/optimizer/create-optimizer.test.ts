import { describe, expect, it } from 'vitest';

import {
  createOptimizer,
  type OptimizerSystem,
  type SystemEnvironment,
} from '../../src/index.js';
import {
  mkFilePath,
  mkSourceText,
} from '../../src/optimizer/types/brands.js';

describe('createOptimizer', () => {
  it('resolves to an instance with transformModules + sys', async () => {
    const optimizer = await createOptimizer();

    expect(typeof optimizer.transformModules).toBe('function');
    expect(optimizer.sys).toBeDefined();
    expect(typeof optimizer.sys.cwd).toBe('function');
    expect(typeof optimizer.sys.path.join).toBe('function');
  });

  it('round-trips a minimal $() input through transformModules', async () => {
    const optimizer = await createOptimizer();
    const result = await optimizer.transformModules({
      srcDir: mkFilePath('/src'),
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(
            "import { $ } from '@qwik.dev/core'; export const x = $(() => 1);",
          ),
        },
      ],
    });

    expect(result.modules.length).toBe(2);
    expect(result.diagnostics.length).toBe(0);
    expect(result.isTypeScript).toBe(true);
    expect(result.isJsx).toBe(true);

    const parent = result.modules.find((m) => m.kind === 'parent');
    const segment = result.modules.find((m) => m.kind === 'segment');
    expect(parent).toBeDefined();
    expect(segment).toBeDefined();
  });

  it('preserves a custom sys when supplied via OptimizerOptions', async () => {
    const customSys: OptimizerSystem = {
      cwd: () => '/custom/cwd',
      env: 'deno' satisfies SystemEnvironment,
      os: 'custom-os',
      dynamicImport: (p) => Promise.resolve({ marker: 'custom', path: p }),
      strictDynamicImport: (p) =>
        Promise.resolve({ marker: 'custom', path: p }),
      path: {
        resolve: (...parts) => parts.join('/'),
        normalize: (p) => p,
        isAbsolute: (p) => p.startsWith('/'),
        join: (...parts) => parts.join('/'),
        relative: (_from, to) => to,
        dirname: (p) => p,
        basename: (p) => p,
        extname: () => '',
        format: (o) => `${o.dir}/${o.base}`,
        parse: (p) => ({ root: '', dir: '', base: p, ext: '', name: p }),
        sep: '/',
        delimiter: ':',
        win32: null,
        get posix(): OptimizerSystem['path'] {
          return customSys.path;
        },
      },
    };

    const optimizer = await createOptimizer({ sys: customSys });
    expect(optimizer.sys).toBe(customSys);
    expect(optimizer.sys.cwd()).toBe('/custom/cwd');
    expect(optimizer.sys.env).toBe('deno');
  });

  it('ignores passthrough OptimizerOptions fields without throwing', async () => {
    // binding / inlineStylesUpToBytes / sourcemap / _optimizer exist on the
    // type for SWC-parity but are not consumed by this implementation.
    const optimizer = await createOptimizer({
      binding: { fake: 'napi-binding' },
      inlineStylesUpToBytes: 4096,
      sourcemap: true,
      _optimizer: { swc: true },
    });

    expect(typeof optimizer.transformModules).toBe('function');
    expect(optimizer.sys.env).toBe('node');
  });

  it('default sys.path delegates to pathe (Node-compatible)', async () => {
    const { sys } = await createOptimizer();
    expect(sys.path.join('/a', 'b', 'c')).toBe('/a/b/c');
    expect(sys.path.isAbsolute('/foo')).toBe(true);
    expect(sys.path.extname('foo.tsx')).toBe('.tsx');
    expect(sys.path.sep).toBe('/');
    expect(sys.path.posix).toBe(sys.path);
  });

  it('exposes a Promise-shaped surface that the bundler `await`s through', async () => {
    // Mirrors qwik-bundler/src/rolldown.ts:354 shape:
    //   const result = await (await getOptimizer()).transformModules(opts);
    const factoryResult = createOptimizer();
    expect(factoryResult).toBeInstanceOf(Promise);

    const optimizer = await factoryResult;
    const transformResult = optimizer.transformModules({
      srcDir: mkFilePath('/src'),
      input: [
        {
          path: mkFilePath('noop.ts'),
          code: mkSourceText('export const x = 1;'),
        },
      ],
    });
    expect(transformResult).toBeInstanceOf(Promise);
    await expect(transformResult).resolves.toBeDefined();
  });
});
