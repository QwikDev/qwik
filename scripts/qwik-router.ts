import { build, type Plugin, transform } from 'esbuild';
import { execa } from 'execa';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rollup } from 'rollup';
import { type BuildConfig, emptyDir, importPath, nodeTarget, panic } from './util';

export async function buildQwikRouter(config: BuildConfig) {
  if (!config.dev) {
    emptyDir(config.distQwikRouterPkgDir);
  }

  await Promise.all([
    buildServiceWorker(config),
    buildVite(config),
    buildAdapterAzureSwaVite(config),
    buildAdapterCloudflarePagesVite(config),
    buildAdapterCloudRunVite(config),
    buildAdapterDenoVite(config),
    buildAdapterBunVite(config),
    buildAdapterNodeServerVite(config),
    buildAdapterNetlifyEdgeVite(config),
    buildAdapterSharedVite(config),
    buildAdapterSsgVite(config),
    buildAdapterVercelEdgeVite(config),
    buildMiddlewareCloudflarePages(config),
    buildMiddlewareNetlifyEdge(config),
    buildMiddlewareAzureSwa(config),
    buildMiddlewareAwsLambda(config),
    buildMiddlewareDeno(config),
    buildMiddlewareBun(config),
    buildMiddlewareNode(config),
    buildMiddlewareRequestHandler(config),
    buildMiddlewareVercelEdge(config),
    buildMiddlewareFirebase(config),
    buildSsg(config),
    buildSsgNode(config),
    buildSsgDeno(config),
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

  const external = [
    'fs',
    'path',
    'url',
    'vite',
    'source-map',
    'vfile',
    '@mdx-js/mdx',
    'node-fetch',
    'undici',
    'typescript',
    'vite-imagetools',
    'svgo',
    '@qwik.dev/core',
    '@qwik.dev/router/middleware/request-handler',
  ];

  const swRegisterPath = join(config.srcQwikRouterDir, 'runtime', 'src', 'sw-register.ts');
  let swRegisterCode = await readFile(swRegisterPath, 'utf-8');

  const swResult = await transform(swRegisterCode, { loader: 'ts', minify: true });
  swRegisterCode = swResult.code.trim();
  if (swRegisterCode.endsWith(';')) {
    swRegisterCode = swRegisterCode.slice(0, swRegisterCode.length - 1);
  }

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    alias: {
      '@qwik.dev/core/optimizer': 'noop',
    },
    plugins: [serviceWorkerRegisterBuild(swRegisterCode)],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external,
    plugins: [serviceWorkerRegisterBuild(swRegisterCode)],
  });
}

function serviceWorkerRegisterBuild(swRegisterCode: string) {
  const filter = /\@qwik-router-sw-register-build/;

  const plugin: Plugin = {
    name: 'serviceWorkerRegisterBuild',
    setup(build) {
      build.onResolve({ filter }, (args) => ({
        path: args.path,
        namespace: 'sw-reg',
      }));
      build.onLoad({ filter: /.*/, namespace: 'sw-reg' }, () => ({
        contents: swRegisterCode,
        loader: 'text',
      }));
    },
  };
  return plugin;
}

async function buildServiceWorker(config: BuildConfig) {
  const build = await rollup({
    input: join(
      config.tscDir,
      'packages',
      'qwik-router',
      'src',
      'runtime',
      'src',
      'service-worker',
      'index.js'
    ),
  });

  await build.write({
    file: join(config.distQwikRouterPkgDir, 'service-worker.mjs'),
    format: 'es',
  });

  await build.write({
    file: join(config.distQwikRouterPkgDir, 'service-worker.cjs'),
    format: 'cjs',
  });
}

async function buildAdapterAzureSwaVite(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'adapters', 'azure-swa', 'vite', 'index.ts')];

  const external = ['vite', 'fs', 'path', '@qwik.dev/router/ssg'];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'azure-swa', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    plugins: [resolveAdapterShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'azure-swa', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external,
    plugins: [resolveAdapterShared('../../shared/vite/index.cjs')],
  });
}

async function buildAdapterCloudflarePagesVite(config: BuildConfig) {
  const entryPoints = [
    join(config.srcQwikRouterDir, 'adapters', 'cloudflare-pages', 'vite', 'index.ts'),
  ];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'cloudflare-pages', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'cloudflare-pages', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.cjs')],
  });
}

async function buildAdapterCloudRunVite(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'adapters', 'cloud-run', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'cloud-run', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'cloud-run', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.cjs')],
  });
}

async function buildAdapterBunVite(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'adapters', 'bun-server', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'bun-server', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'bun-server', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [
      resolveAdapterShared('../../shared/vite/index.cjs'),
      resolveRequestHandler('../../../middleware/request-handler/index.cjs'),
    ],
  });
}

async function buildAdapterDenoVite(config: BuildConfig) {
  const entryPoints = [
    join(config.srcQwikRouterDir, 'adapters', 'deno-server', 'vite', 'index.ts'),
  ];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'deno-server', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'deno-server', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [
      resolveAdapterShared('../../shared/vite/index.cjs'),
      resolveRequestHandler('../../../middleware/request-handler/index.cjs'),
    ],
  });
}

async function buildAdapterNodeServerVite(config: BuildConfig) {
  const entryPoints = [
    join(config.srcQwikRouterDir, 'adapters', 'node-server', 'vite', 'index.ts'),
  ];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'node-server', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'node-server', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.cjs')],
  });
}

async function buildAdapterNetlifyEdgeVite(config: BuildConfig) {
  const entryPoints = [
    join(config.srcQwikRouterDir, 'adapters', 'netlify-edge', 'vite', 'index.ts'),
  ];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'netlify-edge', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'netlify-edge', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [
      resolveAdapterShared('../../shared/vite/index.cjs'),
      resolveRequestHandler('../../../middleware/request-handler/index.cjs'),
    ],
  });
}

async function buildAdapterSharedVite(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'adapters', 'shared', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'shared', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [
      resolveSsg('../../../ssg/index.mjs'),
      resolveRequestHandler('../../../middleware/request-handler/index.mjs'),
    ],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'shared', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [
      resolveSsg('../../../ssg/index.cjs'),
      resolveRequestHandler('../../../middleware/request-handler/index.cjs'),
    ],
  });
}

async function buildAdapterSsgVite(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'adapters', 'ssg', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'ssg', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveSsg('../../../ssg/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'ssg', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveSsg('../../../ssg/index.cjs')],
  });
}

async function buildAdapterVercelEdgeVite(config: BuildConfig) {
  const entryPoints = [
    join(config.srcQwikRouterDir, 'adapters', 'vercel-edge', 'vite', 'index.ts'),
  ];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'vercel-edge', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'vercel-edge', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.cjs')],
  });
}

async function buildMiddlewareAzureSwa(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'azure-swa', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'azure-swa', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareAwsLambda(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'aws-lambda', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'aws-lambda', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareCloudflarePages(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'cloudflare-pages', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'cloudflare-pages', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareBun(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'bun', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'bun', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareDeno(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'deno', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'deno', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareNetlifyEdge(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'netlify-edge', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'netlify-edge', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareNode(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'node', 'index.ts')];

  const external = ['node-fetch', 'undici', 'path', 'os', 'fs', 'url', ...MIDDLEWARE_EXTERNALS];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'node', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'node', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external,
    plugins: [resolveRequestHandler('../request-handler/index.cjs')],
  });
}

async function buildMiddlewareRequestHandler(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'request-handler', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'request-handler', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'request-handler', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: MIDDLEWARE_EXTERNALS,
  });
}

async function buildMiddlewareVercelEdge(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'vercel-edge', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'vercel-edge', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareFirebase(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'middleware', 'firebase', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'firebase', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildSsg(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'ssg', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'ssg', 'index.mjs'),
    bundle: true,
    platform: 'neutral',
    format: 'esm',
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'ssg', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
  });
}

async function buildSsgDeno(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'ssg', 'deno', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'ssg', 'deno.mjs'),
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    plugins: [resolveRequestHandler('../middleware/request-handler/index.mjs')],
  });
}

async function buildSsgNode(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'ssg', 'node', 'index.ts')];

  const external = [
    '@qwik.dev/core',
    '@qwik.dev/core/optimizer',
    '@qwik.dev/router',
    'fs',
    'http',
    'https',
    'node-fetch',
    'undici',
    'os',
    'path',
    'stream/web',
    'url',
    'worker_threads',
    'vite',
  ];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'ssg', 'node.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    plugins: [resolveRequestHandler('../middleware/request-handler/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'ssg', 'node.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external,
    plugins: [resolveRequestHandler('../middleware/request-handler/index.cjs')],
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

const ADAPTER_EXTERNALS = [
  'vite',
  'fs',
  'path',
  '@qwik.dev/core',
  '@qwik.dev/core/server',
  '@qwik.dev/core/optimizer',
  '@qwik.dev/router',
  '@qwik.dev/router/ssg',
  '@qwik.dev/router/middleware/request-handler',
];

const MIDDLEWARE_EXTERNALS = [
  '@qwik.dev/core',
  '@qwik.dev/core/optimizer',
  '@qwik.dev/core/server',
  '@qwik.dev/router',
  '@qwik.dev/router/ssg',
  '@qwik-router-config',
];
