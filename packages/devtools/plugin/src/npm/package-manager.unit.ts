import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  buildInstallCommand,
  buildUpdateCommand,
  detectPackageManager,
  isValidPackageName,
  resolvePackageProjectContext,
  runPackageCommand,
} from './package-manager';

describe('isValidPackageName', () => {
  test('accepts unscoped and scoped package names', () => {
    expect(isValidPackageName('vite')).toBe(true);
    expect(isValidPackageName('@qwik.dev/core')).toBe(true);
    expect(isValidPackageName('some-package.name_2')).toBe(true);
  });

  test('rejects empty names, incomplete scoped names, whitespace, and shell metacharacters', () => {
    expect(isValidPackageName('')).toBe(false);
    expect(isValidPackageName('@scope')).toBe(false);
    expect(isValidPackageName('left pad')).toBe(false);
    expect(isValidPackageName('vite;rm -rf .')).toBe(false);
    expect(isValidPackageName('UPPER')).toBe(false);
  });
});

describe('detectPackageManager', () => {
  test('prefers pnpm, then yarn, then npm, then pnpm fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qwik-devtools-pm-'));
    expect(await detectPackageManager(root)).toBe('pnpm');

    await writeFile(join(root, 'package-lock.json'), '{}');
    expect(await detectPackageManager(root)).toBe('npm');

    await writeFile(join(root, 'yarn.lock'), '');
    expect(await detectPackageManager(root)).toBe('yarn');

    await writeFile(join(root, 'pnpm-lock.yaml'), '');
    expect(await detectPackageManager(root)).toBe('pnpm');
  });
});

describe('resolvePackageProjectContext', () => {
  test('finds a pnpm workspace root and selector for a nested package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qwik-devtools-workspace-'));
    const docsRoot = join(root, 'packages', 'docs');

    await mkdir(docsRoot, { recursive: true });
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    await writeFile(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
    await writeFile(join(docsRoot, 'package.json'), '{"name":"qwik-docs"}');

    await expect(resolvePackageProjectContext(docsRoot)).resolves.toMatchObject({
      packageJsonPath: join(docsRoot, 'package.json'),
      projectRoot: docsRoot,
      workspaceRoot: root,
      packageManager: 'pnpm',
      workspacePackageSelector: './packages/docs',
    });
  });

  test('uses the package root as the command root outside a workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qwik-devtools-single-package-'));

    await writeFile(join(root, 'package.json'), '{"name":"single"}');

    await expect(resolvePackageProjectContext(root)).resolves.toMatchObject({
      packageJsonPath: join(root, 'package.json'),
      projectRoot: root,
      workspaceRoot: root,
      packageManager: 'pnpm',
      workspacePackageSelector: null,
    });
  });
});

describe('build package manager commands', () => {
  const singlePackageContext = {
    packageJsonPath: '/repo/package.json',
    projectRoot: '/repo',
    workspaceRoot: '/repo',
    packageManager: 'pnpm' as const,
    workspacePackageSelector: null,
  };

  const workspaceContext = {
    packageJsonPath: '/repo/packages/docs/package.json',
    projectRoot: '/repo/packages/docs',
    workspaceRoot: '/repo',
    packageManager: 'pnpm' as const,
    workspacePackageSelector: './packages/docs',
  };

  const npmContext = {
    packageJsonPath: '/repo/package.json',
    projectRoot: '/repo',
    workspaceRoot: '/repo',
    packageManager: 'npm' as const,
    workspacePackageSelector: null,
  };

  const yarnContext = {
    packageJsonPath: '/repo/package.json',
    projectRoot: '/repo',
    workspaceRoot: '/repo',
    packageManager: 'yarn' as const,
    workspacePackageSelector: null,
  };

  test('builds install commands for prod and dev dependencies', () => {
    expect(buildInstallCommand(npmContext, 'vite', 'dependencies')).toEqual({
      command: 'npm',
      args: ['install', 'vite'],
      cwd: '/repo',
    });
    expect(buildInstallCommand(npmContext, 'vite', 'devDependencies')).toEqual({
      command: 'npm',
      args: ['install', '--save-dev', 'vite'],
      cwd: '/repo',
    });
    expect(buildInstallCommand(singlePackageContext, 'vite', 'devDependencies')).toEqual({
      command: 'pnpm',
      args: ['add', '-D', 'vite'],
      cwd: '/repo',
    });
    expect(buildInstallCommand(workspaceContext, 'vite', 'devDependencies')).toEqual({
      command: 'pnpm',
      args: ['--filter', './packages/docs', 'add', '-D', 'vite'],
      cwd: '/repo',
    });
    expect(buildInstallCommand(yarnContext, 'vite', 'dependencies')).toEqual({
      command: 'yarn',
      args: ['add', 'vite'],
      cwd: '/repo',
    });
  });

  test('builds update commands that preserve dependency type', () => {
    expect(buildUpdateCommand(npmContext, 'vite', 'dependencies')).toEqual({
      command: 'npm',
      args: ['install', 'vite@latest'],
      cwd: '/repo',
    });
    expect(buildUpdateCommand(workspaceContext, '@mui/x-data-grid', 'devDependencies')).toEqual({
      command: 'pnpm',
      args: ['--filter', './packages/docs', 'add', '-D', '@mui/x-data-grid@latest'],
      cwd: '/repo',
    });
    expect(buildUpdateCommand(yarnContext, 'vite', 'peerDependencies')).toEqual({
      command: 'yarn',
      args: ['add', '--peer', 'vite@latest'],
      cwd: '/repo',
    });
  });
});

describe('runPackageCommand', () => {
  test('returns stdout and stderr for successful commands', async () => {
    const result = await runPackageCommand({
      command: 'node' as any,
      args: ['-e', 'console.log("out"); console.error("err")'],
      cwd: process.cwd(),
    });

    expect(result.stdout).toContain('out');
    expect(result.stderr).toContain('err');
    expect(result.code).toBe(0);
  });
});
