import { build, transform, type Plugin } from 'esbuild';
import { execa } from 'execa';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rollup } from 'rollup';
import { emptyDir, importPath, nodeTarget, panic, type BuildConfig } from './util';

const namedCatch = (name: string) => (e: any) => {
  console.error(`${name}`, e);
  throw e;
};

export async function buildQwikRouter(config: BuildConfig) {
  if (!config.dev) {
    emptyDir(config.distQwikRouterPkgDir);
  }

  await Promise.all([
    buildServiceWorker(config).catch(namedCatch('buildServiceWorker')),
    buildVite(config).catch(namedCatch('buildVite')),
    buildAdapterAzureSwaVite(config).catch(namedCatch('buildAdapterAzureSwaVite')),
    buildAdapterCloudflarePagesVite(config).catch(namedCatch('buildAdapterCloudflarePagesVite')),
    buildAdapterCloudRunVite(config).catch(namedCatch('buildAdapterCloudRunVite')),
    buildAdapterDenoVite(config).catch(namedCatch('buildAdapterDenoVite')),
    buildAdapterBunVite(config).catch(namedCatch('buildAdapterBunVite')),
    buildAdapterNodeServerVite(config).catch(namedCatch('buildAdapterNodeServerVite')),
    buildAdapterNetlifyEdgeVite(config).catch(namedCatch('buildAdapterNetlifyEdgeVite')),
    buildAdapterSharedVite(config).catch(namedCatch('buildAdapterSharedVite')),
    buildAdapterStaticVite(config).catch(namedCatch('buildAdapterStaticVite')),
    buildAdapterVercelEdgeVite(config).catch(namedCatch('buildAdapterVercelEdgeVite')),
    buildMiddlewareCloudflarePages(config).catch(namedCatch('buildMiddlewareCloudflarePages')),
    buildMiddlewareNetlifyEdge(config).catch(namedCatch('buildMiddlewareNetlifyEdge')),
    buildMiddlewareAzureSwa(config).catch(namedCatch('buildMiddlewareAzureSwa')),
    buildMiddlewareAwsLambda(config).catch(namedCatch('buildMiddlewareAwsLambda')),
    buildMiddlewareDeno(config).catch(namedCatch('buildMiddlewareDeno')),
    buildMiddlewareBun(config).catch(namedCatch('buildMiddlewareBun')),
    buildMiddlewareNode(config).catch(namedCatch('buildMiddlewareNode')),
    buildMiddlewareRequestHandler(config).catch(namedCatch('buildMiddlewareRequestHandler')),
    buildMiddlewareVercelEdge(config).catch(namedCatch('buildMiddlewareVercelEdge')),
    buildMiddlewareFirebase(config).catch(namedCatch('buildMiddlewareFirebase')),
    buildStatic(config).catch(namedCatch('buildStatic')),
    buildStaticNode(config).catch(namedCatch('buildStaticNode')),
    buildStaticDeno(config).catch(namedCatch('buildStaticDeno')),
  ]);

  await buildRuntime(config).catch(namedCatch('buildRuntime'));

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
    // We import this for 404 handling
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
      '@qwik.dev/core': 'do-not-import-qwik-in-the-vite-plugin',
      '@qwik.dev/core/optimizer': 'do-not-import-qwik-in-the-vite-plugin',
    },
    plugins: [
      {
        name: 'spy-resolve',
        setup(build) {
          build.onResolve({ filter: /.*/, namespace: 'spy-resolve' }, (args) => {
            console.log('spy-resolve', args);
            return null;
          });
        },
      },
      serviceWorkerRegisterBuild(swRegisterCode),
    ],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external,
    alias: {
      '@qwik.dev/core': 'do-not-import-qwik-in-the-vite-plugin',
      '@qwik.dev/core/optimizer': 'do-not-import-qwik-in-the-vite-plugin',
    },
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

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'azure-swa', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveAdapterShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'azure-swa', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
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
      resolveStatic('../../../static/index.mjs'),
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
      resolveStatic('../../../static/index.cjs'),
      resolveRequestHandler('../../../middleware/request-handler/index.cjs'),
    ],
  });
}

async function buildAdapterStaticVite(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'adapters', 'static', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'static', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveStatic('../../../static/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'adapters', 'static', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: ADAPTER_EXTERNALS,
    plugins: [resolveStatic('../../../static/index.cjs')],
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
    entryPoints: [join(config.srcQwikRouterDir, 'middleware', 'node', 'entry.dev.ts')],
    outfile: join(config.distQwikRouterPkgDir, 'middleware', 'node', 'entry.dev.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: [...external, '.'],
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

async function buildStatic(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'static', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'static', 'index.mjs'),
    bundle: true,
    platform: 'neutral',
    format: 'esm',
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'static', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
  });
}

async function buildStaticDeno(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'static', 'deno', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'static', 'deno.mjs'),
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    plugins: [resolveRequestHandler('../middleware/request-handler/index.mjs')],
  });
}

async function buildStaticNode(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikRouterDir, 'static', 'node', 'index.ts')];

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
    outfile: join(config.distQwikRouterPkgDir, 'static', 'node.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    plugins: [resolveRequestHandler('../middleware/request-handler/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(config.distQwikRouterPkgDir, 'static', 'node.cjs'),
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

function resolveStatic(path: string) {
  return importPath(/static$/, path);
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
  '@qwik.dev/router/static',
  '@qwik.dev/router/middleware/request-handler',
  '@qwik-client-manifest',
];

const MIDDLEWARE_EXTERNALS = [
  '@qwik.dev/core',
  '@qwik.dev/core/optimizer',
  '@qwik.dev/core/server',
  '@qwik.dev/router',
  '@qwik.dev/router/static',
  '@qwik-router-config',
  '@qwik-router-not-found-paths',
  '@qwik-router-static-paths',
  '@qwik-client-manifest',
  // Vite imports this conditionally
  'lightningcss',
];
