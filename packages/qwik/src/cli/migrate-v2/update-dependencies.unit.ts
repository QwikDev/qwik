import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readPackageJson, writePackageJson } from './../utils/utils';
import { updateDependencies } from './update-dependencies';

const distTagsByPackage: Record<string, string> = {};

vi.mock('node:child_process', () => ({
  execSync: vi.fn((command: string) => {
    const packageName = command.replace('npm dist-tag ', '');
    return distTagsByPackage[packageName] ?? '';
  }),
}));

vi.mock('./../utils/utils', () => ({
  readPackageJson: vi.fn(),
  writePackageJson: vi.fn(),
  getPackageManager: vi.fn(() => 'npm'),
}));

vi.mock('../utils/install-deps', () => ({
  installDeps: vi.fn(() => ({ install: Promise.resolve(true) })),
}));

vi.mock('@clack/prompts', () => ({
  log: { warn: vi.fn(), success: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

describe('updateDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const keys = Object.keys(distTagsByPackage);
    for (let i = 0; i < keys.length; i++) {
      delete distTagsByPackage[keys[i]];
    }
  });

  test('resolves each package version independently instead of reusing @qwik.dev/core version', async () => {
    // @qwik.dev/core and @qwik.dev/router were published for beta.42, but
    // eslint-plugin-qwik was not, so it stayed on its own beta.40
    distTagsByPackage['@qwik.dev/core'] = 'latest: 1.14.0\nbeta: 2.0.0-beta.42\n';
    distTagsByPackage['@qwik.dev/router'] = 'latest: 1.14.0\nbeta: 2.0.0-beta.42\n';
    distTagsByPackage['@qwik.dev/react'] = 'latest: 1.14.0\nbeta: 2.0.0-beta.42\n';
    distTagsByPackage['eslint-plugin-qwik'] = 'latest: 1.14.0\nbeta: 2.0.0-beta.40\n';

    const packageJson: any = {
      devDependencies: {
        '@qwik.dev/core': '^1.14.0',
        '@qwik.dev/router': '^1.14.0',
        '@qwik.dev/react': '^1.14.0',
        'eslint-plugin-qwik': '^1.14.0',
      },
    };
    vi.mocked(readPackageJson).mockResolvedValue(packageJson);

    await updateDependencies();

    expect(packageJson.devDependencies['@qwik.dev/core']).toBe('2.0.0-beta.42');
    expect(packageJson.devDependencies['@qwik.dev/router']).toBe('2.0.0-beta.42');
    expect(packageJson.devDependencies['eslint-plugin-qwik']).toBe('2.0.0-beta.40');
    expect(vi.mocked(writePackageJson)).toHaveBeenCalledWith(expect.any(String), packageJson);
  });

  test('falls back to "2.0.0" only for the package missing a v2 tag', async () => {
    distTagsByPackage['@qwik.dev/core'] = 'latest: 1.14.0\nbeta: 2.0.0-beta.42\n';
    distTagsByPackage['@qwik.dev/router'] = 'latest: 1.14.0\nbeta: 2.0.0-beta.42\n';
    distTagsByPackage['@qwik.dev/react'] = 'latest: 1.14.0\nbeta: 2.0.0-beta.42\n';
    // eslint-plugin-qwik has no v2 dist-tag published at all yet
    distTagsByPackage['eslint-plugin-qwik'] = 'latest: 1.14.0\n';

    const packageJson: any = {
      devDependencies: {
        '@qwik.dev/core': '^1.14.0',
        'eslint-plugin-qwik': '^1.14.0',
      },
    };
    vi.mocked(readPackageJson).mockResolvedValue(packageJson);

    await updateDependencies();

    expect(packageJson.devDependencies['@qwik.dev/core']).toBe('2.0.0-beta.42');
    expect(packageJson.devDependencies['eslint-plugin-qwik']).toBe('2.0.0');
  });
});
