import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AppCommand } from '../utils/app-command';
import { log } from '@clack/prompts';
import { runV2Migration } from './run-migration';
import { createTmpProject } from './tools/tmp-project';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  confirm: vi.fn(async () => true),
  isCancel: () => false,
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock('./update-dependencies', () => ({
  installTsMorph: vi.fn(async () => false),
  removeTsMorphFromPackageJson: vi.fn(),
  updateDependencies: vi.fn(),
}));

describe('runV2Migration', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => project.cleanup());

  const migrate = () => runV2Migration({} as AppCommand);

  test('rescopes packages and renames qwik-city identifiers', async () => {
    project = createTmpProject({
      'package.json': JSON.stringify({
        devDependencies: { '@builder.io/qwik': '1', '@builder.io/qwik-city': '1' },
      }),
      'src/root.tsx': [
        `import { component$ } from '@builder.io/qwik';`,
        `import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city';`,
        `export default component$(() => <QwikCityProvider><RouterOutlet /></QwikCityProvider>);`,
      ].join('\n'),
    });
    await migrate();
    expect(JSON.parse(project.read('package.json')).devDependencies).toEqual({
      '@qwik.dev/core': '1',
      '@qwik.dev/router': '1',
    });
    expect(project.read('src/root.tsx')).toBe(
      [
        `import { component$ } from '@qwik.dev/core';`,
        `import { QwikRouterProvider, RouterOutlet } from '@qwik.dev/router';`,
        `export default component$(() => <QwikRouterProvider><RouterOutlet /></QwikRouterProvider>);`,
      ].join('\n')
    );
  });

  test('renames the qwik-city plan, vite plugin and qwik-react', async () => {
    project = createTmpProject({
      'package.json': JSON.stringify({ devDependencies: { '@builder.io/qwik-react': '0.5.0' } }),
      'vite.config.ts': [
        `import { qwikCity } from '@builder.io/qwik-city/vite';`,
        `import { qwikReact } from '@builder.io/qwik-react/vite';`,
        `export default { plugins: [qwikCity(), qwikReact()] };`,
      ].join('\n'),
      'src/entry.preview.tsx': [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
        `import qwikCityPlan from '@qwik-city-plan';`,
        `export default createQwikCity({ render, qwikCityPlan });`,
      ].join('\n'),
    });
    await migrate();
    expect(JSON.parse(project.read('package.json')).devDependencies).toEqual({
      '@qwik.dev/react': '0.5.0',
    });
    expect(project.read('vite.config.ts')).toBe(
      [
        `import { qwikRouter } from '@qwik.dev/router/vite';`,
        `import { qwikReact } from '@qwik.dev/react/vite';`,
        `export default { plugins: [qwikRouter({ strictLoaders: false }), qwikReact()] };`,
      ].join('\n')
    );
    expect(project.read('src/entry.preview.tsx')).toBe(
      [
        `import { createQwikRouter } from '@qwik.dev/router/middleware/node';`,
        `export default createQwikRouter({ render });`,
      ].join('\n')
    );
  });

  test('renames deprecated qwik-city exports', async () => {
    project = createTmpProject({
      'package.json': '{}',
      'src/a.tsx': [
        `import { QwikCityMockProvider, type QwikCityMockProps, type QwikCityMockActionProp, type QwikCityMockLoaderProp, type QwikCityPlan, type QwikCityProps } from '@builder.io/qwik-city';`,
        `import type { QwikCityBunOptions } from '@builder.io/qwik-city/middleware/bun';`,
        `import type { QwikCityVercelEdgeOptions } from '@builder.io/qwik-city/middleware/vercel-edge';`,
        `import { staticAdapter, type StaticGenerateRenderOptions } from '@builder.io/qwik-city/adapters/static/vite';`,
        `import type { StaticGenerateOptions } from '@builder.io/qwik-city/static';`,
      ].join('\n'),
    });
    await migrate();
    expect(project.read('src/a.tsx')).toBe(
      [
        `import { QwikRouterMockProvider, type QwikRouterMockProps, type QwikRouterMockActionProp, type QwikRouterMockLoaderProp, type QwikRouterConfig, type QwikRouterProps } from '@qwik.dev/router';`,
        `import type { QwikRouterBunOptions } from '@qwik.dev/router/middleware/bun';`,
        `import type { QwikRouterVercelEdgeOptions } from '@qwik.dev/router/middleware/vercel-edge';`,
        `import { ssgAdapter, type SsgRenderOptions } from '@qwik.dev/router/adapters/ssg/vite';`,
        `import type { SsgOptions } from '@qwik.dev/router/ssg';`,
      ].join('\n')
    );
  });

  test('renames qwik-city virtual modules', async () => {
    project = createTmpProject({
      'package.json': '{}',
      'src/entry.ts': [
        `import { isStaticPath } from '@qwik-city-static-paths';`,
        `import entries from '@qwik-city-entries';`,
        `import swRegister from '@qwik-city-sw-register';`,
        `import { getNotFound } from '@qwik-city-not-found-paths';`,
      ].join('\n'),
    });
    await migrate();
    expect(project.read('src/entry.ts')).toBe(
      [
        `import { isStaticPath } from '@qwik.dev/router/middleware/request-handler';`,
        `import entries from '@qwik-router-entries';`,
        `import swRegister from '@qwik-router-sw-register';`,
        `import { getNotFound } from '@qwik-city-not-found-paths';`,
      ].join('\n')
    );
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      expect.stringContaining('src/entry.ts: "@qwik-city-not-found-paths" does not exist in v2')
    );
  });

  test('renames the rollup plugin to rolldown', async () => {
    project = createTmpProject({
      'package.json': '{}',
      'rollup.config.ts': `import { qwikRollup, type QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';\nconst opts: QwikRollupPluginOptions = {};\nexport default { plugins: [qwikRollup(opts)] };`,
    });
    await migrate();
    expect(project.read('rollup.config.ts')).toBe(
      `import { qwikRolldown, type QwikRolldownPluginOptions } from '@qwik.dev/core/optimizer';\nconst opts: QwikRolldownPluginOptions = {};\nexport default { plugins: [qwikRolldown(opts)] };`
    );
  });

  test('renames the vercel edge function directory', async () => {
    project = createTmpProject({
      'package.json': '{}',
      'adapters/vercel-edge/vite.config.ts': `export default { build: { outDir: '.vercel/output/functions/_qwik-city.func' } };`,
    });
    await migrate();
    expect(project.read('adapters/vercel-edge/vite.config.ts')).toBe(
      `export default { build: { outDir: '.vercel/output/functions/_qwik-router.func' } };`
    );
  });

  test('keeps the jsx-runtime subpath and jsxs', async () => {
    project = createTmpProject({
      'package.json': '{}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { jsxImportSource: '@builder.io/qwik' } }),
      'src/a.ts': `import { jsx, jsxs } from '@builder.io/qwik/jsx-runtime';\njsxs('div', {});`,
    });
    await migrate();
    expect(project.read('src/a.ts')).toBe(
      `import { jsx, jsxs } from '@qwik.dev/core/jsx-runtime';\njsxs('div', {});`
    );
    expect(JSON.parse(project.read('tsconfig.json')).compilerOptions.jsxImportSource).toBe(
      '@qwik.dev/core'
    );
  });
});
