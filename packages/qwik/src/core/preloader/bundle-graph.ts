/* eslint-disable no-console */
import { isBrowser } from '@builder.io/qwik/build';
import {
  config,
  doc,
  maxSignificantInverseProbabilityStr,
  maxSimultaneousPreloadsStr,
} from './constants';
import { adjustProbabilities, bundles, log, trigger } from './queue';
import type { BundleGraph, BundleImport, ImportProbability } from './types';
import { BundleImportState } from './types';

export let base: string | undefined;
export let graph: BundleGraph;

const makeBundle = (name: string, deps?: ImportProbability[]) => {
  const url = name.endsWith('.js')
    ? doc
      ? new URL(`${base}${name}`, doc.baseURI).toString()
      : name
    : null;
  return {
    $name$: name,
    $url$: url,
    $state$: url ? BundleImportState.None : BundleImportState.Alias,
    $deps$: deps,
    $inverseProbability$: 1,
    $createdTs$: Date.now(),
    $waitedMs$: 0,
    $loadedMs$: 0,
  };
};

export const parseBundleGraph = (serialized: (string | number)[]) => {
  const graph: BundleGraph = new Map();
  let i = 0;
  while (i < serialized.length) {
    const name = serialized[i++] as string;
    const deps: ImportProbability[] = [];
    let idx: number | string;
    let probability = 1;
    while (((idx = serialized[i]), typeof idx === 'number')) {
      if (idx < 0) {
        probability = -idx / 10;
      } else {
        deps.push({ $name$: serialized[idx] as string, $probability$: probability, $factor$: 1 });
      }
      i++;
    }
    graph.set(name, deps);
  }
  return graph;
};

export const getBundle = (name: string) => {
  let bundle = bundles.get(name);
  console.log('bundle :', bundle);
  if (!bundle) {
    let deps: ImportProbability[] | undefined;
    if (graph) {
      deps = graph.get(name);
      console.log('deps :', deps);
      if (!deps) {
        return;
      }
      if (!deps.length) {
        deps = undefined;
      }
    }
    bundle = makeBundle(name, deps);
    bundles.set(name, bundle);
  }
  return bundle;
};

/** Used in browser */
export const loadBundleGraph = (
  basePath: string,
  manifestHash: string,
  opts?: {
    /** Enable logging */
    debug?: boolean;
    /** Maximum number of simultaneous preload links */
    P?: number;
    /** Minimum probability for a bundle to be added to the preload queue */
    Q?: number;
  }
) => {
  if (opts) {
    if ('d' in opts) {
      config.DEBUG = !!opts.d;
    }
    if ('P' in opts) {
      config[maxSimultaneousPreloadsStr] = opts['P'] as number;
    }
    if ('Q' in opts) {
      config[maxSignificantInverseProbabilityStr] = 1 - (opts['Q'] as number);
    }
  }
  if (!isBrowser || basePath == null) {
    return;
  }
  base = basePath;

  if (manifestHash) {
    import(/* @vite-ignore */ `${basePath}q-bundle-graph-${manifestHash}.js`)
      .then((m) => {
        graph = parseBundleGraph(m.B);
        const toAdjust: [BundleImport, number][] = [];
        for (const [name, deps] of graph.entries()) {
          const bundle = getBundle(name)!;
          bundle.$deps$ = deps;
          if (bundle.$inverseProbability$ < 1) {
            toAdjust.push([bundle, bundle.$inverseProbability$]);
            bundle.$inverseProbability$ = 1;
          }
        }
        config.DEBUG &&
          log(`parseBundleGraph got ${graph.size} bundles, adjusting ${toAdjust.length}`);
        for (const [bundle, inverseProbability] of toAdjust) {
          adjustProbabilities(bundle, inverseProbability);
        }
        trigger();
      })
      .catch(console.warn);
  }
};

/** Used during SSR */
export const initPreloader = (
  serializedBundleGraph?: (string | number)[],
  opts?: {
    debug?: boolean;
    maxSignificantInverseProbability?: number;
  }
) => {
  if (opts) {
    if ('debug' in opts) {
      config.DEBUG = !!opts.debug;
    }
    if (maxSignificantInverseProbabilityStr in opts) {
      config[maxSignificantInverseProbabilityStr] = opts[
        maxSignificantInverseProbabilityStr
      ] as number;
    }
  }
  if (base != null || !serializedBundleGraph) {
    return;
  }
  base = '';
  graph = parseBundleGraph(serializedBundleGraph);
};
