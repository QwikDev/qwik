import type { Rolldown } from 'vite';
import { type NormalizedQwikPluginOptions } from './plugins/plugin';
import { condenseImportGraph, createReachability } from './plugins/bundle-graph';
import type { GlobalInjections, Path, QwikBundle, QwikManifest, SegmentAnalysis } from './types';

// The handlers that are exported by the core package
// See handlers.mjs
const extraSymbols = new Set([
  '_chk',
  '_rsc',
  '_res',
  '_run',
  '_task',
  '_val',
  // Each
  '_eaC',
  '_eaT',
  // Show
  '_shC',
  '_shT',
  // Pending
  '_peC',
  '_peT',
  // Reveal
  '_reR',
  '_reC',
  '_reT',
  // Catch
  '_caC',
  '_caR',
]);

// This is just the initial prioritization of the symbols and entries
// at build time so there's less work during each SSR. However, SSR should
// still further optimize the priorities depending on the user/document.
// This also helps ensure a stable q-manifest.json file.

function prioritizeSymbolNames(manifest: QwikManifest) {
  const symbols = manifest.symbols;

  return Object.keys(symbols).sort((symbolNameA, symbolNameB) => {
    const a = symbols[symbolNameA];
    const b = symbols[symbolNameB];

    // events should sort highest
    if (a.ctxKind === 'eventHandler' && b.ctxKind !== 'eventHandler') {
      return -1;
    }
    if (a.ctxKind !== 'eventHandler' && b.ctxKind === 'eventHandler') {
      return 1;
    }

    if (a.ctxKind === 'eventHandler' && b.ctxKind === 'eventHandler') {
      // both are an event handler
      const aIndex = EVENT_PRIORITY.indexOf(a.ctxName.toLowerCase());
      const bIndex = EVENT_PRIORITY.indexOf(b.ctxName.toLowerCase());

      if (aIndex > -1 && bIndex > -1) {
        // both symbols have an event with a priority
        if (aIndex < bIndex) {
          return -1;
        }
        if (aIndex > bIndex) {
          return 1;
        }
      } else {
        if (aIndex > -1) {
          // just symbol "a" has an event with a priority
          return -1;
        }
        if (bIndex > -1) {
          // just symbol "b" has an event with a priority
          return 1;
        }
      }
    } else if (a.ctxKind === 'function' && b.ctxKind === 'function') {
      // both are a function
      const aIndex = FUNCTION_PRIORITY.indexOf(a.ctxName.toLowerCase());
      const bIndex = FUNCTION_PRIORITY.indexOf(b.ctxName.toLowerCase());

      if (aIndex > -1 && bIndex > -1) {
        // both symbols have a function with a priority
        if (aIndex < bIndex) {
          return -1;
        }
        if (aIndex > bIndex) {
          return 1;
        }
      } else {
        if (aIndex > -1) {
          // just symbol "a" has a function with a priority
          return -1;
        }
        if (bIndex > -1) {
          // just symbol "b" has a function with a priority
          return 1;
        }
      }
    }

    // symbols with no "parent" have a higher priority
    if (!a.parent && b.parent) {
      return -1;
    }
    if (a.parent && !b.parent) {
      return 1;
    }

    // idk, they're pretty darn similar, just sort by the symbol name
    if (a.hash < b.hash) {
      return -1;
    }
    if (a.hash > b.hash) {
      return 1;
    }
    return 0;
  });
}

// User triggered events should have priority
const EVENT_PRIORITY = /*#__PURE__*/ (() =>
  [
    // Click Events
    'click',
    'dblclick',
    'contextmenu',
    'auxclick',

    // Pointer Events
    'pointerdown',
    'pointerup',
    'pointermove',
    'pointerover',
    'pointerenter',
    'pointerleave',
    'pointerout',
    'pointercancel',
    'gotpointercapture',
    'lostpointercapture',

    // Touch Events
    'touchstart',
    'touchend',
    'touchmove',
    'touchcancel',

    // Mouse Events
    'mousedown',
    'mouseup',
    'mousemove',
    'mouseenter',
    'mouseleave',
    'mouseover',
    'mouseout',
    'wheel',

    // Gesture Events
    'gesturestart',
    'gesturechange',
    'gestureend',

    // Keyboard Events
    'keydown',
    'keyup',
    'keypress',

    // Input/Change Events
    'input',
    'change',
    'search',
    'invalid',
    'beforeinput',
    'select',

    // Focus/Blur Events
    'focusin',
    'focusout',
    'focus',
    'blur',

    // Form Events
    'submit',
    'reset',

    // Scroll Events
    'scroll',
  ].map((n) => `on${n.toLowerCase()}$`))();

const FUNCTION_PRIORITY = /*#__PURE__*/ (() =>
  ['useTask$', 'useVisibleTask$', 'component$', 'useStyles$', 'useStylesScoped$'].map((n) =>
    n.toLowerCase()
  ))();

function sortBundleNames(manifest: QwikManifest) {
  // this doesn't really matter at build time
  // but standardizing the order helps make this file stable
  return Object.keys(manifest.bundles).sort(sortAlphabetical);
}

function updateSortAndPriorities(manifest: QwikManifest) {
  const prioritizedSymbolNames = prioritizeSymbolNames(manifest);
  const prioritizedSymbols: QwikManifest['symbols'] = {};
  const prioritizedMapping: QwikManifest['mapping'] = {};

  for (const symbolName of prioritizedSymbolNames) {
    prioritizedSymbols[symbolName] = manifest.symbols[symbolName];
    prioritizedMapping[symbolName] = manifest.mapping[symbolName];
  }

  const sortedBundleNames = sortBundleNames(manifest);
  const sortedBundles: { [fileName: string]: QwikBundle } = {};
  for (const bundleName of sortedBundleNames) {
    sortedBundles[bundleName] = manifest.bundles[bundleName];
    const bundle = manifest.bundles[bundleName];
    if (Array.isArray(bundle.imports)) {
      bundle.imports.sort(sortAlphabetical);
    }
    if (Array.isArray(bundle.dynamicImports)) {
      bundle.dynamicImports.sort(sortAlphabetical);
    }
    const symbols: string[] = [];
    for (const symbolName of prioritizedSymbolNames) {
      if (bundleName === prioritizedMapping[symbolName]) {
        symbols.push(symbolName);
      }
    }
    if (symbols.length > 0) {
      symbols.sort(sortAlphabetical);
      bundle.symbols = symbols;
    }
  }

  manifest.symbols = prioritizedSymbols;
  manifest.mapping = prioritizedMapping;
  manifest.bundles = sortedBundles;

  return manifest;
}

function sortAlphabetical(a: string, b: string) {
  a = a.toLocaleLowerCase();
  b = b.toLocaleLowerCase();
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function getValidManifest(manifest: QwikManifest | undefined | null) {
  if (
    manifest != null &&
    manifest.mapping != null &&
    typeof manifest.mapping === 'object' &&
    manifest.symbols != null &&
    typeof manifest.symbols === 'object' &&
    manifest.bundles != null &&
    typeof manifest.bundles === 'object'
  ) {
    return manifest;
  }
  return undefined;
}

/** Sets each bundle's `total`: its own size plus every bundle it statically imports, each once. */
export function computeTotals(graph: QwikManifest['bundles']): void {
  const { components, successors } = condenseImportGraph(graph);
  const reachOf = createReachability(successors);
  const componentSizes = components.map((bundleNames) =>
    bundleNames.reduce((sum, bundleName) => sum + graph[bundleName].size, 0)
  );

  components.forEach((bundleNames, component) => {
    let total = componentSizes[component];
    for (const reached of reachOf(component)) {
      total += componentSizes[reached];
    }
    for (const bundleName of bundleNames) {
      graph[bundleName].total = total;
    }
  });
}

/**
 * The files a chunk still loads with `import()`. `dynamicImports` keeps listing imports that
 * tree-shaking removed, such as the `qrl()` of a library component the app doesn't use. A live
 * import is a relative specifier ending in `/<file name>` and a quote, so this never drops one.
 */
function getLiveDynamicImports(outputBundle: Rolldown.OutputChunk) {
  return outputBundle.dynamicImports.filter((file) => {
    const fileName = file.slice(file.lastIndexOf('/') + 1);
    return ['"', "'", '`'].some((quote) => outputBundle.code.includes(`/${fileName}${quote}`));
  });
}

/** The bundles this chunk reaches through `qrl(() => import(segment))`, per rollup module info. */
function getQrlImports(
  outputBundle: Rolldown.OutputChunk,
  bundleFileName: string,
  bundleByModuleId: Map<string, string>,
  getModuleInfo: Rolldown.PluginContext['getModuleInfo'],
  liveImportedIds: Set<string>
) {
  const qrlImports = new Set<string>();
  for (const moduleId of Object.keys(outputBundle.modules)) {
    for (const importedId of getModuleInfo(moduleId)?.dynamicallyImportedIds || []) {
      const importedBundle = bundleByModuleId.get(importedId);
      const isSegment = getModuleInfo(importedId)?.meta.segment;
      if (
        importedBundle &&
        importedBundle !== bundleFileName &&
        isSegment &&
        liveImportedIds.has(importedId)
      ) {
        qrlImports.add(importedBundle);
      }
    }
  }
  return [...qrlImports];
}

/**
 * Generates the Qwik build manifest from the Rollup output bundles. It also figures out the bundle
 * files for the preloader, core, qwikloader and handlers. This information is used during SSR.
 */
export function generateManifestFromBundles(
  path: Path,
  segments: SegmentAnalysis[],
  injections: GlobalInjections[],
  outputBundles: Rolldown.OutputBundle,
  opts: NormalizedQwikPluginOptions,
  debug: (...args: any[]) => void,
  canonPath: (p: string) => string,
  getModuleInfo: Rolldown.PluginContext['getModuleInfo'],
  qwikLoaderFileName?: string,
  preloaderFileName?: string,
  handlersFileName?: string
) {
  // Note that this will be the order of the JSON file
  const manifest: QwikManifest = {
    version: '1',
    manifestHash: '',
    options: {
      target: opts.target,
      buildMode: opts.buildMode,
      // don't copy the insights stuff
      entryStrategy: opts.entryStrategy && { type: opts.entryStrategy.type },
    },
    core: undefined,
    preloader: undefined,
    qwikLoader: undefined,
    bundleGraphAsset: undefined,
    injections,
    mapping: {},
    bundles: {},
    assets: {},
    symbols: {},
    bundleGraph: undefined,
  };

  const getBundleName = (name: string) => {
    const bundle = outputBundles[name];
    if (!bundle) {
      console.warn(`Client manifest generation: skipping external import "${name}"`);
      return;
    }
    return canonPath(bundle.fileName);
  };

  let coreBundleName: string | undefined;
  let preloaderBundleName: string | undefined;
  let qwikHandlersName: string | undefined;

  // A /qwikloader route could shadow a chunk-name match.
  manifest.qwikLoader = qwikLoaderFileName ? canonPath(qwikLoaderFileName) : undefined;

  // Group names come from plugin.ts; qwik-core also holds the handlers.
  for (const outputBundle of Object.values(outputBundles)) {
    const bundleFileName = getBundleName(outputBundle.fileName);
    if (outputBundle.name === 'qwik-core') {
      coreBundleName = bundleFileName;
      qwikHandlersName = bundleFileName;
      manifest.core = bundleFileName;
    }
    if (outputBundle.name === 'qwik-preloader') {
      preloaderBundleName = bundleFileName;
      manifest.preloader = bundleFileName;
    }
  }
  // Facades keep export names; a merged facade leaves no file.
  if (preloaderFileName && preloaderFileName in outputBundles) {
    manifest.preloader = canonPath(preloaderFileName);
  }
  if (handlersFileName && handlersFileName in outputBundles) {
    qwikHandlersName = canonPath(handlersFileName);
  }
  // We need to find our QRL exports
  const qrlNames = new Set(segments.map((h) => h.name));
  const bundleByModuleId = new Map<string, string>();
  for (const outputBundle of Object.values(outputBundles)) {
    if (outputBundle.type === 'chunk') {
      for (const moduleId of Object.keys(outputBundle.modules)) {
        bundleByModuleId.set(moduleId, getBundleName(outputBundle.fileName)!);
      }
    }
  }
  // A re-exported segment's code sits in its group chunk, but only its facade exports the symbol
  for (const outputBundle of Object.values(outputBundles)) {
    const { facadeModuleId } = outputBundle as Rolldown.OutputChunk;
    if (
      outputBundle.type === 'chunk' &&
      facadeModuleId &&
      !(facadeModuleId in outputBundle.modules)
    ) {
      bundleByModuleId.set(facadeModuleId, getBundleName(outputBundle.fileName)!);
    }
  }
  for (const outputBundle of Object.values(outputBundles)) {
    if (outputBundle.type === 'asset') {
      // we don't record map files as assets
      if (!outputBundle.fileName.endsWith('js.map')) {
        manifest.assets![outputBundle.fileName] = {
          name: outputBundle.names[0],
          size: outputBundle.source.length,
        };
      }
      continue;
    }
    const bundleFileName = canonPath(outputBundle.fileName);

    const size = outputBundle.code.length;
    const bundle: QwikBundle = {
      size,
      total: -1,
    };

    for (const symbol of outputBundle.exports) {
      if (qrlNames.has(symbol)) {
        // When not minifying we see both the entry and the segment file
        // The segment file will only have 1 export, we want the entry
        if (!manifest.mapping[symbol] || outputBundle.exports.length !== 1) {
          manifest.mapping[symbol] = bundleFileName;
        }
      }
    }
    const bundleImports = outputBundle.imports
      .map((i) => getBundleName(i))
      .filter((i) => i !== preloaderBundleName && i !== coreBundleName && i !== qwikHandlersName)
      .filter(Boolean) as string[];
    if (bundleImports.length > 0) {
      bundle.imports = bundleImports;
    }
    const liveDynamicImports = getLiveDynamicImports(outputBundle);
    const bundleDynamicImports = liveDynamicImports
      .map((i) => getBundleName(i))
      .filter(Boolean) as string[];
    if (bundleDynamicImports.length > 0) {
      bundle.dynamicImports = bundleDynamicImports;
      // A segment is reached through its own chunk, a facade for it, or the chunk it was merged into
      const liveImportedIds = new Set(
        liveDynamicImports.flatMap((file) => {
          const imported = outputBundles[file];
          return imported?.type === 'chunk'
            ? [imported.facadeModuleId ?? '', ...Object.keys(imported.modules)]
            : [];
        })
      );
      const qrlImports = getQrlImports(
        outputBundle,
        bundleFileName,
        bundleByModuleId,
        getModuleInfo,
        liveImportedIds
      );
      if (qrlImports.length > 0) {
        bundle.qrlImports = qrlImports;
      }
    }

    const moduleIds = outputBundle.moduleIds || Object.keys(outputBundle.modules);
    // A facade holds no module; its origin is the one it exports, for same-parent preload ratings
    const ids =
      moduleIds.length || !outputBundle.facadeModuleId ? moduleIds : [outputBundle.facadeModuleId];
    const modulePaths = ids
      .filter((m) => !m.startsWith(`\u0000`))
      .map((m) => path.relative(opts.rootDir, m));
    if (modulePaths.length > 0) {
      bundle.origins = modulePaths;
    }

    manifest.bundles[bundleFileName] = bundle;
  }

  for (const segment of segments) {
    const symbol = segment.name;
    const bundle = manifest.mapping[symbol];
    if (!bundle) {
      debug(`Note: qrl ${segment.name} is not in the bundle, likely tree shaken`, manifest);
      continue;
    }
    (manifest.bundles[bundle].symbols ||= []).push(symbol);
    manifest.symbols[symbol] = {
      displayName: segment.displayName,
      hash: segment.hash,
      ctxKind: segment.ctxKind,
      ctxName: segment.ctxName,
      captures: segment.captures,
      canonicalFilename: segment.canonicalFilename,
      parent: segment.parent,
      origin: segment.origin,
      loc: segment.loc,
      paramNames: segment.paramNames,
      captureNames: segment.captureNames,
    };
  }
  if (qwikHandlersName) {
    for (const symbol of extraSymbols) {
      manifest.symbols[symbol] = {
        origin: 'Qwik core',
        displayName: symbol,
        canonicalFilename: '',
        hash: symbol,
        ctxKind: 'function',
        ctxName: symbol,
        captures: false,
        parent: null,
        loc: [0, 0],
      };
      manifest.mapping[symbol] = qwikHandlersName;
    }
  } else {
    console.error('Qwik core bundle not found, is Qwik actually used in this project?');
  }

  computeTotals(manifest.bundles);

  // To inspect the bundles, uncomment the following lines
  // import('node:fs').then((fs) =>
  //   fs.writeFileSync(
  //     'output-bundles.json',
  //     JSON.stringify(
  //       {
  //         segments,
  //         bundles: Object.fromEntries(
  //           Object.entries(outputBundles).map(([n, b]) => [
  //             n,
  //             {
  //               ...b,
  //               code: 'code' in b ? b.code.slice(0, 5000) : undefined,
  //               map: 'map' in b ? `<removed>` : undefined,
  //               source: 'source' in b ? `<removed ${b.source.length} bytes>` : undefined,
  //               modules:
  //                 'modules' in b
  //                   ? Object.fromEntries(
  //                       Object.entries(b.modules).map(([k, v]) => [
  //                         k,
  //                         {
  //                           ...v,
  //                           code:
  //                             'code' in v ? `<removed ${v.code?.length || 0} bytes>` : undefined,
  //                         },
  //                       ])
  //                     )
  //                   : undefined,
  //             },
  //           ])
  //         ),
  //       },
  //       null,
  //       '\t'
  //     ).replaceAll(process.cwd(), '')
  //   )
  // );

  return updateSortAndPriorities(manifest);
}
