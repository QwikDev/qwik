import type { OutputBundle } from 'rollup';
import { type NormalizedQwikPluginOptions } from './plugins/plugin';
import type { GlobalInjections, HookAnalysis, Path, QwikBundle, QwikManifest } from './types';

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
    if (a.ctxKind === 'event' && b.ctxKind !== 'event') {
      return -1;
    }
    if (a.ctxKind !== 'event' && b.ctxKind === 'event') {
      return 1;
    }

    if (a.ctxKind === 'event' && b.ctxKind === 'event') {
      // both are an event
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

export function generateManifestFromBundles(
  path: Path,
  hooks: HookAnalysis[],
  injections: GlobalInjections[],
  outputBundles: OutputBundle,
  opts: NormalizedQwikPluginOptions
) {
  const manifest: QwikManifest = {
    manifestHash: '',
    symbols: {},
    mapping: {},
    bundles: {},
    injections,
    version: '1',
    options: {
      target: opts.target,
      buildMode: opts.buildMode,
      entryStrategy: opts.entryStrategy,
    },
  };

  // We need to find our QRL exports
  const qrlNames = new Set([...hooks.map((h) => h.name)]);
  for (const [fileName, outputBundle] of Object.entries(outputBundles)) {
    if (outputBundle.type !== 'chunk') {
      continue;
    }
    const bundleFileName = path.basename(fileName);

    const buildDirName = path.dirname(outputBundle.fileName);
    const bundle: QwikBundle = {
      size: outputBundle.code.length,
    };

    for (const symbol of outputBundle.exports) {
      if (qrlNames.has(symbol)) {
        // When not minifying we see both the entry and the hook file
        // The hook file will only have 1 export, we want the entry
        if (!manifest.mapping[symbol] || outputBundle.exports.length !== 1) {
          manifest.mapping[symbol] = bundleFileName;
        }
      }
    }

    const bundleImports = outputBundle.imports
      .filter((i) => path.dirname(i) === buildDirName)
      .map((i) => path.relative(buildDirName, i));
    if (bundleImports.length > 0) {
      bundle.imports = bundleImports;
    }

    const bundleDynamicImports = outputBundle.dynamicImports
      .filter((i) => path.dirname(i) === buildDirName)
      .map((i) => path.relative(buildDirName, i));
    if (bundleDynamicImports.length > 0) {
      bundle.dynamicImports = bundleDynamicImports;
    }

    // Rollup doesn't provide the moduleIds in the outputBundle but Vite does
    const ids = outputBundle.moduleIds || Object.keys(outputBundle.modules);
    const modulePaths = ids.filter((m) => !m.startsWith(`\u0000`));
    if (modulePaths.length > 0) {
      bundle.origins = modulePaths;
    }

    manifest.bundles[bundleFileName] = bundle;
  }

  for (const hook of hooks) {
    const symbol = hook.name;
    const bundle = manifest.mapping[symbol];
    if (!bundle) {
      console.error(`Unable to find bundle for hook: ${hook.name}`, manifest);
      throw new Error(`Unable to find bundle for hook: ${hook.hash}`);
    }
    (manifest.bundles[bundle].symbols ||= []).push(symbol);
    manifest.symbols[symbol] = {
      origin: hook.origin,
      displayName: hook.displayName,
      canonicalFilename: hook.canonicalFilename,
      hash: hook.hash,
      ctxKind: hook.ctxKind,
      ctxName: hook.ctxName,
      captures: hook.captures,
      parent: hook.parent,
      loc: hook.loc,
    };
  }

  return updateSortAndPriorities(manifest);
}
