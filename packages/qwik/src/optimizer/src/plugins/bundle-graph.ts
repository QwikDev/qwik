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

export function convertManifestToBundleGraph(
  manifest: QwikManifest,
  bundleGraphModifiers?: Set<BundleGraphModifier>
): QwikBundleGraph {
  let bundleGraph: QwikBundleGraph = [];
  const manifestGraph = manifest.bundles;
  if (!manifestGraph) {
    return [];
  }
  const names = Object.keys(manifestGraph).sort();
  const map = new Map<string, { index: number; deps: Set<string> }>();

  for (const bundleName of names) {
    const bundle = manifestGraph[bundleName];
    const index = bundleGraph.length;
    const deps = new Set(bundle.imports);
    for (const depName of deps) {
      if (!manifestGraph[depName]) {
        // external dependency
        continue;
      }
      clearTransitiveDeps(deps, new Set(), depName, manifestGraph);
    }
    let didAddSeparator = false;
    for (const depName of bundle.dynamicImports || []) {
      // If we dynamically import a qrl segment that is not a handler, we'll probably need it soon

      if (!manifestGraph[depName]) {
        // external dependency
        continue;
      }
      if (!didAddSeparator) {
        deps.add('<dynamic>');
        didAddSeparator = true;
      }
      deps.add(depName);
    }
    map.set(bundleName, { index, deps });
    bundleGraph.push(bundleName);
    while (index + deps.size >= bundleGraph.length) {
      bundleGraph.push(null!);
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
      if (depName === '<dynamic>') {
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

function clearTransitiveDeps(
  parentDeps: Set<string>,
  seen: Set<string>,
  bundleName: string,
  graph: QwikManifest['bundles']
) {
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
      clearTransitiveDeps(parentDeps, seen, dep, graph);
    }
  }
}
