import { createMacroTask } from '../shared/platform/next-tick';
import { config, isBrowser, isJSRegex, yieldInterval } from './constants';
import { bundles, HIGHEST_KIND, nextTriggerMacroTask, replayBundle } from './queue';
import type { BundleDep, BundleGraph } from './types';
import { BundleImportState_Alias, BundleImportState_None } from './types';

// Note, making these singletons pulls in too much code and they are ok being module-scoped
export let base: string | undefined;
export let graph: BundleGraph;
export let isWaitingForGraph = false;

const makeBundle = (name: string, deps?: BundleDep[], kind = 0) => {
  return {
    $name$: name,
    $state$: isJSRegex.test(name) ? BundleImportState_None : BundleImportState_Alias,
    $deps$: deps,
    $inverseProbability$: 1,
    $kind$: kind,
    $rank$: 0,
  };
};

export const parseBundleGraph = (serialized: (string | number)[]) => {
  const graph: BundleGraph = new Map();
  let i = 0;
  while (i < serialized.length) {
    const name = serialized[i++] as string;
    const deps: BundleDep[] = [];
    let idx: number | string;
    let kind = 0;
    let isStatic = true;
    while (((idx = serialized[i]), typeof idx === 'number')) {
      if (idx >= 0) {
        deps.push({ $name$: serialized[idx] as string, $isStatic$: isStatic });
      } else if (isStatic && !deps.length && idx < -1 && idx > -5) {
        kind = -idx - 1;
      } else {
        isStatic = false;
      }
      i++;
    }
    graph.set(name, { $deps$: deps, $kind$: kind });
  }
  return graph;
};

export const getBundle = (name: string) => {
  let bundle = bundles.get(name);
  if (!bundle) {
    let deps: BundleDep[] | undefined;
    let kind: number | undefined;
    if (graph) {
      const entry = graph.get(name);
      if (!entry) {
        return;
      }
      kind = entry.$kind$;
      if (entry.$deps$.length) {
        deps = entry.$deps$;
      }
    }
    bundle = makeBundle(name, deps, kind);
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
    isWaitingForGraph = true;
    serializedResponse
      .then((r) => r.text())
      .then((text) => {
        graph = parseBundleGraph(JSON.parse(text));
        // Snapshot hints before dependency propagation adds new bundle records.
        const pendingBundles = Array.from(bundles.values());
        for (let i = 0; i < pendingBundles.length; i++) {
          const bundle = pendingBundles[i];
          const entry = graph.get(bundle.$name$);
          if (entry) {
            bundle.$kind$ = entry.$kind$;
            bundle.$rank$ = HIGHEST_KIND;
          }
        }
        let nextIndex = 0;
        const replayPendingBundles = () => {
          const deadline = performance.now() + yieldInterval;
          while (nextIndex < pendingBundles.length) {
            const bundle = pendingBundles[nextIndex++];
            const entry = graph.get(bundle.$name$);
            if (entry) {
              bundle.$deps$ = entry.$deps$;
              if (bundle.$inverseProbability$ < 1) {
                replayBundle(bundle);
              }
            }
            if (nextIndex < pendingBundles.length && performance.now() >= deadline) {
              resumeReplay();
              return;
            }
          }
          resumeReplay.$destroy$?.();
          isWaitingForGraph = false;
          nextTriggerMacroTask();
        };
        const resumeReplay = createMacroTask(replayPendingBundles);
        replayPendingBundles();
      })
      .catch((error) => {
        console.warn(error);
        isWaitingForGraph = false;
        nextTriggerMacroTask();
      });
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
