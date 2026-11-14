import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import {
  rolldown,
  type InputOptions as RolldownInputOptions,
  type Plugin as RolldownPlugin,
} from 'rolldown';
import { type ManglePropertiesOptions, minify, type MinifyOptions } from 'terser';
import { compileCoreQrls } from './core-library-qrls.ts';
import { serverSourceOptions } from './submodule-server.ts';
import { type BuildConfig, copyFile, fileSize, getBanner, target, writeFile } from './util.ts';

/**
 * Regex for property names that should be mangled consistently across all of core's chunks.
 * Properties matching $...$ are internal framework properties not part of the public API.
 */
const MANGLE_PROPS_REGEX = '^\\$.+\\$$';

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

/** Compiles core's `$()` sites like any Qwik library's, with the TS optimizer built before core. */
async function libraryModeQrls(config: BuildConfig, srcDir: string): Promise<RolldownPlugin> {
  const tsOptimizerPath = join(config.distQwikPkgDir, 'ts-optimizer.mjs');
  if (!existsSync(tsOptimizerPath)) {
    throw new Error(`core's build needs the TS optimizer: build it with --optimizer first`);
  }
  const { transformModule } = await import(tsOptimizerPath);
  const coreDir = join(srcDir, 'core');
  return {
    name: 'libraryModeQrls',
    transform(code, id) {
      return compileCoreQrls(transformModule, coreDir, id, code);
    },
  };
}

type CoreVariant = '' | '.prod' | '.min';
type CoreEntry = 'core' | 'serializer' | 'server';
type CoreInputs = Record<CoreEntry, string>;

const coreFileNames = (variant: CoreVariant) => ({
  core: `core${variant}.qwik.mjs`,
  serializer: `serializer${variant}.mjs`,
  server: `server${variant}.mjs`,
  qrl: `core-qrl${variant}.mjs`,
});

/**
 * Bundling the serializer and server with core makes them import core's modules instead of copying
 * them, and share its property mangling. Every variant has all of them: an entry resolved to
 * another variant than core would bundle a second core, as the browser's import of the server
 * (never run there) would with the min variant.
 */
const CORE_ENTRIES: CoreEntry[] = ['core', 'serializer', 'server'];

const coreInputs = (pathOf: (entry: CoreEntry) => string) =>
  Object.fromEntries(CORE_ENTRIES.map((entry) => [entry, pathOf(entry)])) as CoreInputs;

/** Points the serializer and server sources at the core and serializer entries. */
function resolveCoreEntries(inputs: CoreInputs): RolldownPlugin {
  return {
    name: 'resolveCoreEntries',
    resolveId(id) {
      if (id === '@qwik.dev/core' || id === '@qwik.dev/core/internal') {
        return inputs.core;
      }
      if (id === '@qwik.dev/core/internal/serializer') {
        return inputs.serializer;
      }
    },
  };
}

/**
 * Build the core package which is also the root package: @qwik.dev/core, together with its
 * `/internal/serializer` and `/server` subpaths.
 *
 * Uses rolldown on the sources during development (it is fast) and TSC + rolldown + Terser for
 * production, because tsc output minifies better.
 */
export async function submoduleCore(config: BuildConfig) {
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

  const server = await serverSourceOptions(config);
  if (config.dev) {
    await submoduleCoreDev(config, server);
  } else {
    await submoduleCoreProd(config, server);
  }
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

/** Bundles each entry into its own chunk, plus the shared QRL machinery chunk, and returns them. */
async function bundleCore(
  config: BuildConfig,
  inputs: CoreInputs,
  variant: CoreVariant,
  inputOptions: Pick<RolldownInputOptions, 'external' | 'plugins'>,
  inlinedGlobals: Record<string, string> = {},
  banner = ''
) {
  const names = coreFileNames(variant);
  const bundle = await rolldown({
    input: inputs,
    platform: 'neutral',
    logLevel: 'warn',
    // Entry chunks export what the other entries import from them.
    preserveEntrySignatures: 'allow-extension',
    ...inputOptions,
    plugins: [libraryQrlSites, ...((inputOptions.plugins as RolldownPlugin[]) ?? [])],
  });
  const { output } = await bundle.generate({
    format: 'esm',
    entryFileNames: (chunk) => names[chunk.name as CoreEntry],
    chunkFileNames: names.qrl,
    sourcemap: variant === '',
    codeSplitting: coreCodeSplitting,
    // Added while rendering, so the sourcemaps account for them.
    banner: (chunk) => {
      // Entering through core's QRL chunk would evaluate core before the QRL machinery.
      const coreFirst = chunk.isEntry && chunk.name !== 'core' ? `import "./${names.core}";` : '';
      return [banner, coreFirst].filter(Boolean).join('\n');
    },
  });
  await bundle.close();
  const chunks = output
    .filter((o) => o.type === 'chunk')
    .map((c) => ({ fileName: c.fileName, code: c.code, sourcemapFileName: c.sourcemapFileName }));
  const fileNames = chunks.map((c) => c.fileName).sort();
  const expected = [...Object.keys(inputs).map((e) => names[e as CoreEntry]), names.qrl].sort();
  if (fileNames.join() !== expected.join()) {
    throw new Error(`core build must emit ${expected}, got ${fileNames}`);
  }
  for (const name of Object.keys(inlinedGlobals)) {
    if (!chunks.some((chunk) => chunk.code.includes(name))) {
      throw new Error(`core build must inline ${name}, but no chunk references it`);
    }
  }
  const globals = {
    'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    ...inlinedGlobals,
  };
  for (const chunk of chunks) {
    for (const [name, value] of Object.entries(globals)) {
      chunk.code = chunk.code.replaceAll(name, () => value);
    }
    if (chunk.fileName === names.core) {
      chunk.code = nameLibraryQrlImport(chunk.code);
      validateLibraryQrlImport(chunk.code, chunk.fileName);
      continue;
    }
    if (/from "@qwik\.dev\/core(\/internal(\/serializer)?)?";/.test(chunk.code)) {
      throw new Error(
        `${chunk.fileName} must not import @qwik.dev/core: QRL sites belong in ${names.core}, and the other entries import its chunk`
      );
    }
  }
  return { chunks, sourcemaps: output.filter((o) => o.type === 'asset') };
}

function validateLibraryQrlImport(code: string, fileName: string) {
  if (!code.includes('inlinedQrl as _inlinedQrl } from "@qwik.dev/core"')) {
    const imports = code.split('\n').filter((line) => line.startsWith('import'));
    throw new Error(
      `${fileName} must import inlinedQrl as _inlinedQrl from @qwik.dev/core for its QRLs:\n${imports.join('\n')}`
    );
  }
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

type ServerSourceOptions = Awaited<ReturnType<typeof serverSourceOptions>>;

async function bundleCoreSources(
  config: BuildConfig,
  srcDir: string,
  ext: 'ts' | 'js',
  variant: CoreVariant,
  server: ServerSourceOptions,
  banner?: string
) {
  const inputs = coreInputs((entry) => join(srcDir, entry, `index.${ext}`));
  const plugins = [
    await libraryModeQrls(config, srcDir),
    resolveCoreEntries(inputs),
    ...server.plugins,
  ];
  return bundleCore(
    config,
    inputs,
    variant,
    { external: coreExternals, plugins },
    server.globals,
    banner
  );
}

async function submoduleCoreProd(config: BuildConfig, server: ServerSourceOptions) {
  const banner = getBanner('@qwik.dev/core', config.distVersion);
  const devNames = coreFileNames('');
  const { chunks, sourcemaps } = await bundleCoreSources(
    config,
    join(config.tscDir, 'packages', 'qwik', 'src'),
    'js',
    '',
    server,
    banner
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

  const devInputs = coreInputs((entry) => join(config.distQwikPkgDir, devNames[entry]));

  const min = await bundleCore(config, devInputs, '.min', {
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
  const prod = await bundleCore(config, devInputs, '.prod', {
    external: [
      '@qwik.dev/core/preloader',
      'node:async_hooks',
      '@qwik.dev/core/async-local-storage',
    ],
    plugins: [inlineProdIsDev()],
  });

  // Shared nameCache so that $...$ property mangling is consistent across all Terser runs.
  // When mangle=false (--mangle=false), skip mangling.
  const nameCache: object = {};
  const noMangle = config.mangle === false;
  const mangleProperties: ManglePropertiesOptions | undefined = noMangle
    ? undefined
    : {
        regex: MANGLE_PROPS_REGEX,
        reserved: collectPlainPropertyNames([...min.chunks, ...prod.chunks]),
      };
  const mangle: MinifyOptions['mangle'] = mangleProperties
    ? {
        toplevel: true,
        module: true,
        // App optimizers only extract QRL sites calling exactly `_inlinedQrl`.
        reserved: ['_inlinedQrl'],
        nth_identifier: identifiersWithoutDollar(),
        properties: mangleProperties,
      }
    : false;

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

  const prodNames = coreFileNames('.prod');
  const prodFiles = [];
  for (const chunk of prod.chunks) {
    const isCoreChunk = chunk.fileName === prodNames.core || chunk.fileName === prodNames.qrl;
    prodFiles.push({
      fileName: chunk.fileName,
      code: isCoreChunk
        ? await minifyProdChunk(config, chunk.code, chunk.fileName, mangle, nameCache)
        : await mangleProdEntryProperties(config, chunk.code, mangleProperties, nameCache),
    });
  }
  await writeCoreChunks(config, prodFiles);
}

/**
 * The server and serializer only get `$props$` mangled, so apps can still define their
 * `globalThis.qDev` checks.
 */
async function mangleProdEntryProperties(
  config: BuildConfig,
  code: string,
  properties: ManglePropertiesOptions | undefined,
  nameCache: object
) {
  if (!properties) {
    return code;
  }
  const result = await minify(code, {
    nameCache,
    compress: false,
    mangle: { properties },
    format: {
      beautify: true,
      braces: true,
      comments: 'all',
      preserve_annotations: true,
      ecma: 2020,
      preamble: getBanner('@qwik.dev/core', config.distVersion),
    },
  });
  return result.code! + '\n';
}

/**
 * Inlines only `isDev = false` from `@qwik.dev/core/build` into core's chunks, while keeping
 * `isServer` and `isBrowser` as imports (the build is universal — it must work on both server and
 * browser). The server and serializer keep importing `isDev`, so the app's build decides it.
 */
function inlineProdIsDev(): RolldownPlugin {
  const VIRTUAL_BUILD = '\0prod-build';
  const devNames = coreFileNames('');
  const keepsAppIsDev = (importer: string | undefined) =>
    importer === VIRTUAL_BUILD ||
    importer?.endsWith(devNames.server) ||
    importer?.endsWith(devNames.serializer);
  return {
    name: 'inlineProdIsDev',
    resolveId(id, importer) {
      if (id === '@qwik.dev/core/build') {
        return keepsAppIsDev(importer) ? { id, external: true } : VIRTUAL_BUILD;
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

async function submoduleCoreDev(config: BuildConfig, server: ServerSourceOptions) {
  // Every variant gets its own chunks: they import each other by file name.
  for (const variant of ['', '.prod', '.min'] as const) {
    const { chunks, sourcemaps } = await bundleCoreSources(
      config,
      config.srcQwikDir,
      'ts',
      variant,
      server
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
