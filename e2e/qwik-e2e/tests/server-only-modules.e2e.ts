import { expect, test } from '@playwright/test';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikRouter } from '@qwik.dev/router/vite';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, type InlineConfig, type ViteDevServer } from 'vite';

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

  test('dev allows server-only imports used only by routeLoader$', async () => {
    await withDevServer(allowedAppDir, async (server) => {
      await expect(server.ssrLoadModule('/src/routes/index.tsx')).resolves.toBeTruthy();
    });
  });

  test('dev ssr mode allows server-only imports used only by routeLoader$', async () => {
    await withDevServer(
      allowedAppDir,
      async (server) => {
        await expect(server.ssrLoadModule('/src/routes/index.tsx')).resolves.toBeTruthy();
      },
      'ssr'
    );
  });

  test('dev rejects route components that use .server modules during ssr load', async () => {
    await withDevServer(rejectedAppDir, async (server) => {
      await expect(server.ssrLoadModule('/src/routes/index.tsx')).rejects.toThrow(
        /Server-only module cannot be imported by client code/
      );
    });
  });

  test('dev rejects page requests when route components use .server modules', async () => {
    await withServedDevServer(rejectedAppDir, async (server) => {
      const baseUrl = server.resolvedUrls?.local[0];
      expect(baseUrl).toBeTruthy();
      const response = await fetch(baseUrl!);
      expect(response.status).toBe(500);
      expect(await response.text()).toContain(
        'Server-only module cannot be imported by client code'
      );
    });
  });

  test('dev ssr mode rejects page requests when route components use .server modules', async () => {
    await withServedDevServer(
      rejectedAppDir,
      async (server) => {
        const baseUrl = server.resolvedUrls?.local[0];
        expect(baseUrl).toBeTruthy();
        const response = await fetch(baseUrl!);
        expect(response.status).toBe(500);
        expect(await response.text()).toContain(
          'Server-only module cannot be imported by client code'
        );
      },
      'ssr'
    );
  });

  test('dev allows route modules after client transform when server imports stay in loaders', async () => {
    await withServedDevServer(allowedAppDir, async (server) => {
      const baseUrl = server.resolvedUrls?.local[0];
      expect(baseUrl).toBeTruthy();
      const response = await fetch(new URL('/src/routes/index.tsx', baseUrl));
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain(
        'Server-only module cannot be imported by client code'
      );
    });
  });

  test('dev rejects .server modules requested by client code', async () => {
    await withServedDevServer(rejectedAppDir, async (server) => {
      const baseUrl = server.resolvedUrls?.local[0];
      expect(baseUrl).toBeTruthy();
      for (const path of ['/src/db.server.ts', '/src/client-helper.ts']) {
        const response = await fetch(new URL(path, baseUrl));
        expect(response.status).toBe(500);
        expect(await response.text()).toContain(
          'Server-only module cannot be imported by client code'
        );
      }
    });
  });

  test('dev rejects route components that use .server modules', async () => {
    await withServedDevServer(rejectedAppDir, async (server) => {
      const baseUrl = server.resolvedUrls?.local[0];
      expect(baseUrl).toBeTruthy();
      const response = await fetch(new URL('/src/routes/index.tsx', baseUrl));
      expect(response.status).toBe(500);
      expect(await response.text()).toContain(
        'Server-only module cannot be imported by client code'
      );
    });
  });

  test('dev rejects src/server modules imported by client code', async () => {
    await withServedDevServer(rejectedAppDir, async (server) => {
      const baseUrl = server.resolvedUrls?.local[0];
      expect(baseUrl).toBeTruthy();
      for (const path of ['/src/folder-client-helper.ts', '/src/server/folder-secret.ts']) {
        const response = await fetch(new URL(path, baseUrl));
        expect(response.status).toBe(500);
        expect(await response.text()).toContain(
          'Server-only module cannot be imported by client code'
        );
      }
    });
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

async function withDevServer<T>(
  appDir: string,
  callback: (server: ViteDevServer) => T | Promise<T>,
  mode = 'development'
): Promise<T> {
  const server = await createServer({
    root: appDir,
    mode,
    configFile: false,
    clearScreen: false,
    appType: 'custom',
    server: {
      middlewareMode: true,
    },
    plugins: [qwikRouter(), qwikVite()],
  });

  try {
    return await callback(server);
  } finally {
    await server.close();
  }
}

async function withServedDevServer<T>(
  appDir: string,
  callback: (server: ViteDevServer) => T | Promise<T>,
  mode = 'development'
): Promise<T> {
  const server = await createServer({
    root: appDir,
    mode,
    configFile: false,
    clearScreen: false,
    plugins: [qwikRouter(), qwikVite()],
    server: {
      port: 0,
    },
  });

  try {
    await server.listen();
    return await callback(server);
  } finally {
    await server.close();
  }
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
