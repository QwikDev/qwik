import { build } from 'esbuild';
import { join } from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import {
  rolldown,
  type InputOptions as RolldownInputOptions,
  type Plugin as RolldownPlugin,
} from 'rolldown';
import { minify, type MinifyOptions } from 'terser';
import { type BuildConfig, copyFile, fileSize, getBanner, target, writeFile } from './util.ts';

/**
 * Regex for property names that should be mangled consistently across all bundles (core + server).
 * Properties matching $...$ are internal framework properties not part of the public API.
 */
export const MANGLE_PROPS_REGEX = '^\\$.+\\$$';

/** Terser strands these annotations, so bundlers silently drop the tree-shaking hint. */
function fixPureAnnotations(code: string): string {
  return code
    .replace(/\/\*\s*[@#]__PURE__\s*\*\/\s*return\s+/g, 'return /* @__PURE__ */ ')
    .replace(/\/\*\s*[@#]__PURE__\s*\*\/(\s*)(?=[^\sA-Za-z_$(])/g, '$1');
}

/**
 * Core ships as a Qwik library (`core*.qwik.mjs`): the app's optimizer turns core's own QRL sites
 * (see `library-qrl.ts`) into segments and hoists their `qrl()` calls to the top of that file.
 * Those calls need the QRL machinery initialized, so it is emitted as `core-qrl*.mjs`, which the
 * core chunk imports and therefore evaluates first. Only list modules whose top level touches
 * nothing outside this list; `core-hoisting.unit.ts` checks that.
 */
const QRL_MACHINERY =
  /[/\\]core[/\\](shared[/\\](qrl[/\\](qrl|qrl-class|qrl-class-dev|qrl-utils)|singletons|utils[/\\](qdev|types|promises))|version|preloader[/\\]bridge)\.[jt]s$|[/\\]core-qrl(\.prod|\.min)?\.mjs$|^\0prod-build$|^@qwik\.dev\/core\/build$/;

const coreCodeSplitting = {
  groups: [{ name: 'core-qrl', test: QRL_MACHINERY, includeDependenciesRecursively: false }],
};

/** Core's QRL sites import `_inlinedQrl` from `@qwik.dev/core` so app optimizers extract them. */
const libraryQrlSites: RolldownPlugin = {
  name: 'libraryQrlSites',
  resolveId(id) {
    if (/[/\\]library-qrl(\.js)?$/.test(id)) {
      return { id: '@qwik.dev/core', external: true };
    }
  },
};

type CoreVariant = '' | '.prod' | '.min';

const coreFileNames = (variant: CoreVariant) => ({
  core: `core${variant}.qwik.mjs`,
  qrl: `core-qrl${variant}.mjs`,
});

/**
 * Build the core package which is also the root package: @qwik.dev/core
 *
 * Uses rolldown on the sources during development (it is fast) and TSC + rolldown + Terser for
 * production, because tsc output minifies better.
 *
 * In production, returns a Terser nameCache so the server bundle can apply the same property
 * mangling and keep $...$ names in sync across both bundles.
 */
export async function submoduleCore(config: BuildConfig): Promise<object | undefined> {
  const platformDir = join(config.srcQwikDir, 'core', 'shared', 'platform');
  await build({
    entryPoints: [
      join(platformDir, 'async-local-storage.ts'),
      join(platformDir, 'async-local-storage.node.ts'),
    ],
    outdir: config.distQwikPkgDir,
    bundle: true,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    external: ['node:async_hooks'],
    target,
  });
  await copyFile(
    join(config.dtsDir, 'packages/qwik/src/core/shared/platform/async-local-storage.d.ts'),
    join(config.distQwikPkgDir, 'async-local-storage.d.ts')
  );

  if (config.dev) {
    await submoduleCoreDev(config);
    return undefined;
  }
  return submoduleCoreProd(config);
}

/**
 * Rolldown picks its own local name for the `@qwik.dev/core` import of `inlinedQrl`; the TS
 * optimizer only extracts calls whose local name is `_inlinedQrl`, so rename that binding.
 */
function nameLibraryQrlImport(code: string) {
  const match = /import \{ inlinedQrl(?: as ([\w$]+))? \} from "@qwik\.dev\/core";/.exec(code);
  if (!match) {
    return code;
  }
  const local = match[1] ?? 'inlinedQrl';
  const escaped = local.replace(/\$/g, '\\$');
  const body = code.slice(match.index + match[0].length);
  const renamed = body.replace(new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])`, 'g'), '_inlinedQrl');
  const importLine = 'import { inlinedQrl as _inlinedQrl } from "@qwik.dev/core";';
  return code.slice(0, match.index) + importLine + renamed;
}

/**
 * Terser's frequency-sorted name generator minus `$`: app optimizers treat any called identifier
 * ending in `$` as a QRL marker, so the minified library must never produce one.
 */
function identifiersWithoutDollar() {
  const leading = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'];
  const digits = [...'0123456789'];
  const frequency = new Map<string, number>();
  let chars = [...leading, ...digits];
  const byFrequency = (a: string, b: string) => frequency.get(b)! - frequency.get(a)!;
  return {
    reset() {
      chars.forEach((ch) => frequency.set(ch, 0));
    },
    consider(str: string, delta: number) {
      for (const ch of str) {
        if (frequency.has(ch)) {
          frequency.set(ch, frequency.get(ch)! + delta);
        }
      }
    },
    sort() {
      // Array.prototype.sort is stable, matching Terser's merge sort.
      chars = [...[...leading].sort(byFrequency), ...[...digits].sort(byFrequency)];
    },
    get(num: number) {
      let name = '';
      let base = leading.length;
      num++;
      do {
        num--;
        name += chars[num % base];
        num = Math.floor(num / base);
        base = chars.length;
      } while (num > 0);
      return name;
    },
  };
}

/**
 * Terser only avoids plain property names of the chunk it is minifying, so a `$name$` mangled in
 * one core chunk could take a name another chunk uses as-is (e.g. the QRL's `m` method).
 */
function collectPlainPropertyNames(chunks: { code: string }[]) {
  const names = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const n = node as Record<string, any>;
    if (n.type === 'MemberExpression' && !n.computed) {
      names.add(n.property.name);
    } else if (
      (n.type === 'Property' || n.type === 'MethodDefinition' || n.type === 'PropertyDefinition') &&
      !n.computed
    ) {
      names.add(n.key.name ?? String(n.key.value));
    } else if (n.type === 'Literal' && typeof n.value === 'string') {
      names.add(n.value);
    }
    for (const key in n) {
      visit(n[key]);
    }
  };
  chunks.forEach((chunk) => visit(parseAst(chunk.code)));
  const isMangled = new RegExp(MANGLE_PROPS_REGEX);
  return [...names].filter((name) => !isMangled.test(name));
}

/** Bundles core into its entry chunk and its QRL machinery chunk, and returns both. */
async function bundleCore(
  config: BuildConfig,
  input: string,
  variant: CoreVariant,
  inputOptions: Pick<RolldownInputOptions, 'external' | 'plugins'>
) {
  const names = coreFileNames(variant);
  const bundle = await rolldown({
    input,
    platform: 'neutral',
    logLevel: 'warn',
    ...inputOptions,
    plugins: [libraryQrlSites, ...((inputOptions.plugins as RolldownPlugin[]) ?? [])],
  });
  const { output } = await bundle.generate({
    format: 'esm',
    entryFileNames: names.core,
    chunkFileNames: names.qrl,
    sourcemap: variant === '',
    codeSplitting: coreCodeSplitting,
  });
  await bundle.close();
  const chunks = output
    .filter((o) => o.type === 'chunk')
    .map((c) => ({ fileName: c.fileName, code: c.code, sourcemapFileName: c.sourcemapFileName }));
  const fileNames = chunks.map((c) => c.fileName).sort();
  if (fileNames.join() !== [names.core, names.qrl].sort().join()) {
    throw new Error(`core build must emit ${names.core} and ${names.qrl}, got ${fileNames}`);
  }
  for (const chunk of chunks) {
    chunk.code = chunk.code.replaceAll(
      'globalThis.QWIK_VERSION',
      JSON.stringify(config.distVersion)
    );
    if (chunk.fileName === names.core) {
      chunk.code = nameLibraryQrlImport(chunk.code);
    }
    if (
      chunk.fileName === names.core &&
      !chunk.code.includes('inlinedQrl as _inlinedQrl } from "@qwik.dev/core"')
    ) {
      const imports = chunk.code.split('\n').filter((line) => line.startsWith('import'));
      throw new Error(
        `${names.core} must import inlinedQrl as _inlinedQrl from @qwik.dev/core for its QRLs:\n${imports.join('\n')}`
      );
    }
    if (chunk.fileName === names.qrl && chunk.code.includes('from "@qwik.dev/core";')) {
      throw new Error(`${names.qrl} must not contain QRL sites; they would run before it`);
    }
  }
  return { chunks, sourcemaps: output.filter((o) => o.type === 'asset') };
}

async function writeCoreChunks(config: BuildConfig, files: { fileName: string; code: string }[]) {
  for (const { fileName, code } of files) {
    await writeFile(join(config.distQwikPkgDir, fileName), code);
    console.log(`🦊 ${fileName}:`, await fileSize(join(config.distQwikPkgDir, fileName)));
  }
}

const coreExternals = [
  '@qwik.dev/core/build',
  '@qwik.dev/core/preloader',
  'node:async_hooks',
  '@qwik.dev/core/async-local-storage',
];

async function submoduleCoreProd(config: BuildConfig): Promise<object | undefined> {
  const banner = getBanner('@qwik.dev/core', config.distVersion);
  const devNames = coreFileNames('');
  const { chunks, sourcemaps } = await bundleCore(
    config,
    join(config.tscDir, 'packages', 'qwik', 'src', 'core', 'index.js'),
    '',
    {
      external: coreExternals,
    }
  );
  await writeCoreChunks(
    config,
    chunks.map((c) => ({
      fileName: c.fileName,
      code: `${banner}\n${c.code}${c.sourcemapFileName ? `\n//# sourceMappingURL=${c.sourcemapFileName}` : ''}`,
    }))
  );
  for (const map of sourcemaps) {
    await writeFile(join(config.distQwikPkgDir, map.fileName), String(map.source));
  }

  const devCore = join(config.distQwikPkgDir, devNames.core);

  const min = await bundleCore(config, devCore, '.min', {
    external: ['@qwik.dev/core/preloader', 'node:async_hooks'],
    plugins: [
      {
        name: 'build',
        resolveId(id) {
          if (id === '@qwik.dev/core/async-local-storage') {
            return join(config.distQwikPkgDir, 'async-local-storage.mjs');
          }
          if (id === '@qwik.dev/core/build') {
            return id;
          }
        },
        load(id) {
          if (id === '@qwik.dev/core/build') {
            return `
              export const isServer = false;
              export const isBrowser = true;
              export const isDev = false;
            `;
          }
        },
      },
    ],
  });
  const prod = await bundleCore(config, devCore, '.prod', {
    external: [
      '@qwik.dev/core/preloader',
      'node:async_hooks',
      '@qwik.dev/core/async-local-storage',
    ],
    plugins: [inlineProdIsDev()],
  });

  // Shared nameCache so that $...$  property mangling is consistent across all Terser runs
  // (core.min, core.prod and both of their chunks) and can later be reused for the server bundle.
  // When mangle=false (--mangle=false), skip mangling.
  const nameCache: object = {};
  const noMangle = config.mangle === false;
  const mangle: MinifyOptions['mangle'] = noMangle
    ? false
    : {
        toplevel: true,
        module: true,
        // App optimizers only extract QRL sites calling exactly `_inlinedQrl`.
        reserved: ['_inlinedQrl'],
        nth_identifier: identifiersWithoutDollar(),
        properties: {
          regex: MANGLE_PROPS_REGEX,
          reserved: collectPlainPropertyNames([...min.chunks, ...prod.chunks]),
        },
      };

  const minFiles = [];
  for (const chunk of min.chunks) {
    const result = await minify(chunk.code, {
      module: true,
      toplevel: true,
      nameCache: mangle ? nameCache : undefined,
      compress: {
        defaults: true,
        hoist_funs: true,
        keep_fargs: false,
        pure_getters: 'strict',
        pure_new: true,
        toplevel: true,
        unsafe_arrows: true,
        unsafe_math: true,
        unsafe_symbols: true,
        unsafe: true,

        passes: 3,
        ecma: 2020,
        module: true,

        global_defs: {
          // special global that when set to false will remove all dev code entirely
          // developer production builds could use core.min directly, or setup
          // their own build tools to define the global `qwikDev` to false
          'globalThis.qDev': false,
          'globalThis.qInspector': false,
          'globalThis.qDynamicPlatform': false,
          'globalThis.qTest': false,
          'globalThis.qRuntimeQrl': false,
          'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
        },
      },
      mangle,
      format: {
        comments: /__PURE__/,
        preserve_annotations: true,
        ecma: 2020,
      },
    });
    const code = fixPureAnnotations(result.code!.replace(/__self__/g, '__SELF__'));
    validateNoBareExperimentalReferences(code, chunk.fileName);
    validateNoHmrReferences(code, chunk.fileName);
    const selfIdx = code.indexOf('self');
    if (selfIdx !== -1) {
      throw new Error(
        `"${chunk.fileName}" should not have any global references, and should have been removed for a production minified build\n` +
          code.substring(selfIdx - 100, selfIdx + 300)
      );
    }
    minFiles.push({ fileName: chunk.fileName, code });
  }
  await writeCoreChunks(config, minFiles);

  const prodFiles = [];
  for (const chunk of prod.chunks) {
    prodFiles.push({
      fileName: chunk.fileName,
      code: await minifyProdChunk(config, chunk.code, chunk.fileName, mangle, nameCache),
    });
  }
  await writeCoreChunks(config, prodFiles);

  return mangle ? nameCache : undefined;
}

/**
 * Inlines only `isDev = false` from `@qwik.dev/core/build`, while keeping `isServer` and
 * `isBrowser` as imports (the build is universal — it must work on both server and browser).
 */
function inlineProdIsDev(): RolldownPlugin {
  const VIRTUAL_BUILD = '\0prod-build';
  return {
    name: 'inlineProdIsDev',
    resolveId(id, importer) {
      if (id === '@qwik.dev/core/build') {
        // When the virtual itself re-imports @qwik.dev/core/build, keep it external.
        if (importer === VIRTUAL_BUILD) {
          return { id, external: true };
        }
        return VIRTUAL_BUILD;
      }
    },
    load(id) {
      if (id === VIRTUAL_BUILD) {
        return `
          export { isServer, isBrowser } from '@qwik.dev/core/build';
          export const isDev = false;
        `;
      }
    },
  };
}

async function minifyProdChunk(
  config: BuildConfig,
  code: string,
  fileName: string,
  mangle: MinifyOptions['mangle'],
  nameCache: object
) {
  const result = await minify(code, {
    nameCache: mangle ? nameCache : undefined,
    compress: {
      defaults: false,
      booleans: true,
      conditionals: true,
      dead_code: true,
      evaluate: true,
      hoist_props: true,
      keep_classnames: true,
      keep_fargs: false,
      keep_fnames: true,
      keep_infinity: true,
      loops: true,
      properties: true,
      pure_getters: 'strict',
      pure_new: true,
      reduce_funcs: true,
      reduce_vars: true,
      side_effects: true,
      toplevel: true,
      unsafe_arrows: true,
      unsafe_math: true,
      unsafe_symbols: true,
      unsafe: true,
      unused: true,

      passes: 3,
      ecma: 2020,
      module: true,

      global_defs: {
        'globalThis.qDev': false,
        'globalThis.qInspector': false,
        'globalThis.qDynamicPlatform': true,
        'globalThis.qTest': false,
        'globalThis.qRuntimeQrl': false,
        'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      },
    },
    format: {
      beautify: true,
      braces: true,
      comments: /__PURE__/,
      preserve_annotations: true,
      ecma: 2020,
      preamble: getBanner('@qwik.dev/core', config.distVersion),
    },
    mangle,
  });
  const prodCode = fixPureAnnotations(result.code!);
  validateNoBareExperimentalReferences(prodCode, fileName);
  validateNoHmrReferences(prodCode, fileName);
  return prodCode + '\n';
}

function validateNoBareExperimentalReferences(code: string, filename: string) {
  const bareExperimentalReference = /(?<![\w$.])__EXPERIMENTAL__(?![\w$.])/;
  const match = bareExperimentalReference.exec(code);
  if (match) {
    const index = match.index;
    throw new Error(
      `"${filename}" should only reference experimental flags as "__EXPERIMENTAL__.feature".\n` +
        code.substring(Math.max(0, index - 100), index + 300)
    );
  }
}

function validateNoHmrReferences(code: string, filename: string) {
  if (code.includes('import.meta.hot')) {
    throw new Error(`"${filename}" should not contain HMR code.`);
  }
}

async function submoduleCoreDev(config: BuildConfig) {
  // Every variant gets its own chunk pair: core and core-qrl import each other by file name.
  for (const variant of ['', '.prod', '.min'] as const) {
    const { chunks, sourcemaps } = await bundleCore(
      config,
      join(config.srcQwikDir, 'core', 'index.ts'),
      variant,
      {
        external: coreExternals,
      }
    );
    await writeCoreChunks(
      config,
      chunks.map((c) => ({
        fileName: c.fileName,
        code: `${c.code}${c.sourcemapFileName ? `\n//# sourceMappingURL=${c.sourcemapFileName}` : ''}`,
      }))
    );
    for (const map of sourcemaps) {
      await writeFile(join(config.distQwikPkgDir, map.fileName), String(map.source));
    }
  }

  console.log('🐬', 'core', '(dev)');
}
