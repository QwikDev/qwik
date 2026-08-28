import type { QwikBundle, QwikBundleGraph, QwikManifest } from '../types';

const minimumSpeed = 300; // kbps
// size that takes 0.5 seconds to download at minimumSpeed
const slowSize = 0.5 / ((minimumSpeed * 1024) / 8);

// Dynamic-import fan-out up to this count is not damped (a component with a few lazy children is
// likely to need them). Above it, each edge's probability is scaled by FANOUT_FREE / fanOut, so a
// large registry of mutually-exclusive lazy imports doesn't preload every entry.
const FANOUT_FREE = 5;

/**
 * A function that returns a map of bundle names to their dependencies.
 *
 * @public
 */
export type BundleGraphAdder = (
  manifest: QwikManifest
) => Record<string, { imports?: string[]; dynamicImports?: string[] }>;

const getSymbolHash = (symbolName: string) => {
  const index = symbolName.lastIndexOf('_');
  if (index > -1) {
    return symbolName.slice(index + 1);
  }
  return symbolName;
};

/**
 * This creates a compact array of dependencies for each bundle. It also contains the symbols. The
 * format is:
 *
 * ```
 *   [...(bundleName: string, ...directImports: index[], ...dynamicImports: [-1, ...index[]] | [])]
 * ```
 *
 * (index is the position of the dependency in the bundleGraph array)
 *
 * This format allows any string to denote a set of dependencies, which is useful for symbols and
 * SPA paths.
 */
export function convertManifestToBundleGraph(
  manifest: QwikManifest,
  bundleGraphAdders?: Set<BundleGraphAdder>
): QwikBundleGraph {
  const bundleGraph: QwikBundleGraph = [];
  if (!manifest.bundles) {
    return [];
  }
  // All known chunks and symbols
  const graph = { ...manifest.bundles };
  for (const [symbol, bundleName] of Object.entries(manifest.mapping)) {
    if (symbol.startsWith('_') && symbol.length < 10) {
      // internal QRLs are not included in the bundle graph
      continue;
    }
    const hash = getSymbolHash(symbol);
    if (hash) {
      /**
       * We use dynamic imports so that we will get probabilities for the bundle when preloading the
       * symbol. We still confirm load at 100% probability with the bundle name.
       */
      graph[hash] = { dynamicImports: [bundleName] } as QwikBundle;
    }
  }
  // Routes etc
  if (bundleGraphAdders) {
    const combined = { ...manifest, bundles: graph };
    for (const adder of bundleGraphAdders) {
      const result = adder(combined);
      if (result) {
        Object.assign(graph, result);
      }
    }
  }

  // Filter out external and non-segment dynamic imports
  for (const bundleName of Object.keys(graph)) {
    const bundle = graph[bundleName];
    const imports = bundle.imports?.filter((dep) => graph[dep]) || [];
    const dynamicImports =
      bundle.dynamicImports?.filter(
        // we only want to include dynamic imports that belong to the app
        // e.g. not all languages supported by shiki
        (dep) =>
          graph[dep] &&
          // either there are qrls
          (graph[dep].symbols ||
            // or it's a dynamic import from the app source
            graph[dep].origins?.some((o) => !o.includes('node_modules')))
      ) || [];

    /**
     * Overwrite so we don't mutate the given objects. Be sure to copy all properties we use during
     * and after the conversion.
     */
    graph[bundleName] = {
      ...bundle,
      imports,
      dynamicImports,
    };
  }

  // Remove unused bundles
  const notUsed = new Set(Object.keys(graph));
  for (const bundleName of Object.keys(graph)) {
    for (const dep of graph[bundleName].imports!) {
      notUsed.delete(dep);
    }
    for (const dep of graph[bundleName].dynamicImports!) {
      notUsed.delete(dep);
    }
  }
  for (const bundleName of notUsed) {
    const bundle = graph[bundleName];
    if (!bundle.imports?.length && !bundle.dynamicImports?.length) {
      delete graph[bundleName];
    }
  }

  const names = Object.keys(graph);
  const map = new Map<string, { index: number; deps: Set<string> }>();
  const reduceDeps = createTransitiveReducer(graph);

  /**
   * First pass to collect minimal dependency lists and allocate space for dependencies. Minimal
   * means that if one of your dependencies depends on another of your dependencies, there's no need
   * to add that other dependency.
   */
  for (const bundleName of names) {
    const bundle = graph[bundleName];
    // external dependencies are not included in `graph`
    const deps = new Set(bundle.imports!);
    reduceDeps(deps, bundleName);
    const dynDeps = new Set(bundle.dynamicImports!);
    reduceDeps(dynDeps, bundleName);
    // Fan-out damping: a bundle that dynamically imports many alternatives (a component
    // registry, a router that can load any of N pages, a `switch` over lazy imports) is
    // unlikely to need all of them for the current page — typically only one branch is taken.
    // Scale each edge's probability down as the fan-out grows so these don't all get preloaded,
    // while low fan-out (a modal, a couple of lazy children) is left untouched.
    const fanOut = dynDeps.size;
    const fanOutFactor = Math.min(1, FANOUT_FREE / fanOut);
    const depProbability = new Map<string, number>();
    for (const depName of dynDeps) {
      const dep = graph[depName];

      // Calculate the probability of the dependency
      // Start with a 50% chance
      let probability = 0.5;
      // Add a 8% chance for each interactivity point (max 40%)
      probability += (dep.interactivity || 0) * 0.08;

      // If the dependency has a segment from the same parent, it's more likely to be loaded
      if (bundle.origins && dep.origins) {
        for (const origin of bundle.origins) {
          if (dep.origins.some((o) => o.startsWith(origin))) {
            // Add a 25% chance
            probability += 0.25;
            break;
          }
        }
      }

      // If the dependency is a likely big import graph, it should be loaded earlier so it doesn't get blocked by smaller files, but when unlikely it should be loaded later so it doesn't block other files
      if (dep.total > slowSize) {
        probability += probability > 0.5 ? 0.02 : -0.02;
      }
      // OTOH, if the dependency is small, load it sooner since it won't block much
      if (dep.total < 1000) {
        probability += 0.15;
      }

      depProbability.set(depName, Math.min(probability * fanOutFactor, 0.99));
    }

    if (dynDeps.size > 0) {
      const sorted = Array.from(dynDeps).sort(
        (a, b) => depProbability.get(b)! - depProbability.get(a)!
      );
      let lastProbability = -1;
      // We rely on the Set keeping the items in order, everything after this is dynamic
      for (const depName of sorted) {
        if (depProbability.get(depName)! !== lastProbability) {
          lastProbability = depProbability.get(depName)!;
          // Serialised at 1/100 granularity (keep in sync with the decoder in
          // core/preloader/bundle-graph.ts). Finer than 1/10 so that fan-out-damped edges keep
          // a distinct low probability instead of rounding up to 0.1 (which compounds across a
          // propagation chain). Floor the magnitude at 1 so a tiny probability never rounds to 0,
          // which the decoder would read back as an index rather than a probability marker.
          deps.add(-Math.max(1, Math.round(lastProbability * 100)) as any as string);
        }
        deps.add(depName);
      }
    }
    const index = bundleGraph.length;
    bundleGraph.push(bundleName);
    // allocate space for the dependency indices
    for (let i = 0; i < deps.size; i++) {
      bundleGraph.push(null!);
    }
    map.set(bundleName, { index, deps });
  }

  // Second pass to set the dependency indices
  for (const bundleName of names) {
    const bundle = map.get(bundleName)!;
    // eslint-disable-next-line prefer-const
    let { index, deps } = bundle;
    index++;
    for (const depName of deps) {
      if (typeof depName === 'number') {
        // negative number means dynamic import
        bundleGraph[index++] = depName;
        continue;
      }
      const dep = map.get(depName)!;
      const depIndex = dep.index;
      bundleGraph[index++] = depIndex;
    }
  }

  return bundleGraph;
}

/** Builds a reachability-preserving transitive reducer over the static-import graph. */
function createTransitiveReducer(graph: Record<string, QwikBundle>) {
  const { componentOf, successors } = condenseImportGraph(graph);

  const reachCache: (Set<number> | undefined)[] = new Array(successors.length);
  const reachOf = (component: number): Set<number> => {
    const cached = reachCache[component];
    if (cached) {
      return cached;
    }
    const reach = new Set<number>();
    reachCache[component] = reach;
    for (const next of successors[component]) {
      reach.add(next);
      for (const beyond of reachOf(next)) {
        reach.add(beyond);
      }
    }
    return reach;
  };

  return (ownerDeps: Set<string>, ownerBundle: string) => {
    const owner = componentOf.get(ownerBundle)!;
    const targetComponents = new Set<number>();
    for (const dep of ownerDeps) {
      const component = componentOf.get(dep)!;
      if (component !== owner) {
        targetComponents.add(component);
      }
    }
    for (const dep of [...ownerDeps]) {
      const component = componentOf.get(dep)!;
      if (component === owner) {
        continue;
      }
      for (const sibling of targetComponents) {
        if (sibling !== component && reachOf(sibling).has(component)) {
          ownerDeps.delete(dep);
          break;
        }
      }
    }
  };
}

export interface CondensedGraph {
  componentOf: Map<string, number>;
  components: string[][];
  successors: Set<number>[];
}

export function condenseImportGraph(graph: Record<string, QwikBundle>): CondensedGraph {
  const componentOf = new Map<string, number>();
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const strongConnect = (node: string) => {
    index.set(node, counter);
    lowLink.set(node, counter);
    counter++;
    stack.push(node);
    onStack.add(node);
    for (const next of graph[node].imports || []) {
      if (!graph[next]) {
        continue;
      }
      if (!index.has(next)) {
        strongConnect(next);
        lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(next)!));
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node)!, index.get(next)!));
      }
    }
    if (lowLink.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        componentOf.set(member, components.length);
        component.push(member);
      } while (member !== node);
      components.push(component);
    }
  };

  for (const node of Object.keys(graph)) {
    if (!index.has(node)) {
      strongConnect(node);
    }
  }

  const successors: Set<number>[] = Array.from({ length: components.length }, () => new Set());
  for (const node of Object.keys(graph)) {
    const from = componentOf.get(node)!;
    for (const next of graph[node].imports || []) {
      const to = componentOf.get(next);
      if (to !== undefined && to !== from) {
        successors[from].add(to);
      }
    }
  }

  return { componentOf, components, successors };
}
