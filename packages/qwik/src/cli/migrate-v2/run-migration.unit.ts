import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AppCommand } from '../utils/app-command';
import { log } from '@clack/prompts';
import { runV2Migration } from './run-migration';
import { updateDependencies } from './update-dependencies';
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

const V1_PACKAGE_JSON = JSON.stringify({ devDependencies: { '@builder.io/qwik': '1' } });

/** Reads every project file, to compare the project before and after a migration. */
const readFiles = (project: ReturnType<typeof createTmpProject>, paths: string[]) =>
  Object.fromEntries(paths.map((path) => [path, project.exists(path) && project.read(path)]));

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
        `import { component$, useStyles$ } from '@qwik.dev/core';`,
        `import { QwikRouterProvider, RouterOutlet } from '@qwik.dev/router';`,
        `export default component$(() => {`,
        '  useStyles$(`:root{view-transition-name:none}`);',
        `  return <QwikRouterProvider viewTransition={true}><RouterOutlet /></QwikRouterProvider>;`,
        `});`,
      ].join('\n')
    );
  });

  test('renames the qwik-city plan, vite plugin and qwik-react', async () => {
    project = createTmpProject({
      'package.json': JSON.stringify({
        devDependencies: { '@builder.io/qwik': '1', '@builder.io/qwik-react': '0.5.0' },
      }),
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
      '@qwik.dev/core': '1',
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
        `export default createQwikRouter({ render, requestBodyLimit: Number.MAX_SAFE_INTEGER });`,
      ].join('\n')
    );
  });

  test('renames deprecated qwik-city exports', async () => {
    project = createTmpProject({
      'package.json': V1_PACKAGE_JSON,
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
      'package.json': V1_PACKAGE_JSON,
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
      'package.json': V1_PACKAGE_JSON,
      'rollup.config.ts': `import { qwikRollup, type QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';\nconst opts: QwikRollupPluginOptions = {};\nexport default { plugins: [qwikRollup(opts)] };`,
    });
    await migrate();
    expect(project.read('rollup.config.ts')).toBe(
      `import { qwikRolldown, type QwikRolldownPluginOptions } from '@qwik.dev/core/optimizer';\nconst opts: QwikRolldownPluginOptions = {};\nexport default { plugins: [qwikRolldown(opts)] };`
    );
  });

  test('renames the vercel edge function directory', async () => {
    project = createTmpProject({
      'package.json': V1_PACKAGE_JSON,
      'adapters/vercel-edge/vite.config.ts': `export default { build: { outDir: '.vercel/output/functions/_qwik-city.func' } };`,
    });
    await migrate();
    expect(project.read('adapters/vercel-edge/vite.config.ts')).toBe(
      `export default { build: { outDir: '.vercel/output/functions/_qwik-router.func' } };`
    );
  });

  test('reports mentions of v1 internals and the v2 behavior changes', async () => {
    project = createTmpProject({
      'package.json': V1_PACKAGE_JSON,
      'src/app.css': `.⭐️abc { color: red }`,
      'netlify.toml': `[[headers]]\n  for = "/*/q-data.json"`,
      'tests/e2e.spec.ts': `page.locator('[on:click]');`,
    });
    vi.mocked(log.warn).mockClear();
    vi.mocked(log.info).mockClear();
    await migrate();
    const warnings = vi.mocked(log.warn).mock.calls[0][0];
    expect(warnings).toContain('src/app.css: scoped style classes use the `⚡️` prefix');
    expect(warnings).toContain('netlify.toml: v2 fetches route data from `q-loader-*.json`');
    expect(warnings).toContain('tests/e2e.spec.ts: v2 renders listeners as `q-e:`');
    expect(vi.mocked(log.info)).toHaveBeenCalledWith(
      expect.stringContaining('Behavior changes of v2 that could not be migrated:')
    );
    expect(vi.mocked(log.info)).toHaveBeenCalledWith(
      expect.stringContaining('Next steps to use the v2 defaults and recommended settings:')
    );
  });

  test('keeps the jsx-runtime subpath and jsxs', async () => {
    project = createTmpProject({
      'package.json': V1_PACKAGE_JSON,
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

  test('changes nothing when run again on the migrated app', async () => {
    const files = {
      'package.json': V1_PACKAGE_JSON,
      'vite.config.ts': [
        `import { qwikCity } from '@builder.io/qwik-city/vite';`,
        `import { qwikVite } from '@builder.io/qwik/optimizer';`,
        `export default { plugins: [qwikCity(), qwikVite()] };`,
      ].join('\n'),
      'src/root.tsx': [
        `import { component$ } from '@builder.io/qwik';`,
        `import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city';`,
        `export default component$(() => <QwikCityProvider><RouterOutlet /></QwikCityProvider>);`,
      ].join('\n'),
      'src/routes/index.tsx': `export default () => <div>home</div>;`,
      'src/routes/error.tsx': `export const Error = () => null;`,
    };
    project = createTmpProject(files);
    await migrate();
    const paths = [...Object.keys(files), 'src/routes/_error.tsx'];
    const migrated = readFiles(project, paths);
    await migrate();
    expect(readFiles(project, paths)).toEqual(migrated);
  });

  test('only applies the upgrade codemods to an app already on v2', async () => {
    const files = {
      'package.json': JSON.stringify({
        dependencies: { 'v1-lib': '1' },
        devDependencies: { '@qwik.dev/core': '2.0.0-rc.1', '@qwik.dev/router': '2.0.0-rc.1' },
        overrides: { '@builder.io/qwik': 'npm:@qwik.dev/core@2.0.0-rc.1' },
        type: 'module',
      }),
      'vite.config.ts': [
        `import { qwikRouter } from '@qwik.dev/router/vite';`,
        `import { qwikVite } from '@qwik.dev/core/optimizer';`,
        `export default { plugins: [qwikRouter(), qwikVite()] };`,
      ].join('\n'),
      'src/routes/layout.tsx': `export default () => <div />;`,
      'src/routes/error.tsx': `export default () => <p>error</p>;`,
    };
    project = createTmpProject({
      ...files,
      'node_modules/v1-lib/package.json': JSON.stringify({
        peerDependencies: { '@builder.io/qwik': '^1' },
      }),
    });
    vi.mocked(updateDependencies).mockClear();
    await migrate();
    expect(readFiles(project, Object.keys(files))).toEqual({
      ...files,
      'vite.config.ts': files['vite.config.ts'].replace(
        '] };',
        `], resolve: { noExternal: ['v1-lib'] } };`
      ),
    });
    expect(project.exists('src/routes/plugin@000-v1-errors.ts')).toBe(false);
    expect(updateDependencies).toHaveBeenCalled();
    const migrated = readFiles(project, Object.keys(files));
    await migrate();
    expect(readFiles(project, Object.keys(files))).toEqual(migrated);
  });
});
