import type { QwikBundleGraph, QwikManifest } from '../types';

/**
 * A function that creates a modified version of the bundle graph. Used to inject routes and their
 * dependencies into the bundle graph.
 *
 * @public
 */
export type BundleGraphModifier = (
  graph: QwikBundleGraph,
  manifest: QwikManifest
) => QwikBundleGraph;

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
  bundleGraphModifiers?: Set<BundleGraphModifier>
): QwikBundleGraph {
  let bundleGraph: QwikBundleGraph = [];
  const graph = manifest.bundles;
  if (!graph) {
    return [];
  }
  const names = Object.keys(graph).sort();
  const map = new Map<string, { index: number; deps: Set<string> }>();
  const clearTransitiveDeps = (parentDeps: Set<string>, seen: Set<string>, bundleName: string) => {
    const bundle = graph[bundleName];
    if (!bundle) {
      // external dependency
      return;
    }
    for (const dep of bundle.imports || []) {
      if (parentDeps.has(dep)) {
        parentDeps.delete(dep);
      }
      if (!seen.has(dep)) {
        seen.add(dep);
        clearTransitiveDeps(parentDeps, seen, dep);
      }
    }
  };
  for (const bundleName of names) {
    const bundle = graph[bundleName];
    const index = bundleGraph.length;
    const deps = new Set(bundle.imports);
    for (const depName of deps) {
      if (!graph[depName]) {
        // external dependency
        continue;
      }
      clearTransitiveDeps(deps, new Set(), depName);
    }
    const internalDynamicImports = bundle.dynamicImports?.filter((d) => graph[d]) || [];
    // If we have a lot of dynamic imports, we don't know which ones are needed, so we don't add any
    // This can happen with registry bundles like for routing
    if (internalDynamicImports.length > 0 && internalDynamicImports.length < 10) {
      deps.add(dynamicTag);
      for (const depName of internalDynamicImports) {
        deps.add(depName);
      }
    }
    map.set(bundleName, { index, deps });
    bundleGraph.push(bundleName);
    while (index + deps.size >= bundleGraph.length) {
      bundleGraph.push(null!);
    }
  }
  // Add the symbols to the bundle graph
  for (const [symbol, chunkname] of Object.entries(manifest.mapping)) {
    const bundle = map.get(chunkname);
    if (!bundle) {
      console.warn(`Chunk ${chunkname} for symbol ${symbol} not found in the bundle graph.`);
    } else {
      const idx = symbol.lastIndexOf('_');
      const hash = idx === -1 ? symbol : symbol.slice(idx + 1);
      bundleGraph.push(hash, bundle.index);
    }
  }
  // Second pass to to update dependency pointers
  for (const bundleName of names) {
    const bundle = map.get(bundleName);
    if (!bundle) {
      console.warn(`Bundle ${bundleName} not found in the bundle graph.`);
      continue;
    }
    // eslint-disable-next-line prefer-const
    let { index, deps } = bundle;
    index++;
    for (const depName of deps) {
      if (depName === dynamicTag) {
        bundleGraph[index++] = -1;
        continue;
      }
      const dep = map.get(depName);
      if (!dep) {
        console.warn(`Dependency ${depName} of ${bundleName} not found in the bundle graph.`);
        continue;
      }
      const depIndex = dep.index;
      bundleGraph[index++] = depIndex;
    }
  }
  if (bundleGraphModifiers && bundleGraphModifiers.size > 0) {
    for (const modifier of bundleGraphModifiers) {
      bundleGraph = modifier(bundleGraph, manifest);
    }
  }
  return bundleGraph;
}
