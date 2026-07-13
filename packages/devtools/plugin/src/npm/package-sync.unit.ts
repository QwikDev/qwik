import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { verifyDependencySync } from './package-sync';

describe('verifyDependencySync', () => {
  test('passes when manifest, pnpm lockfile, and installed package match latest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qwik-devtools-sync-ok-'));
    const docsRoot = join(root, 'packages', 'docs');
    const installedRoot = join(docsRoot, 'node_modules', '@mui', 'x-data-grid');

    await mkdir(installedRoot, { recursive: true });
    await writeFile(
      join(docsRoot, 'package.json'),
      JSON.stringify({ devDependencies: { '@mui/x-data-grid': '9.6.0' } }, null, 2)
    );
    await writeFile(join(installedRoot, 'package.json'), '{"version":"9.6.0"}');
    await writeFile(
      join(root, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        'importers:',
        '  packages/docs:',
        '    devDependencies:',
        "      '@mui/x-data-grid':",
        '        specifier: 9.6.0',
        '        version: 9.6.0(@mui/material@7.3.2)',
      ].join('\n')
    );

    await expect(
      verifyDependencySync({
        projectRoot: docsRoot,
        workspaceRoot: root,
        workspacePackageSelector: './packages/docs',
        packageName: '@mui/x-data-grid',
        dependencyType: 'devDependencies',
        expectedVersion: '9.6.0',
        packageManager: 'pnpm',
      })
    ).resolves.toEqual({ success: true });
  });

  test('fails when only package.json changed and lockfile/node_modules stayed old', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qwik-devtools-sync-fail-'));
    const docsRoot = join(root, 'packages', 'docs');
    const installedRoot = join(docsRoot, 'node_modules', '@mui', 'x-data-grid');

    await mkdir(installedRoot, { recursive: true });
    await writeFile(
      join(docsRoot, 'package.json'),
      JSON.stringify({ devDependencies: { '@mui/x-data-grid': '9.6.0' } }, null, 2)
    );
    await writeFile(join(installedRoot, 'package.json'), '{"version":"8.11.3"}');
    await writeFile(
      join(root, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        'importers:',
        '  packages/docs:',
        '    devDependencies:',
        "      '@mui/x-data-grid':",
        '        specifier: 8.11.3',
        '        version: 8.11.3(@mui/material@7.3.2)',
      ].join('\n')
    );

    await expect(
      verifyDependencySync({
        projectRoot: docsRoot,
        workspaceRoot: root,
        workspacePackageSelector: './packages/docs',
        packageName: '@mui/x-data-grid',
        dependencyType: 'devDependencies',
        expectedVersion: '9.6.0',
        packageManager: 'pnpm',
      })
    ).resolves.toEqual({
      success: false,
      error:
        '@mui/x-data-grid update did not synchronize: lockfile resolved 8.11.3, installed 8.11.3, expected 9.6.0',
    });
  });

  test('regression: Update Now does not report success when package.json is newer than lockfile and installed version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qwik-devtools-update-now-regression-'));
    const docsRoot = join(root, 'packages', 'docs');
    const installedRoot = join(docsRoot, 'node_modules', '@qwik.dev', 'partytown');

    await mkdir(installedRoot, { recursive: true });
    await writeFile(
      join(docsRoot, 'package.json'),
      JSON.stringify({ devDependencies: { '@qwik.dev/partytown': '0.14.0' } }, null, 2)
    );
    await writeFile(join(installedRoot, 'package.json'), '{"version":"0.13.2"}');
    await writeFile(
      join(root, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        'importers:',
        '  packages/docs:',
        '    devDependencies:',
        "      '@qwik.dev/partytown':",
        '        specifier: 0.13.2',
        '        version: 0.13.2',
      ].join('\n')
    );

    const result = await verifyDependencySync({
      projectRoot: docsRoot,
      workspaceRoot: root,
      workspacePackageSelector: './packages/docs',
      packageName: '@qwik.dev/partytown',
      dependencyType: 'devDependencies',
      expectedVersion: '0.14.0',
      packageManager: 'pnpm',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('lockfile resolved 0.13.2');
    expect(result.error).toContain('installed 0.13.2');
    expect(result.error).toContain('expected 0.14.0');
  });
});
