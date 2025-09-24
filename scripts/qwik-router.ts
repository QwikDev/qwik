import { execa } from 'execa';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build as viteBuild } from 'vite';
import pkg from '../packages/qwik-router/package.json' with { type: 'json' };
import { emptyDir, importPath, panic, type BuildConfig } from './util';

const externalsRegex = new RegExp(
  `^(node:.*|@qwik-router-config|@qwik.dev|${[...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)].join('|')})($|[/\\\\])`
);

export async function buildQwikRouter(config: BuildConfig) {
  if (!config.dev) {
    emptyDir(config.distQwikRouterPkgDir);
  }

  await Promise.all([
    buildServiceWorker(config),
    buildVite(config),
    buildAdapters(config),
    buildMiddleware(config),
    buildSsg(config),
  ]);

  await buildRuntime(config);

  console.log(`🏙  qwik-router`);
}

async function buildRuntime(config: BuildConfig) {
  const execOptions = {
    win: {
      manager: 'npm',
      command: ['run', 'build'],
    },
    other: {
      manager: 'pnpm',
      command: ['build'],
    },
  };
  const isWindows = process.platform.includes('win32');
  const runOptions = isWindows ? execOptions.win : execOptions.other;

  const result = await execa(runOptions.manager, runOptions.command, {
    stdout: 'inherit',
    cwd: config.srcQwikRouterDir,
  });
  if (result.failed) {
    panic(`tsc failed`);
  }
}

async function buildVite(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'buildtime', 'vite', 'index.ts')];

  const swRegisterPath = join(config.srcQwikRouterDir, 'runtime', 'src', 'sw-register.ts');
  let swRegisterCode = await readFile(swRegisterPath, 'utf-8');

  // Minify the service worker register code
  const { minify } = await import('terser');
  const swResult = await minify(swRegisterCode, {
    compress: true,
    mangle: true,
  });
  swRegisterCode = swResult.code?.trim() || swRegisterCode.trim();
  if (swRegisterCode.endsWith(';')) {
    swRegisterCode = swRegisterCode.slice(0, swRegisterCode.length - 1);
  }

  await buildWithVite({
    entry: entryPoints[0],
    outDir: join(config.distQwikRouterPkgDir, 'vite'),
    fileName: 'index',
    alias: {
      '@qwik.dev/core': 'do-not-import-qwik-core',
      '@qwik.dev/core/optimizer': 'do-not-import-qwik-core',
    },
    plugins: [serviceWorkerRegisterBuild(swRegisterCode)],
  });
}

function serviceWorkerRegisterBuild(swRegisterCode: string) {
  return {
    name: 'serviceWorkerRegisterBuild',
    resolveId(id: string) {
      if (id === '@qwik-router-sw-register-build') {
        return id;
      }
      return null;
    },
    load(id: string) {
      if (id === '@qwik-router-sw-register-build') {
        return `export default ${JSON.stringify(swRegisterCode)};`;
      }
      return null;
    },
  };
}

async function buildServiceWorker(config: BuildConfig) {
  await buildWithVite({
    entry: join(config.srcQwikRouterDir, 'runtime', 'src', 'service-worker', 'index.ts'),
    outDir: config.distQwikRouterPkgDir,
    fileName: 'service-worker',
  });
}

async function buildAdapters(config: BuildConfig) {
  const adapters = [
    {
      name: 'azure-swa',
      entry: join(config.srcQwikRouterDir, 'adapters', 'azure-swa', 'vite', 'index.ts'),
      plugins: [resolveAdapterShared('../../shared/vite/index')],
    },
    {
      name: 'cloudflare-pages',
      entry: join(config.srcQwikRouterDir, 'adapters', 'cloudflare-pages', 'vite', 'index.ts'),
      plugins: [resolveAdapterShared('../../shared/vite/index')],
    },
    {
      name: 'cloud-run',
      entry: join(config.srcQwikRouterDir, 'adapters', 'cloud-run', 'vite', 'index.ts'),
      plugins: [resolveAdapterShared('../../shared/vite/index')],
    },
    {
      name: 'bun-server',
      entry: join(config.srcQwikRouterDir, 'adapters', 'bun-server', 'vite', 'index.ts'),
      plugins: [
        resolveAdapterShared('../../shared/vite/index'),
        resolveRequestHandler('../../../middleware/request-handler/index'),
      ],
    },
    {
      name: 'deno-server',
      entry: join(config.srcQwikRouterDir, 'adapters', 'deno-server', 'vite', 'index.ts'),
      plugins: [
        resolveAdapterShared('../../shared/vite/index'),
        resolveRequestHandler('../../../middleware/request-handler/index'),
      ],
    },
    {
      name: 'node-server',
      entry: join(config.srcQwikRouterDir, 'adapters', 'node-server', 'vite', 'index.ts'),
      plugins: [resolveAdapterShared('../../shared/vite/index')],
    },
    {
      name: 'netlify-edge',
      entry: join(config.srcQwikRouterDir, 'adapters', 'netlify-edge', 'vite', 'index.ts'),
      plugins: [
        resolveAdapterShared('../../shared/vite/index'),
        resolveRequestHandler('../../../middleware/request-handler/index'),
      ],
    },
    {
      name: 'vercel-edge',
      entry: join(config.srcQwikRouterDir, 'adapters', 'vercel-edge', 'vite', 'index.ts'),
      plugins: [resolveAdapterShared('../../shared/vite/index')],
    },
  ];

  // Build shared adapter
  await buildWithVite({
    entry: join(config.srcQwikRouterDir, 'adapters', 'shared', 'vite', 'index.ts'),
    outDir: join(config.distQwikRouterPkgDir, 'adapters', 'shared', 'vite'),
    fileName: 'index',
    plugins: [
      resolveSsg('../../../ssg/index'),
      resolveRequestHandler('../../../middleware/request-handler/index'),
    ],
  });

  // Build SSG adapter
  await buildWithVite({
    entry: join(config.srcQwikRouterDir, 'adapters', 'ssg', 'vite', 'index.ts'),
    outDir: join(config.distQwikRouterPkgDir, 'adapters', 'ssg', 'vite'),
    fileName: 'index',
    plugins: [resolveSsg('../../../ssg/index')],
  });

  // Build all other adapters
  await Promise.all(
    adapters.map((adapter) =>
      buildWithVite({
        entry: adapter.entry,
        outDir: join(config.distQwikRouterPkgDir, 'adapters', adapter.name, 'vite'),
        fileName: 'index',
        plugins: adapter.plugins,
      })
    )
  );
}

async function buildMiddleware(config: BuildConfig) {
  const middleware = [
    {
      name: 'azure-swa',
      entry: join(config.srcQwikRouterDir, 'middleware', 'azure-swa', 'index.ts'),
      plugins: [resolveRequestHandler('../request-handler/index')],
    },
    {
      name: 'aws-lambda',
      entry: join(config.srcQwikRouterDir, 'middleware', 'aws-lambda', 'index.ts'),
      plugins: [resolveRequestHandler('../request-handler/index')],
    },
    {
      name: 'cloudflare-pages',
      entry: join(config.srcQwikRouterDir, 'middleware', 'cloudflare-pages', 'index.ts'),
      plugins: [resolveRequestHandler('../request-handler/index')],
    },
    {
      name: 'bun',
      entry: join(config.srcQwikRouterDir, 'middleware', 'bun', 'index.ts'),
      plugins: [resolveRequestHandler('../request-handler/index')],
    },
    {
      name: 'deno',
      entry: join(config.srcQwikRouterDir, 'middleware', 'deno', 'index.ts'),
      plugins: [resolveRequestHandler('../request-handler/index')],
    },
    {
      name: 'netlify-edge',
      entry: join(config.srcQwikRouterDir, 'middleware', 'netlify-edge', 'index.ts'),
      plugins: [resolveRequestHandler('../request-handler/index')],
    },
    {
      name: 'vercel-edge',
      entry: join(config.srcQwikRouterDir, 'middleware', 'vercel-edge', 'index.ts'),
      plugins: [resolveRequestHandler('../request-handler/index')],
    },
    {
      name: 'firebase',
      entry: join(config.srcQwikRouterDir, 'middleware', 'firebase', 'index.ts'),
      plugins: [resolveRequestHandler('../request-handler/index')],
    },
  ];

  // Build request handler middleware
  await buildWithVite({
    entry: join(config.srcQwikRouterDir, 'middleware', 'request-handler', 'index.ts'),
    outDir: join(config.distQwikRouterPkgDir, 'middleware', 'request-handler'),
    fileName: 'index',
  });

  // Build node middleware
  await buildWithVite({
    entry: join(config.srcQwikRouterDir, 'middleware', 'node', 'index.ts'),
    outDir: join(config.distQwikRouterPkgDir, 'middleware', 'node'),
    fileName: 'index',
    plugins: [resolveRequestHandler('../request-handler/index')],
  });

  // Build all other middleware
  await Promise.all(
    middleware.map((mw) =>
      buildWithVite({
        entry: mw.entry,
        outDir: join(config.distQwikRouterPkgDir, 'middleware', mw.name),
        fileName: 'index',
        plugins: mw.plugins,
      })
    )
  );
}

async function buildSsg(config: BuildConfig) {
  // Build main SSG
  await buildWithVite({
    entry: join(config.srcQwikRouterDir, 'ssg', 'index.ts'),
    outDir: join(config.distQwikRouterPkgDir, 'ssg'),
    fileName: 'index',
    platform: 'neutral',
  });

  // Build SSG Deno
  await buildWithVite({
    entry: join(config.srcQwikRouterDir, 'ssg', 'deno', 'index.ts'),
    outDir: join(config.distQwikRouterPkgDir, 'ssg'),
    fileName: 'deno',
    platform: 'neutral',
    plugins: [resolveRequestHandler('../middleware/request-handler/index')],
  });

  await buildWithVite({
    entry: join(config.srcQwikRouterDir, 'ssg', 'node', 'index.ts'),
    outDir: join(config.distQwikRouterPkgDir, 'ssg'),
    fileName: 'node',
    plugins: [resolveRequestHandler('../middleware/request-handler/index')],
  });
}

async function buildWithVite(options: {
  entry: string;
  outDir: string;
  fileName: string;
  plugins?: any[];
  alias?: Record<string, string>;
  platform?: 'node' | 'neutral';
}) {
  const { entry, outDir, fileName, plugins = [], alias = {}, platform = 'node' } = options;

  await viteBuild({
    build: {
      manifest: false,
      target: platform === 'node' ? 'node20' : undefined,
      lib: {
        entry,
        name: fileName,
        formats: ['es', 'cjs'],
        fileName: (format) => `${fileName}.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      outDir,
      rollupOptions: {
        external: externalsRegex,
        output: {
          globals: {},
        },
      },
      sourcemap: false,
      emptyOutDir: false,
    },
    environments:
      platform === 'node' ? { ssr: { consumer: 'server' } } : { client: { consumer: 'client' } },
    plugins,
    resolve: {
      alias,
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    clearScreen: false,
  });
}

function resolveRequestHandler(path: string) {
  return importPath(/middleware\/request-handler/, path);
}

function resolveSsg(path: string) {
  return importPath(/ssg$/, path);
}

function resolveAdapterShared(path: string) {
  return importPath(/shared\/vite$/, path);
}
