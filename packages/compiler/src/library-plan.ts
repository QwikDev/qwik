import { MODULE_PLAN_VERSION, PlanFormat, type ModulePlan } from './schema';
import { ResolutionKind, type LinkEntry, type ResolverSnapshot } from './link/link-plans';

export interface LibraryPlan {
  format: 'qwik/library-plan';
  version: 1;
  modules: ModulePlan[];
  entries: LinkEntry[];
  resolver: ResolverSnapshot;
}

/**
 * Package-relative module IDs keep library plans independent of the build directory. Null when an
 * entry itself cannot be carried: the library then publishes no plan and consumers use its build.
 */
export function createLibraryPlan(
  modules: readonly ModulePlan[],
  entries: readonly LinkEntry[],
  resolver: ResolverSnapshot
): LibraryPlan | null {
  const kept = carriable(modules, resolver);
  if (entries.some((entry) => !kept.has(entry.module))) {
    return null;
  }
  const reachable = reachableFrom(entries, modules, resolver, kept);
  const carried = modules.filter((module) => reachable.has(module.path));
  // The authored extension picks the parser; TypeScript-only syntax is invalid under `.tsx`.
  const paths = new Map(
    carried.map((module, index) => [
      module.path,
      `module-${index}${/\.[A-Za-z0-9]+$/.exec(module.path)?.[0] ?? '.tsx'}`,
    ])
  );
  const relocate = (path: string) => {
    const target = paths.get(path);
    if (target === undefined) {
      throw new Error(`Library plan references missing module ${path}`);
    }
    return target;
  };
  const snapshot = structuredClone({ modules: carried, entries: [...entries], resolver });
  snapshot.modules.forEach((module) => {
    module.path = relocate(module.path);
    module.source.originalPath = module.path;
    if (module.source.normalizationMap !== null) {
      module.source.normalizationMap.sources = module.source.normalizationMap.sources.map(
        () => module.path
      );
      delete module.source.normalizationMap.sourceRoot;
    }
  });
  return {
    format: 'qwik/library-plan',
    version: 1,
    modules: snapshot.modules,
    entries: snapshot.entries.map((entry) => ({ ...entry, module: relocate(entry.module) })),
    resolver: {
      edges: Object.fromEntries(
        Object.entries(snapshot.resolver.edges)
          .filter(([path]) => paths.has(path))
          .map(([path, edges]) => [
            relocate(path),
            Object.fromEntries(
              Object.entries(edges).map(([id, edge]) => [
                id,
                edge.r === ResolutionKind.Resolved && paths.has(edge.path)
                  ? { ...edge, path: relocate(edge.path) }
                  : edge.r === ResolutionKind.Resolved
                    ? { r: ResolutionKind.External }
                    : edge,
              ])
            ),
          ])
      ),
    },
  };
}

/**
 * The modules a consumer can relink; the rest it takes from the published build. A relative import
 * the link did not resolve is a bundler asset (`?inline`, `?worker&url`), and the plan anonymizes
 * paths, so the consumer has neither a base nor the file. Whoever imports such a module relatively
 * cannot resolve it either, so the exclusion carries up its importers.
 */
/**
 * One build plans every module for all its entries; a bundle's plan carries only what its own
 * entries reach. Type imports count: the consumer links their contracts too.
 */
function reachableFrom(
  entries: readonly LinkEntry[],
  modules: readonly ModulePlan[],
  resolver: ResolverSnapshot,
  kept: ReadonlySet<string>
): ReadonlySet<string> {
  const byPath = new Map(modules.map((module) => [module.path, module]));
  const reachable = new Set<string>();
  const pending = entries.map((entry) => entry.module);
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (reachable.has(path) || !kept.has(path)) {
      continue;
    }
    reachable.add(path);
    for (const edge of byPath.get(path)!.edges) {
      const target = resolver.edges[path]?.[edge.id];
      if (target?.r === ResolutionKind.Resolved) {
        pending.push(target.path);
      }
    }
  }
  return reachable;
}

function carriable(
  modules: readonly ModulePlan[],
  resolver: ResolverSnapshot
): ReadonlySet<string> {
  const kept = new Set(modules.map((module) => module.path));
  for (let changed = true; changed; ) {
    changed = false;
    for (const module of modules) {
      if (!kept.has(module.path)) {
        continue;
      }
      const lost = module.edges.some((edge) => {
        if (!edge.specifier.startsWith('.') || edge.typeOnly) {
          return false;
        }
        const target = resolver.edges[module.path]?.[edge.id];
        return target?.r !== ResolutionKind.Resolved || !kept.has(target.path);
      });
      if (lost) {
        kept.delete(module.path);
        changed = true;
      }
    }
  }
  return kept;
}

export function readLibraryPlan(source: string): LibraryPlan {
  const plan = JSON.parse(source) as LibraryPlan;
  if (
    plan?.format !== 'qwik/library-plan' ||
    plan.version !== 1 ||
    !Array.isArray(plan.modules) ||
    !Array.isArray(plan.entries) ||
    plan.resolver === null ||
    typeof plan.resolver !== 'object'
  ) {
    throw new Error('Unsupported Qwik library plan format or version');
  }
  const paths = new Set<string>();
  for (const module of plan.modules) {
    if (
      module?.format !== PlanFormat.ModulePlan ||
      module.version !== MODULE_PLAN_VERSION ||
      !Array.isArray(module.invocations) ||
      !Array.isArray(module.bindings) ||
      !Array.isArray(module.edges) ||
      !Array.isArray(module.programs) ||
      !Array.isArray(module.qrls) ||
      !Array.isArray(module.payloads) ||
      typeof module.source?.code !== 'string' ||
      typeof module.source.symbolNamespace !== 'string' ||
      !/^module-\d+\.[A-Za-z0-9]+$/.test(module.path) ||
      paths.has(module.path)
    ) {
      throw new Error('Unsupported Qwik module plan format, version or module ID');
    }
    const types = module.source.types;
    if (
      types !== undefined &&
      (types === null ||
        typeof types.code !== 'string' ||
        !Array.isArray(types.bindings) ||
        types.bindings.some(
          (entry) =>
            entry === null ||
            !Number.isInteger(entry.binding) ||
            entry.binding < 0 ||
            entry.binding >= module.bindings.length ||
            !Number.isInteger(entry.start) ||
            entry.start < 0 ||
            entry.start >= types.code.length
        ))
    ) {
      throw new Error('Unsupported Qwik declared type contract');
    }
    paths.add(module.path);
  }
  if (
    plan.entries.some((entry) => !paths.has(entry?.module)) ||
    plan.resolver.edges === null ||
    typeof plan.resolver.edges !== 'object'
  ) {
    throw new Error('Unsupported Qwik library plan module reference');
  }
  for (const [owner, edges] of Object.entries(plan.resolver.edges)) {
    if (!paths.has(owner) || edges === null || typeof edges !== 'object') {
      throw new Error('Unsupported Qwik library plan edge owner');
    }
    for (const edge of Object.values(edges)) {
      if (
        edge === null ||
        typeof edge !== 'object' ||
        ![
          ResolutionKind.Resolved,
          ResolutionKind.External,
          ResolutionKind.Unresolved,
          ResolutionKind.Failed,
        ].includes(edge.r) ||
        (edge.r === ResolutionKind.Resolved && !paths.has(edge.path))
      ) {
        throw new Error('Unsupported Qwik library plan edge target');
      }
    }
  }
  return plan;
}
