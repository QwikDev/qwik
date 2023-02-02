import { build, Plugin, transform } from 'esbuild';
import { execa } from 'execa';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rollup } from 'rollup';
import { readPackageJson, writePackageJson } from './package-json';
import { BuildConfig, emptyDir, importPath, nodeTarget, panic, watcher } from './util';

const PACKAGE = 'qwik-city';

export async function buildQwikCity(config: BuildConfig) {
  const inputDir = join(config.packagesDir, PACKAGE);
  const outputDir = join(inputDir, 'lib');

  if (!config.dev) {
    emptyDir(outputDir);
  }

  await Promise.all([
    buildServiceWorker(config, inputDir, outputDir),
    buildVite(config, inputDir, outputDir),
    buildAdaptorAzureSwaVite(config, inputDir, outputDir),
    buildAdaptorCloudflarePagesVite(config, inputDir, outputDir),
    buildAdaptorCloudRunVite(config, inputDir, outputDir),
    buildAdaptorExpressVite(config, inputDir, outputDir),
    buildAdaptorNetlifyEdgeVite(config, inputDir, outputDir),
    buildAdaptorSharedVite(config, inputDir, outputDir),
    buildAdaptorStaticVite(config, inputDir, outputDir),
    buildAdaptorVercelEdgeVite(config, inputDir, outputDir),
    buildMiddlewareCloudflarePages(config, inputDir, outputDir),
    buildMiddlewareNetlifyEdge(config, inputDir, outputDir),
    buildMiddlewareAzureSwa(config, inputDir, outputDir),
    buildMiddlewareNode(config, inputDir, outputDir),
    buildMiddlewareRequestHandler(config, inputDir, outputDir),
    buildMiddlewareVercelEdge(config, inputDir, outputDir),
    buildStatic(config, inputDir, outputDir),
    buildStaticNode(config, inputDir, outputDir),
    buildStaticDeno(config, inputDir, outputDir),
  ]);

  await buildRuntime(inputDir);

  const loaderPkg = {
    ...(await readPackageJson(inputDir)),
    main: './index.qwik.mjs',
    qwik: './index.qwik.mjs',
    types: './index.d.ts',
    type: 'module',
    exports: {
      '.': {
        types: './index.d.ts',
        import: './index.qwik.mjs',
        require: './index.qwik.cjs',
      },
      './adaptors/azure-swa/vite': {
        types: './adaptors/azure-swa/vite/index.d.ts',
        import: './adaptors/azure-swa/vite/index.mjs',
        require: './adaptors/azure-swa/vite/index.cjs',
      },
      './adaptors/cloudflare-pages/vite': {
        types: './adaptors/cloudflare-pages/vite/index.d.ts',
        import: './adaptors/cloudflare-pages/vite/index.mjs',
        require: './adaptors/cloudflare-pages/vite/index.cjs',
      },
      './adaptors/cloud-run/vite': {
        types: './adaptors/cloud-run/vite/index.d.ts',
        import: './adaptors/cloud-run/vite/index.mjs',
        require: './adaptors/cloud-run/vite/index.cjs',
      },
      './adaptors/express/vite': {
        types: './adaptors/express/vite/index.d.ts',
        import: './adaptors/express/vite/index.mjs',
        require: './adaptors/express/vite/index.cjs',
      },
      './adaptors/netlify-edge/vite': {
        types: './adaptors/netlify-edge/vite/index.d.ts',
        import: './adaptors/netlify-edge/vite/index.mjs',
        require: './adaptors/netlify-edge/vite/index.cjs',
      },
      './adaptors/shared/vite': {
        types: './adaptors/shared/vite/index.d.ts',
        import: './adaptors/shared/vite/index.mjs',
        require: './adaptors/shared/vite/index.cjs',
      },
      './adaptors/static/vite': {
        types: './adaptors/static/vite/index.d.ts',
        import: './adaptors/static/vite/index.mjs',
        require: './adaptors/static/vite/index.cjs',
      },
      './adaptors/vercel-edge/vite': {
        types: './adaptors/vercel-edge/vite/index.d.ts',
        import: './adaptors/vercel-edge/vite/index.mjs',
        require: './adaptors/vercel-edge/vite/index.cjs',
      },
      './middleware/azure-swa': {
        types: './middleware/azure-swa/index.d.ts',
        import: './middleware/azure-swa/index.mjs',
      },
      './middleware/cloudflare-pages': {
        types: './middleware/cloudflare-pages/index.d.ts',
        import: './middleware/cloudflare-pages/index.mjs',
      },
      './middleware/netlify-edge': {
        types: './middleware/netlify-edge/index.d.ts',
        import: './middleware/netlify-edge/index.mjs',
      },
      './middleware/node': {
        types: './middleware/node/index.d.ts',
        import: './middleware/node/index.mjs',
        require: './middleware/node/index.cjs',
      },
      './middleware/request-handler': {
        types: './middleware/request-handler/index.d.ts',
        import: './middleware/request-handler/index.mjs',
        require: './middleware/request-handler/index.cjs',
      },
      './middleware/vercel-edge': {
        types: './middleware/vercel-edge/index.d.ts',
        import: './middleware/vercel-edge/index.mjs',
      },
      './static': {
        types: './static/index.d.ts',
        import: './static/index.mjs',
        require: './static/index.cjs',
      },
      './vite': {
        types: './vite/index.d.ts',
        import: './vite/index.mjs',
        require: './vite/index.cjs',
      },
      './service-worker': {
        types: './service-worker.d.ts',
        import: './service-worker.mjs',
        require: './service-worker.cjs',
      },
    },
    files: [
      'adaptors',
      'index.d.ts',
      'index.qwik.mjs',
      'index.qwik.cjs',
      'service-worker.mjs',
      'service-worker.cjs',
      'service-worker.d.ts',
      'modules.d.ts',
      'middleware',
      'static',
      'vite',
    ],
    publishConfig: {
      access: 'public',
    },
    private: undefined,
    devDependencies: undefined,
    scripts: undefined,
  };
  await writePackageJson(outputDir, loaderPkg);

  const srcReadmePath = join(inputDir, 'README.md');
  const distReadmePath = join(outputDir, 'README.md');
  await copyFile(srcReadmePath, distReadmePath);

  console.log(`🏙  ${PACKAGE}`);
}

async function buildRuntime(input: string) {
  const result = await execa('pnpm', ['build'], {
    stdout: 'inherit',
    cwd: input,
  });
  if (result.failed) {
    panic(`tsc failed`);
  }
}

async function buildVite(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'buildtime', 'vite', 'index.ts')];

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
    '@builder.io/qwik',
    '@builder.io/qwik/optimizer',
  ];

  const swRegisterPath = join(inputDir, 'runtime', 'src', 'sw-register.ts');
  let swRegisterCode = await readFile(swRegisterPath, 'utf-8');

  const swResult = await transform(swRegisterCode, { loader: 'ts', minify: true });
  swRegisterCode = swResult.code.trim();
  if (swRegisterCode.endsWith(';')) {
    swRegisterCode = swRegisterCode.slice(0, swRegisterCode.length - 1);
  }

  await build({
    entryPoints,
    outfile: join(outputDir, 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    watch: watcher(config),
    plugins: [serviceWorkerRegisterBuild(swRegisterCode)],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external,
    watch: watcher(config),
    plugins: [serviceWorkerRegisterBuild(swRegisterCode)],
  });
}

function serviceWorkerRegisterBuild(swRegisterCode: string) {
  const filter = /\@qwik-city-sw-register-build/;

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

async function buildServiceWorker(config: BuildConfig, inputDir: string, outputDir: string) {
  const build = await rollup({
    input: join(
      config.tscDir,
      'packages',
      'qwik-city',
      'runtime',
      'src',
      'service-worker',
      'index.js'
    ),
  });

  await build.write({
    file: join(outputDir, 'service-worker.mjs'),
    format: 'es',
  });

  await build.write({
    file: join(outputDir, 'service-worker.cjs'),
    format: 'cjs',
  });
}

async function buildAdaptorAzureSwaVite(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'adaptors', 'azure-swa', 'vite', 'index.ts')];

  const external = ['vite', 'fs', 'path', '@builder.io/qwik-city/static'];

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'azure-swa', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external,
    plugins: [resolveAdaptorShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'azure-swa', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    watch: watcher(config),
    external,
    plugins: [resolveAdaptorShared('../../shared/vite/index.cjs')],
  });
}

async function buildAdaptorCloudflarePagesVite(
  config: BuildConfig,
  inputDir: string,
  outputDir: string
) {
  const entryPoints = [join(inputDir, 'adaptors', 'cloudflare-pages', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'cloudflare-pages', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveAdaptorShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'cloudflare-pages', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveAdaptorShared('../../shared/vite/index.cjs')],
  });
}

async function buildAdaptorCloudRunVite(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'adaptors', 'cloud-run', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'cloud-run', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveAdaptorShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'cloud-run', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveAdaptorShared('../../shared/vite/index.cjs')],
  });
}

async function buildAdaptorExpressVite(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'adaptors', 'express', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'express', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveAdaptorShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'express', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveAdaptorShared('../../shared/vite/index.cjs')],
  });
}

async function buildAdaptorNetlifyEdgeVite(
  config: BuildConfig,
  inputDir: string,
  outputDir: string
) {
  const entryPoints = [join(inputDir, 'adaptors', 'netlify-edge', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'netlify-edge', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveAdaptorShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'netlify-edge', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [
      resolveAdaptorShared('../../shared/vite/index.cjs'),
      resolveRequestHandler('../../../middleware/request-handler/index.cjs'),
    ],
  });
}

async function buildAdaptorSharedVite(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'adaptors', 'shared', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'shared', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [
      resolveStatic('../../../static/index.mjs'),
      resolveRequestHandler('../../../middleware/request-handler/index.mjs'),
    ],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'shared', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [
      resolveStatic('../../../static/index.cjs'),
      resolveRequestHandler('../../../middleware/request-handler/index.cjs'),
    ],
  });
}

async function buildAdaptorStaticVite(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'adaptors', 'static', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'static', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveStatic('../../../static/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'static', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveStatic('../../../static/index.cjs')],
  });
}

async function buildAdaptorVercelEdgeVite(
  config: BuildConfig,
  inputDir: string,
  outputDir: string
) {
  const entryPoints = [join(inputDir, 'adaptors', 'vercel-edge', 'vite', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'vercel-edge', 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveAdaptorShared('../../shared/vite/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'adaptors', 'vercel-edge', 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    watch: watcher(config),
    external: ADAPTOR_EXTERNALS,
    plugins: [resolveAdaptorShared('../../shared/vite/index.cjs')],
  });
}

async function buildMiddlewareAzureSwa(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'middleware', 'azure-swa', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'middleware', 'azure-swa', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareCloudflarePages(
  config: BuildConfig,
  inputDir: string,
  outputDir: string
) {
  const entryPoints = [join(inputDir, 'middleware', 'cloudflare-pages', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'middleware', 'cloudflare-pages', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareNetlifyEdge(
  config: BuildConfig,
  inputDir: string,
  outputDir: string
) {
  const entryPoints = [join(inputDir, 'middleware', 'netlify-edge', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'middleware', 'netlify-edge', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    watch: watcher(config),
    external: MIDDLEWARE_EXTERNALS,
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildMiddlewareNode(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'middleware', 'node', 'index.ts')];

  const external = ['node-fetch', 'undici', 'path', 'os', 'fs', 'url', ...MIDDLEWARE_EXTERNALS];

  await build({
    entryPoints,
    outfile: join(outputDir, 'middleware', 'node', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    watch: watcher(config),
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'middleware', 'node', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external,
    watch: watcher(config),
    plugins: [resolveRequestHandler('../request-handler/index.cjs')],
  });
}

async function buildMiddlewareRequestHandler(
  config: BuildConfig,
  inputDir: string,
  outputDir: string
) {
  const entryPoints = [join(inputDir, 'middleware', 'request-handler', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'middleware', 'request-handler', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    watch: watcher(config),
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'middleware', 'request-handler', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external: MIDDLEWARE_EXTERNALS,
    watch: watcher(config),
  });
}

async function buildMiddlewareVercelEdge(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'middleware', 'vercel-edge', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'middleware', 'vercel-edge', 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external: MIDDLEWARE_EXTERNALS,
    watch: watcher(config),
    plugins: [resolveRequestHandler('../request-handler/index.mjs')],
  });
}

async function buildStatic(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'static', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'static', 'index.mjs'),
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    watch: watcher(config),
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'static', 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    watch: watcher(config),
  });
}

async function buildStaticDeno(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'static', 'deno', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(outputDir, 'static', 'deno.mjs'),
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    watch: watcher(config),
    plugins: [resolveRequestHandler('../middleware/request-handler/index.mjs')],
  });
}

async function buildStaticNode(config: BuildConfig, inputDir: string, outputDir: string) {
  const entryPoints = [join(inputDir, 'static', 'node', 'index.ts')];

  const external = [
    '@builder.io/qwik',
    '@builder.io/qwik/optimizer',
    '@builder.io/qwik-city',
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
    outfile: join(outputDir, 'static', 'node.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    watch: watcher(config),
    plugins: [resolveRequestHandler('../middleware/request-handler/index.mjs')],
  });

  await build({
    entryPoints,
    outfile: join(outputDir, 'static', 'node.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external,
    watch: watcher(config),
    plugins: [resolveRequestHandler('../middleware/request-handler/index.cjs')],
  });
}

function resolveRequestHandler(path: string) {
  return importPath(/middleware\/request-handler/, path);
}

function resolveStatic(path: string) {
  return importPath(/static$/, path);
}

function resolveAdaptorShared(path: string) {
  return importPath(/shared\/vite$/, path);
}

const ADAPTOR_EXTERNALS = [
  'vite',
  'fs',
  'path',
  '@builder.io/qwik',
  '@builder.io/qwik/optimizer',
  '@builder.io/qwik-city',
  '@builder.io/qwik-city/static',
  '@builder.io/qwik-city/middleware/request-handler',
];

const MIDDLEWARE_EXTERNALS = [
  '@builder.io/qwik',
  '@builder.io/qwik/optimizer',
  '@builder.io/qwik-city',
  '@builder.io/qwik-city/static',
  '@qwik-city-plan',
  '@qwik-city-not-found-paths',
  '@qwik-city-static-paths',
];
