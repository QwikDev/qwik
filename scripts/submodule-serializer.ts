import { build, type Metafile, type Plugin } from 'esbuild';
import { join } from 'node:path';
import { minify } from 'terser';
import { MANGLE_PROPS_REGEX } from './submodule-core.ts';
import { isCopyableCorePath } from './submodule-server.ts';
import { type BuildConfig, getBanner, readFile, target, writeFile } from './util.ts';

/**
 * Builds @qwik.dev/core/internal/serializer
 *
 * The serializer is kept out of core so browser apps only load it with the segments that call it
 * (e.g. `server$`). It shares core's runtime through `@qwik.dev/core/internal`.
 *
 * @param nameCache - Terser nameCache from the core build, so $...$ properties match core.prod.mjs.
 */
export async function submoduleSerializer(config: BuildConfig, nameCache?: object) {
  const result = await build({
    entryPoints: [join(config.srcQwikDir, 'serializer', 'index.ts')],
    outfile: join(config.distQwikPkgDir, 'serializer.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target,
    metafile: true,
    banner: { js: getBanner('@qwik.dev/core/internal/serializer', config.distVersion) },
    external: ['@qwik.dev/core', '@qwik.dev/core/internal', '@qwik.dev/core/build'],
    define: {
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    },
    plugins: [treatCoreAsSideEffectFree()],
  });
  validateInlinedCoreModules(result.metafile);

  const prodPath = join(config.distQwikPkgDir, 'serializer.prod.mjs');
  if (config.dev || config.mangle === false || !nameCache) {
    await writeFile(prodPath, `export * from './serializer.mjs';\n`);
  } else {
    const code = await readFile(join(config.distQwikPkgDir, 'serializer.mjs'), 'utf-8');
    const mangled = await minify(code, {
      nameCache,
      compress: false,
      mangle: { properties: { regex: MANGLE_PROPS_REGEX } },
      format: {
        beautify: true,
        braces: true,
        comments: 'all',
        preserve_annotations: true,
        ecma: 2020,
      },
    });
    await writeFile(prodPath, mangled.code!);
  }

  console.log('🥫 serializer');
}

/** Lets modules imported only for const enums or types drop out of the bundle. */
function treatCoreAsSideEffectFree(): Plugin {
  return {
    name: 'core-side-effect-free',
    setup(build) {
      build.onResolve({ filter: /^\./ }, async (args) => {
        if (args.pluginData) {
          return undefined;
        }
        const resolved = await build.resolve(args.path, {
          kind: args.kind,
          importer: args.importer,
          resolveDir: args.resolveDir,
          pluginData: true,
        });
        if (/[\\/]src[\\/](core|server)[\\/]/.test(resolved.path)) {
          return { path: resolved.path, sideEffects: false };
        }
        return resolved;
      });
    },
  };
}

/** Same rule as the server's `forbid-core`, applied to emitted code since const enums load anyway. */
function validateInlinedCoreModules(metafile: Metafile) {
  const forbidden = Object.values(metafile.outputs)
    .flatMap((output) => Object.entries(output.inputs))
    .filter(([path, input]) => input.bytesInOutput > 0 && /src[\\/]core[\\/]/.test(path))
    .map(([path]) => path)
    .filter((path) => !isCopyableCorePath(path));
  if (forbidden.length) {
    throw new Error(
      `The serializer must import these from '@qwik.dev/core/internal' instead of copying them:\n` +
        forbidden.join('\n')
    );
  }
}
