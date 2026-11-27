import type { QwikBundle, QwikBundleGraph, QwikManifest } from '../types';

const QRL_IMPORTS_MARKER = -1;
const HANDLER_CHUNK_MARKER = -2;
const OTHER_QRL_CHUNK_MARKER = -3;
const COMPONENT_CHUNK_MARKER = -4;

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
 *   [...(bundleName: string, kind?: -2 | -3 | -4, ...directImports: index[], ...qrlImports: [-1, ...index[]] | [])]
 * ```
 *
 * (index is the position of the dependency in the bundleGraph array; kind is -2 for a chunk that
 * holds a handler, -3 for one that holds other QRLs, -4 for one that only holds components)
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
    const hash = getSymbolHash(symbol);
    if (hash) {
      // Hinting a symbol preloads its bundle through this qrl edge
      graph[hash] = { qrlImports: [bundleName] } as QwikBundle;
    }
  }
  // Routes etc
  if (bundleGraphAdders) {
    const combined = { ...manifest, bundles: graph };
    for (const adder of bundleGraphAdders) {
      const result = adder(combined);
      if (result) {
        // Adder edges are followed like qrl edges
        for (const [name, node] of Object.entries(result)) {
          graph[name] = { ...node, qrlImports: node.dynamicImports } as QwikBundle;
        }
      }
    }
  }

  // A user import() is a cut point: only qrl edges are followed
  for (const bundleName of Object.keys(graph)) {
    const bundle = graph[bundleName];
    const imports = bundle.imports?.filter((dep) => graph[dep]) || [];
    const qrlImports = bundle.qrlImports?.filter((dep) => graph[dep]) || [];

    /**
     * Overwrite so we don't mutate the given objects. Be sure to copy all properties we use during
     * and after the conversion.
     */
    graph[bundleName] = {
      ...bundle,
      imports,
      dynamicImports: qrlImports,
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
    const deps = new Set<string>();
    const kindMarker = getKindMarker(bundle, manifest);
    if (kindMarker) {
      deps.add(kindMarker as any as string);
    }
    // external dependencies are not included in `graph`
    const staticDeps = new Set(bundle.imports!);
    reduceDeps(staticDeps, bundleName);
    for (const depName of staticDeps) {
      deps.add(depName);
    }
    const qrlDeps = new Set(bundle.dynamicImports!);
    reduceDeps(qrlDeps, bundleName);
    if (qrlDeps.size > 0) {
      // We rely on the Set keeping the items in order, everything after this is a qrl import
      deps.add(QRL_IMPORTS_MARKER as any as string);
      for (const depName of qrlDeps) {
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

const isRenderOnlySymbol = (ctxName: string) => /^(component|useStyles)/.test(ctxName);

function getKindMarker(bundle: QwikBundle, manifest: QwikManifest) {
  let marker: number | undefined;
  for (const symbolName of bundle.symbols || []) {
    const symbol = manifest.symbols?.[symbolName];
    if (!symbol) {
      continue;
    }
    if (symbol.ctxKind !== 'function') {
      return HANDLER_CHUNK_MARKER;
    }
    if (!isRenderOnlySymbol(symbol.ctxName)) {
      marker = OTHER_QRL_CHUNK_MARKER;
    } else if (!marker) {
      marker = COMPONENT_CHUNK_MARKER;
    }
  }
  return marker;
}

/** Returns a lookup of every component reachable from a component of the condensed graph. */
export function createReachability(successors: Set<number>[]) {
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
  return reachOf;
}

/** Builds a reachability-preserving transitive reducer over the static-import graph. */
function createTransitiveReducer(graph: Record<string, QwikBundle>) {
  const { componentOf, successors } = condenseImportGraph(graph);
  const reachOf = createReachability(successors);

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
