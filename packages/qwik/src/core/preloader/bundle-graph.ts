import { config, isBrowser, isJSRegex } from './constants';
import { adjustProbabilities, bundles, nextTriggerMacroTask } from './queue';
import type { BundleGraph, ImportProbability } from './types';
import { BundleImportState_Alias, BundleImportState_None } from './types';

// Note, making these singletons pulls in too much code and they are ok being module-scoped
export let base: string | undefined;
export let graph: BundleGraph;

const makeBundle = (name: string, deps?: ImportProbability[]) => {
  return {
    $name$: name,
    $state$: isJSRegex.test(name) ? BundleImportState_None : BundleImportState_Alias,
    $deps$: deps,
    $inverseProbability$: 1,
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
        deps.push({
          $name$: serialized[idx] as string,
          $importProbability$: probability,
          $factor$: 1,
        });
      }
      i++;
    }
    graph.set(name, deps);
  }
  return graph;
};

export const getBundle = (name: string) => {
  let bundle = bundles.get(name);
  if (!bundle) {
    let deps: ImportProbability[] | undefined;
    if (graph) {
      deps = graph.get(name);
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
  serializedResponse?: ReturnType<typeof fetch>,
  opts?: {
    /** Maximum number of simultaneous preload links */
    P?: number;
  }
) => {
  if (opts) {
    if ('P' in opts) {
      config.$maxIdlePreloads$ = opts['P'] as number;
    }
  }
  if (!isBrowser || basePath == null) {
    return;
  }
  base = basePath;

  if (serializedResponse) {
    serializedResponse
      .then((r) => r.text())
      .then((text) => {
        graph = parseBundleGraph(JSON.parse(text));
        for (const [name, bundle] of bundles) {
          const deps = graph.get(name);
          if (deps) {
            bundle.$deps$ = deps;
            if (bundle.$inverseProbability$ < 1) {
              const probability = bundle.$inverseProbability$;
              bundle.$inverseProbability$ = 1;
              adjustProbabilities(bundle, probability);
            }
          }
        }
        nextTriggerMacroTask();
      })
      .catch(console.warn);
  }
};

/** Used during SSR */
export const initPreloader = (serializedBundleGraph?: (string | number)[]) => {
  if (base != null || !serializedBundleGraph) {
    return;
  }
  base = '';
  graph = parseBundleGraph(serializedBundleGraph);
};
