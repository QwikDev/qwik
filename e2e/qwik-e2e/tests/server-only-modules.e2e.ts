import { expect, test } from '@playwright/test';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikRouter } from '@qwik.dev/router/vite';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type InlineConfig } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const allowedAppDir = resolve(repoRoot, 'e2e/qwik-e2e/apps/server-only-modules');
const rejectedAppDir = resolve(repoRoot, 'e2e/qwik-e2e/apps/server-only-modules-rejected');

test.describe('server-only modules', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs once in Chromium e2e.');

  test('allows .server imports used only by routeLoader$', async () => {
    try {
      await cleanBuildOutput(allowedAppDir);
      await buildFixtureApp(allowedAppDir);
      const output = await readAllJs(join(allowedAppDir, 'dist'));
      expect(output).not.toContain('SERVER_ONLY_SECRET');
      expect(output).not.toContain('SERVER_FOLDER_SECRET');
    } finally {
      await cleanBuildOutput(allowedAppDir);
    }
  });

  test('rejects transitive .server imports used by client code', async () => {
    try {
      await cleanBuildOutput(rejectedAppDir);
      await expect(buildFixtureApp(rejectedAppDir)).rejects.toThrow(
        /Server-only module cannot be imported by client code/
      );
    } finally {
      await cleanBuildOutput(rejectedAppDir);
    }
  });

  test('rejects transitive src/server folder imports used by client code', async () => {
    try {
      await cleanBuildOutput(rejectedAppDir);
      await expect(buildFixtureApp(rejectedAppDir, './src/server-folder-root.tsx')).rejects.toThrow(
        /Server-only module cannot be imported by client code/
      );
    } finally {
      await cleanBuildOutput(rejectedAppDir);
    }
  });

  test('rejects re-exported .server imports used by client code', async () => {
    try {
      await cleanBuildOutput(rejectedAppDir);
      await expect(buildFixtureApp(rejectedAppDir, './src/re-export-root.tsx')).rejects.toThrow(
        /Server-only module cannot be imported by client code/
      );
    } finally {
      await cleanBuildOutput(rejectedAppDir);
    }
  });

  test('rejects dynamic .server imports used by client code', async () => {
    try {
      await cleanBuildOutput(rejectedAppDir);
      await expect(
        buildFixtureApp(rejectedAppDir, './src/dynamic-import-root.tsx')
      ).rejects.toThrow(/Server-only module cannot be imported by client code/);
    } finally {
      await cleanBuildOutput(rejectedAppDir);
    }
  });
});

async function buildFixtureApp(appDir: string, input = './src/root.tsx') {
  const config: InlineConfig = {
    root: appDir,
    mode: 'production',
    configFile: false,
    clearScreen: false,
    plugins: [qwikRouter(), qwikVite()],
    build: {
      minify: false,
      rollupOptions: input ? { input: resolve(appDir, input) } : undefined,
    },
  };

  await build(config);
}

async function cleanBuildOutput(appDir: string) {
  await rm(join(appDir, 'dist'), { recursive: true, force: true });
}

async function readAllJs(dir: string): Promise<string> {
  let output = '';
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      output += await readAllJs(path);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      output += await readFile(path, 'utf-8');
    }
  }
  return output;
}
