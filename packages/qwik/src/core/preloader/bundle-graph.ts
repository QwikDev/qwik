import { createMacroTask } from '../shared/platform/next-tick';
import { config, isJSRegex, isRunningOnBrowser, yieldInterval } from './constants';
import { adjustProbabilities, bundles, shouldResetFactor, nextTriggerMacroTask } from './queue';
import type { BundleGraph, BundleImport, ImportProbability } from './types';
import { BundleImportState_None, BundleImportState_Alias } from './types';

export let base: string | undefined;
export let graph: BundleGraph;

const makeBundle = (name: string, deps?: ImportProbability[]) => {
  return {
    $name$: name,
    $state$: isJSRegex.test(name) ? BundleImportState_None : BundleImportState_Alias,
    $deps$: shouldResetFactor ? deps?.map((d) => ({ ...d, $factor$: 1 })) : deps,
    $inverseProbability$: 1,
    $createdTs$: performance.now(),
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
  if (!isRunningOnBrowser || basePath == null) {
    return;
  }
  base = basePath;

  if (serializedResponse) {
    serializedResponse
      .then((r) => r.text())
      .then((text) => {
        graph = parseBundleGraph(JSON.parse(text));
        const toAdjust: [BundleImport, number][] = [];
        for (const [name, deps] of graph.entries()) {
          const bundle = getBundle(name)!;
          bundle.$deps$ = deps;
          if (bundle.$inverseProbability$ < 1) {
            toAdjust.push([bundle, bundle.$inverseProbability$]);
            bundle.$inverseProbability$ = 1;
          }
        }
        if (!toAdjust.length) {
          nextTriggerMacroTask();
          return;
        }
        let i = 0;
        const continueAdjust = createMacroTask(() => {
          const deadline = performance.now() + yieldInterval;
          while (i < toAdjust.length) {
            const [bundle, inverseProbability] = toAdjust[i];
            i++;
            adjustProbabilities(bundle, inverseProbability);
            if (i < toAdjust.length && performance.now() >= deadline) {
              continueAdjust();
              return;
            }
          }
          nextTriggerMacroTask();
        });
        continueAdjust();
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
