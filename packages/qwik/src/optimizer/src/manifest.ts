import type { Rollup } from 'vite';
import { type NormalizedQwikPluginOptions } from './plugins/plugin';
import type { GlobalInjections, Path, QwikBundle, QwikManifest, SegmentAnalysis } from './types';

// The handlers that are exported by the core package
// See handlers.mjs
const extraSymbols = new Set(['_chk', '_run', '_task', '_val']);

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

const getBundleInteractivity = (bundle: QwikBundle, manifest: QwikManifest) => {
  let maxScore = 0;
  if (bundle.symbols) {
    for (const symbolName of bundle.symbols) {
      let score = 1;
      const symbol = manifest.symbols[symbolName];
      if (symbol) {
        if (symbol.ctxKind === 'function') {
          if (/(component|useStyles|useStylesScoped)/i.test(symbol.ctxName)) {
            score += 1;
          } else if (/(useComputed|useTask|useVisibleTask|useOn)/i.test(symbol.ctxName)) {
            score += 2;
          }
        } else {
          score += 1;
          if (/(click|mouse|pointer|touch|key|scroll|gesture|wheel)/i.test(symbol.ctxName)) {
            score += 3;
          }
        }
      }
      maxScore = Math.max(maxScore, score);
    }
  }
  return maxScore;
};

/**
 * Computes the total size of each bundle based on its dependencies. Written by ChatGPT ;) - it's
 * harder than you think to total nodes in a directed cyclic graph
 */
export function computeTotals(graph: QwikManifest['bundles']): void {
  // 1) Prepare Tarjan's structures
  let index = 0;
  const stack: string[] = [];
  const sccList: string[][] = [];

  // Maps for Tarjan
  const idx = new Map<string, number>(); // node -> index
  const low = new Map<string, number>(); // node -> low-link
  const onStack = new Set<string>();

  function strongConnect(v: string) {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    // Explore children
    const children = graph[v].imports || [];
    for (const w of children) {
      if (!idx.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }

    // If v is a root node, pop stack to form an SCC
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let x: string;
      do {
        x = stack.pop()!;
        onStack.delete(x);
        comp.push(x);
      } while (x !== v);
      sccList.push(comp);
    }
  }

  // Run Tarjan over all nodes
  for (const v of Object.keys(graph)) {
    if (!idx.has(v)) {
      strongConnect(v);
    }
  }

  // 2) Build DAG of SCCs
  // sccIndex: which SCC a node belongs to
  const sccIndex = new Map<string, number>();
  sccList.forEach((comp, i) => {
    for (const v of comp) {
      sccIndex.set(v, i);
    }
  });

  // Create adjacency for the SCC graph
  const sccDAG: Set<number>[] = Array.from({ length: sccList.length }, () => new Set());
  for (const v of Object.keys(graph)) {
    const i = sccIndex.get(v)!;
    for (const w of graph[v].imports || []) {
      const j = sccIndex.get(w)!;
      if (i !== j) {
        sccDAG[i].add(j);
      }
    }
  }

  // 3) Topological sort the SCC DAG
  const visited = new Set<number>();
  const order: number[] = [];

  function dfsSCC(u: number) {
    visited.add(u);
    for (const v of sccDAG[u]) {
      if (!visited.has(v)) {
        dfsSCC(v);
      }
    }
    order.push(u);
  }

  for (let i = 0; i < sccList.length; i++) {
    if (!visited.has(i)) {
      dfsSCC(i);
    }
  }
  order.reverse(); // Now it's a topological order

  // 4) Compute totals from bottom to top
  const sccTotals = new Array<number>(sccList.length).fill(0);

  // First compute the sum of 'size' in each SCC
  for (let i = 0; i < sccList.length; i++) {
    let sumSize = 0;
    for (const nodeId of sccList[i]) {
      sumSize += graph[nodeId].size;
    }
    sccTotals[i] = sumSize;
  }

  // Then add child totals in topological order (reversed)
  for (let k = order.length - 1; k >= 0; k--) {
    const sccId = order[k];
    let total = sccTotals[sccId];
    for (const child of sccDAG[sccId]) {
      total += sccTotals[child];
    }
    sccTotals[sccId] = total;
  }

  // 5) Assign computed totals back to each node in the original graph
  for (let i = 0; i < sccList.length; i++) {
    const total = sccTotals[i];
    for (const nodeId of sccList[i]) {
      graph[nodeId].total = total;
    }
  }
}

const preloaderRegex = /[/\\](core|qwik)[/\\]dist[/\\]preloader\.(|c|m)js$/;
const coreRegex = /[/\\](core|qwik)[/\\]dist[/\\]core(\.min|\.prod)?\.(|c|m)js$/;
const qwikLoaderRegex = /[/\\](core|qwik)[/\\](dist[/\\])?qwikloader(\.debug)?\.[^/]*js$/;
const handlersRegex = /[/\\](core|qwik)[/\\]handlers\.(|c|m)js$/;
/**
 * Generates the Qwik build manifest from the Rollup output bundles. It also figures out the bundle
 * files for the preloader, core, qwikloader and handlers. This information is used during SSR.
 */
export function generateManifestFromBundles(
  path: Path,
  segments: SegmentAnalysis[],
  injections: GlobalInjections[],
  outputBundles: Rollup.OutputBundle,
  opts: NormalizedQwikPluginOptions,
  debug: (...args: any[]) => void,
  canonPath: (p: string) => string
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

  let qwikHandlersName: string | undefined;
  // We need to find our QRL exports
  const qrlNames = new Set(segments.map((h) => h.name));
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
      // Tree shaking might remove imports
      .filter((i) => outputBundle.code.includes(path.basename(i)))
      .map((i) => getBundleName(i))
      .filter(Boolean) as string[];
    if (bundleImports.length > 0) {
      bundle.imports = bundleImports;
    }

    const bundleDynamicImports = outputBundle.dynamicImports
      .filter((i) => outputBundle.code.includes(path.basename(i)))
      .map((i) => getBundleName(i))
      .filter(Boolean) as string[];
    if (bundleDynamicImports.length > 0) {
      bundle.dynamicImports = bundleDynamicImports;
    }

    // It can happen that our modules end up in facades, not nice but needs handling
    if (outputBundle.facadeModuleId) {
      if (preloaderRegex.test(outputBundle.facadeModuleId)) {
        manifest.preloader = bundleFileName;
      } else if (coreRegex.test(outputBundle.facadeModuleId)) {
        manifest.core = bundleFileName;
      } else if (qwikLoaderRegex.test(outputBundle.facadeModuleId)) {
        manifest.qwikLoader = bundleFileName;
      } else if (handlersRegex.test(outputBundle.facadeModuleId)) {
        qwikHandlersName = bundleFileName;
      }
    }
    // Rollup doesn't provide the moduleIds in the outputBundle but Vite does
    const ids = outputBundle.moduleIds || Object.keys(outputBundle.modules);
    const modulePaths = ids
      .filter((m) => !m.startsWith(`\u0000`))
      .map((m) => path.relative(opts.rootDir, m));
    if (modulePaths.length > 0) {
      bundle.origins = modulePaths;
      // keep these if statements separate so that weird bundling still works
      if (!manifest.preloader && modulePaths.some((m) => preloaderRegex.test(m))) {
        manifest.preloader = bundleFileName;
      }
      if (!manifest.core && modulePaths.some((m) => coreRegex.test(m))) {
        manifest.core = bundleFileName;
      }
      if (!manifest.qwikLoader && modulePaths.some((m) => qwikLoaderRegex.test(m))) {
        manifest.qwikLoader = bundleFileName;
      }
      if (!qwikHandlersName && modulePaths.some((m) => handlersRegex.test(m))) {
        qwikHandlersName = bundleFileName;
      }
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

  for (const bundle of Object.values(manifest.bundles)) {
    const interactivityScore = getBundleInteractivity(bundle, manifest);
    bundle.interactivity = interactivityScore;
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
