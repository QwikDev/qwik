import { build } from 'esbuild';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { copyStartersDir } from './create-qwik-cli.ts';
import { type BuildConfig, copyDir, getBanner, nodeTarget } from './util.ts';

/** Builds @qwik.dev/core/cli */
export async function submoduleCli(config: BuildConfig) {
  const submodule = 'cli';

  await build({
    entryPoints: [join(config.srcQwikDir, submodule, 'index.ts')],
    outfile: join(config.distQwikPkgDir, 'cli.mjs'),
    format: 'esm',
    platform: 'node',
    target: nodeTarget,
    sourcemap: false,
    bundle: true,
    banner: {
      js: [
        getBanner('@qwik.dev/core/cli', config.distVersion),
        `import { createRequire } from 'node:module';`,
        `const require = createRequire(import.meta.url);`,
      ].join('\n'),
    },
    plugins: [
      {
        name: 'colorAlias',
        setup(build) {
          build.onResolve({ filter: /^chalk$/ }, async (args) => {
            const result = await build.resolve('kleur', {
              resolveDir: args.resolveDir,
              kind: 'import-statement',
            });
            if (result.errors.length > 0) {
              return { errors: result.errors };
            }
            return { path: result.path };
          });
        },
      },
      {
        // migrate-v2 installs ts-morph into the project, which may not contain this CLI (npx)
        name: 'tsMorphFromProject',
        setup(build) {
          build.onResolve({ filter: /^ts-morph$/ }, () => ({
            path: 'ts-morph',
            namespace: 'project',
          }));
          build.onLoad({ filter: /.*/, namespace: 'project' }, () => ({
            contents: `module.exports = require('node:module').createRequire(process.cwd() + '/')('ts-morph');`,
            loader: 'js',
          }));
        },
      },
    ],
    external: ['prettier', 'typescript'],
    define: {
      'globalThis.CODE_MOD': 'true',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    },
  });

  await copyStartersDir(config, config.distQwikPkgDir, ['features', 'adapters']);

  const tmplSrc = join(config.startersDir, 'templates');
  const tmplDist = join(config.distQwikPkgDir, 'templates');

  if (existsSync(tmplDist)) {
    rmSync(tmplDist, { recursive: true });
  }

  await copyDir(config, tmplSrc, tmplDist);

  console.log('📠', submodule);
}
