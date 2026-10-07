import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTmpProject } from './tools/tmp-project';
import {
  installTsMorph,
  removeTsMorphFromPackageJson,
  updateDependencies,
} from './update-dependencies';

const { execSync, installDeps } = vi.hoisted(() => ({
  execSync: vi.fn(),
  installDeps: vi.fn(() => ({ install: Promise.resolve(true) })),
}));

vi.mock('node:child_process', () => ({ execSync }));
vi.mock('../utils/install-deps', () => ({ installDeps }));
vi.mock('@clack/prompts', () => ({
  log: { info: vi.fn(), warn: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

describe('update-dependencies', () => {
  let project: ReturnType<typeof createTmpProject>;
  beforeEach(() => {
    execSync.mockReset();
    installDeps.mockClear();
  });
  afterEach(() => project.cleanup());

  const pkg = () => JSON.parse(project.read('package.json'));

  describe('updateDependencies', () => {
    test('sets all qwik packages to the best v2 dist-tag and installs', async () => {
      execSync.mockReturnValue('latest: 1.19.0\nbeta: 2.0.0-beta.5\nalpha: 2.0.0-alpha.9\n');
      project = createTmpProject({
        'package.json': JSON.stringify({
          devDependencies: {
            '@qwik.dev/core': '^1.19.0',
            '@qwik.dev/router': '^1.19.0',
            'eslint-plugin-qwik': '^1.19.0',
            typescript: '5.0.0',
          },
          dependencies: { '@qwik.dev/react': '^1.19.0' },
        }),
      });
      await updateDependencies();
      expect(pkg()).toEqual({
        devDependencies: {
          '@qwik.dev/core': '2.0.0-beta.5',
          '@qwik.dev/router': '2.0.0-beta.5',
          'eslint-plugin-qwik': '2.0.0-beta.5',
          typescript: '5.0.0',
        },
        dependencies: { '@qwik.dev/react': '2.0.0-beta.5' },
      });
      expect(installDeps).toHaveBeenCalledOnce();
    });

    test('keeps qwik versions newer than the dist-tag', async () => {
      execSync.mockReturnValue('latest: 2.0.0\nbeta: 2.1.0-beta.1\n');
      project = createTmpProject({
        'package.json': JSON.stringify({
          devDependencies: { '@qwik.dev/core': '^2.1.0-beta.2', '@qwik.dev/router': '2.0.0-rc.1' },
        }),
      });
      await updateDependencies();
      expect(pkg().devDependencies).toEqual({
        '@qwik.dev/core': '^2.1.0-beta.2',
        '@qwik.dev/router': '2.0.0',
      });
    });

    test('updates workspace package.json files too', async () => {
      execSync.mockReturnValue('latest: 2.0.0\n');
      const unrelated = '{"name":"c",  "dependencies": {}}';
      project = createTmpProject({
        'package.json': JSON.stringify({ devDependencies: { '@qwik.dev/core': '1' } }),
        'apps/web/package.json': JSON.stringify({ dependencies: { '@qwik.dev/router': '1' } }),
        'libs/c/package.json': unrelated,
      });
      await updateDependencies();
      expect(JSON.parse(project.read('apps/web/package.json')).dependencies).toEqual({
        '@qwik.dev/router': '2.0.0',
      });
      expect(project.read('libs/c/package.json')).toBe(unrelated);
    });

    test('bumps vite to 8 and vitest to 4', async () => {
      execSync.mockReturnValue('latest: 2.0.0\n');
      project = createTmpProject({
        'package.json': JSON.stringify({
          devDependencies: {
            vite: '^7.1.0',
            vitest: '^0.34.6',
            '@vitest/ui': '^0.34.6',
            'vite-tsconfig-paths': '^4.2.1',
          },
        }),
        'apps/a/package.json': JSON.stringify({
          devDependencies: { vite: '8.1.0', vitest: '^4.1.0', other: 'latest' },
        }),
      });
      await updateDependencies();
      expect(pkg().devDependencies).toEqual({
        vite: '^8.0.0',
        vitest: '^4.0.0',
        '@vitest/ui': '^4.0.0',
        'vite-tsconfig-paths': '^4.2.1',
      });
      expect(JSON.parse(project.read('apps/a/package.json')).devDependencies).toEqual({
        vite: '8.1.0',
        vitest: '^4.1.0',
        other: 'latest',
      });
    });

    test('prefers the "latest" tag once it points to v2', async () => {
      execSync.mockReturnValue('alpha: 2.0.0-alpha.9\nlatest: 2.1.0\nbeta: 2.0.0-beta.5\n');
      project = createTmpProject({
        'package.json': JSON.stringify({ devDependencies: { '@qwik.dev/core': '1' } }),
      });
      await updateDependencies();
      expect(pkg().devDependencies['@qwik.dev/core']).toBe('2.1.0');
    });

    test('falls back to 2.0.0 when no v2 tag exists', async () => {
      execSync.mockReturnValue('latest: 1.19.0\n');
      project = createTmpProject({
        'package.json': JSON.stringify({ devDependencies: { '@qwik.dev/core': '1' } }),
      });
      await updateDependencies();
      expect(pkg().devDependencies['@qwik.dev/core']).toBe('2.0.0');
    });

    test('throws when the install fails', async () => {
      execSync.mockReturnValue('latest: 2.0.0\n');
      installDeps.mockReturnValueOnce({ install: Promise.resolve(false) });
      project = createTmpProject({ 'package.json': JSON.stringify({}) });
      await expect(updateDependencies()).rejects.toThrow('Failed to install dependencies');
    });
  });

  describe('overriding the v1 packages', () => {
    const userAgent = process.env.npm_config_user_agent;
    afterEach(() => {
      process.env.npm_config_user_agent = userAgent;
    });

    const update = async (pm: string, json: object, redirectV1Packages = true) => {
      execSync.mockReturnValue('latest: 2.0.0\n');
      process.env.npm_config_user_agent = `${pm}/1.0.0 node/v22`;
      project = createTmpProject({ 'package.json': JSON.stringify(json) });
      await updateDependencies({ redirectV1Packages });
      return pkg();
    };
    const OVERRIDES = {
      '@builder.io/qwik': 'npm:@qwik.dev/core@2.0.0',
      '@builder.io/qwik-city': 'npm:@qwik.dev/router@2.0.0',
    };

    test.each([
      ['npm', (json: any) => json.overrides],
      ['bun', (json: any) => json.overrides],
      ['yarn', (json: any) => json.resolutions],
      ['pnpm', (json: any) => json.pnpm.overrides],
    ])('redirects them to v2 for libraries built with Qwik 1 with %s', async (pm, overrides) => {
      expect(overrides(await update(pm, { overrides: {}, resolutions: { a: '1' } }))).toEqual(
        expect.objectContaining(OVERRIDES)
      );
    });

    test('updates its own overrides without libraries built with Qwik 1', async () => {
      const json = await update(
        'npm',
        { overrides: { '@builder.io/qwik': 'npm:@qwik.dev/core@2.0.0-rc.1', a: '1' } },
        false
      );
      expect(json.overrides).toEqual({ '@builder.io/qwik': 'npm:@qwik.dev/core@2.0.0', a: '1' });
    });

    test('leaves other projects alone', async () => {
      const json = { overrides: { '@builder.io/qwik': '1.19.0' } };
      expect(await update('npm', json, false)).toEqual(json);
    });
  });

  describe('ts-morph', () => {
    test('installTsMorph adds ts-morph to devDependencies and installs', async () => {
      project = createTmpProject({ 'package.json': JSON.stringify({ devDependencies: {} }) });
      expect(await installTsMorph()).toBe(true);
      expect(pkg().devDependencies['ts-morph']).toBe('23');
      expect(installDeps).toHaveBeenCalledOnce();
    });

    test('installTsMorph does nothing when ts-morph is already a dependency', async () => {
      project = createTmpProject({
        'package.json': JSON.stringify({ dependencies: { 'ts-morph': '20' } }),
      });
      expect(await installTsMorph()).toBe(false);
      expect(installDeps).not.toHaveBeenCalled();
    });

    test('removeTsMorphFromPackageJson removes ts-morph', async () => {
      project = createTmpProject({
        'package.json': JSON.stringify({
          dependencies: { 'ts-morph': '23', a: '1' },
          devDependencies: { 'ts-morph': '23' },
        }),
      });
      await removeTsMorphFromPackageJson();
      expect(pkg()).toEqual({ dependencies: { a: '1' }, devDependencies: {} });
    });
  });
});
