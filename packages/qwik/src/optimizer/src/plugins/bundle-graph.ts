import { getSymbolHash } from 'packages/qwik/src/core/qrl/qrl-class';
import type { QwikBundle, QwikBundleGraph, QwikManifest } from '../types';

/**
 * A function that returns a map of bundle names to their dependencies.
 *
 * @public
 */
export type BundleGraphAdder = (
  manifest: QwikManifest
) => Record<string, { imports?: string[]; dynamicImports?: string[]; hasSegments?: boolean }>;

const dynamicTag = '<dynamic>';
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
  // All known chunks
  const graph = { ...manifest.bundles };
  // Symbols
  Object.assign(
    graph,
    Object.fromEntries(
      Object.entries(manifest.mapping).map(([symbol, chunkname]) => [
        getSymbolHash(symbol),
        { imports: [chunkname] } as QwikBundle,
      ])
    )
  );
  // Routes etc
  if (bundleGraphAdders) {
    for (const adder of bundleGraphAdders) {
      const result = adder(manifest);
      if (result) {
        Object.assign(graph, result);
      }
    }
  }

  // Filter out external and non-segment dynamic imports
  for (const bundleName of Object.keys(graph)) {
    const bundle = graph[bundleName];
    const imports = bundle.imports?.filter((dep) => graph[dep]) || [];

    // We only include dynamic imports that have qrl segments
    // If the dev wants to include other dynamic imports, they can just make a qrl()
    const dynamicImports = bundle.dynamicImports?.filter((dep) => graph[dep]) || [];

    // Overwrite so we don't mutate
    graph[bundleName] = {
      imports,
      dynamicImports,
      size: bundle.size,
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
  const clearTransitiveDeps = (
    parentDeps: Set<string>,
    bundleName: string,
    seen: Set<string> = new Set()
  ) => {
    const bundle = graph[bundleName];
    for (const dep of bundle.imports!) {
      if (parentDeps.has(dep)) {
        parentDeps.delete(dep);
      }
      if (!seen.has(dep)) {
        seen.add(dep);
        clearTransitiveDeps(parentDeps, dep, seen);
      }
    }
  };

  /**
   * First pass to collect minimal dependency lists and allocate space for dependencies. Minimal
   * means that if one of your dependencies depends on another of your dependencies, there's no need
   * to add that other dependency.
   */
  for (const bundleName of names) {
    const bundle = graph[bundleName];
    // external dependencies are not included in `graph`
    const deps = new Set(bundle.imports!);
    for (const depName of deps) {
      clearTransitiveDeps(deps, depName);
    }
    const dynDeps = new Set(bundle.dynamicImports!);
    for (const depName of dynDeps) {
      clearTransitiveDeps(dynDeps, depName);
    }
    if (dynDeps.size > 0) {
      // We rely on the Set keeping the items in order, everything after this is dynamic
      deps.add(dynamicTag);
      for (const depName of dynDeps) {
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
      if (depName === dynamicTag) {
        bundleGraph[index++] = -1;
        continue;
      }
      const dep = map.get(depName)!;
      const depIndex = dep.index;
      bundleGraph[index++] = depIndex;
    }
  }

  return bundleGraph;
}
