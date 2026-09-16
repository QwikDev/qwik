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
