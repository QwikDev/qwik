/** Pure module linking over plans and host-provided resolver/plugin snapshots. */
import {
  DeclTable,
  ExportKind,
  ExportTargetKind,
  ImportTargetKind,
  OpKind,
  ProjectionKind,
  ProgramBodyKind,
  UnknownWhy,
  type DeclRef,
  type LinkedImport,
  type LinkedModule,
  type LocalId,
  type Maybe,
  type ModulePlan,
  type Op,
  type Unknown,
  ResultKind,
} from '../schema';
import { ValueIrKind } from '../schema/value-ir';
import { ResolutionKind, type LinkDiagnostic, type ResolverSnapshot } from './link-plans';

/** What every module edge, import, binding and export finally names. */
export interface Resolution {
  moduleByPath: ReadonlyMap<string, number>;
  qrlIndexes: ReadonlyMap<string, number>[];
  linkedEdges: LinkedModule['edges'][];
  linkedImports: LinkedImport[][];
  importsByBinding: Map<LocalId, LinkedImport>[];
  resolveLocalBinding: (module: number, binding: LocalId, aliases?: Set<LocalId>) => Maybe<DeclRef>;
  resolveExport: (module: number, exported: string) => Maybe<DeclRef>;
}

/** Diagnostics recorded here fail the link; the caller checks before materializing. */
export function resolveModules(
  plans: readonly ModulePlan[],
  resolver: ResolverSnapshot,
  diagnostics: LinkDiagnostic[]
): Resolution {
  const moduleByPath = new Map<string, number>();
  plans.forEach((plan, index) => moduleByPath.set(plan.path, index));
  const qrlIndexes = plans.map(
    (plan) => new Map(plan.qrls.map((qrl, index) => [qrl.id, index] as const))
  );
  plans.forEach((plan, module) => {
    const visit = (op: Op): void => {
      if (op.op === OpKind.Element) {
        op.children.forEach(visit);
        return;
      }
      if (op.op === OpKind.Slot) {
        if (op.fallback !== null && !qrlIndexes[module].has(op.fallback.qrl)) {
          diagnostics.push({
            module: plan.path,
            code: 'invalid-qrl-reference',
            message: `Slot fallback references unknown QRL "${op.fallback.qrl}".`,
          });
        }
        return;
      }
      if (op.op === OpKind.Content) {
        if (!qrlIndexes[module].has(op.render.qrl)) {
          diagnostics.push({
            module: plan.path,
            code: 'invalid-qrl-reference',
            message: `Content range references unknown QRL "${op.render.qrl}".`,
          });
        }
        return;
      }
      if (op.op !== OpKind.Component) {
        return;
      }
      for (const projection of op.projections) {
        const use =
          projection.kind === ProjectionKind.Forward ? projection.fallback : projection.use;
        if (use === null) {
          continue;
        }
        if (!qrlIndexes[module].has(use.qrl)) {
          diagnostics.push({
            module: plan.path,
            code: 'invalid-qrl-reference',
            message: `Projection references unknown QRL "${use.qrl}".`,
          });
        }
      }
    };
    for (const program of plan.programs) {
      if (program.body.kind === ProgramBodyKind.Ops) {
        program.body.ops.forEach(visit);
      }
    }
  });

  const linkedEdges: LinkedModule['edges'][] = plans.map((plan) =>
    plan.edges.map((edge) => {
      const resolution = resolver.edges[plan.path]?.[edge.id];
      let target: Maybe<number>;
      switch (resolution?.r) {
        case ResolutionKind.Resolved: {
          const module = moduleByPath.get(resolution.path);
          target =
            module === undefined ? unknown(UnknownWhy.Unresolved) : { ok: true, value: module };
          break;
        }
        case ResolutionKind.External:
          target = unknown(UnknownWhy.External);
          break;
        case ResolutionKind.Failed:
          target = unknown(UnknownWhy.Failed);
          break;
        default:
          target = unknown(UnknownWhy.Unresolved);
          break;
      }
      return { ...edge, target, runtime: false };
    })
  );

  const declarationsByBinding = plans.map(indexLocalDeclarations);
  const explicitExportsByName = plans.map(indexExplicitExports);
  const exportCache = new Map<string, Maybe<DeclRef>>();
  const resolveLocalBinding = (
    module: number,
    binding: LocalId,
    aliases = new Set<LocalId>()
  ): Maybe<DeclRef> => {
    if (aliases.has(binding)) {
      return unknown(UnknownWhy.Cycle);
    }
    aliases.add(binding);
    const declaration = declarationsByBinding[module].get(binding);
    if (declaration !== undefined) {
      return declaration;
    }
    const imported = plans[module].imports.find(
      (entry) => entry.binding === binding && !entry.typeOnly
    );
    if (imported !== undefined && imported.imported !== '*') {
      const target = linkedEdges[module][imported.edge].target;
      return target.ok ? resolveExport(target.value, imported.imported) : target;
    }
    let result = plans[module].bindings[binding]?.result?.value;
    while (result?.kind === ResultKind.Union && result.values.length === 1) {
      result = result.values[0];
    }
    if (result?.kind === ValueIrKind.BindingRead) {
      return resolveLocalBinding(module, result.binding, aliases);
    }
    return plans[module].bindings[binding]?.result === undefined
      ? unknown(UnknownWhy.Opaque, 'non-portable-export')
      : { ok: true, value: { module, table: DeclTable.Bindings, index: binding } };
  };

  // ECMAScript ResolveExport's resolve set: one per top-level search, each pair by visit order.
  const searchVisits = new Map<string, number>();
  const exportStack = new Set<string>();
  // The earliest visit the lookups since the last frame started arrived at again.
  let earliestHit = Infinity;
  const resolveExport = (module: number, exported: string): Maybe<DeclRef> => {
    const key = `${module}:${exported}`;
    const cached = exportCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (exportStack.size === 0) {
      searchVisits.clear();
    }
    const visit = searchVisits.get(key);
    if (visit !== undefined) {
      earliestHit = Math.min(earliestHit, visit);
      // An open pair is a circular definition; a finished one already counted where it was first met.
      return exportStack.has(key)
        ? unknown(UnknownWhy.Cycle)
        : unknown(UnknownWhy.Opaque, 'missing-export');
    }
    const order = searchVisits.size;
    const outerHit = earliestHit;
    earliestHit = Infinity;
    searchVisits.set(key, order);
    exportStack.add(key);
    const plan = plans[module];
    const explicit = explicitExportsByName[module].get(exported) ?? [];
    let result: Maybe<DeclRef>;
    if (explicit.length > 1) {
      result = unknown(UnknownWhy.Opaque, 'ambiguous-export');
    } else if (explicit.length === 1) {
      const entry = explicit[0];
      if (entry.e === ExportKind.Local) {
        result =
          entry.target.t === ExportTargetKind.Declaration
            ? { ok: true, value: { module, table: entry.target.table, index: entry.target.index } }
            : resolveLocalBinding(module, entry.target.binding);
      } else if (entry.e === ExportKind.Reexport) {
        const edgeTarget = linkedEdges[module][entry.edge]?.target;
        result =
          edgeTarget === undefined || !edgeTarget.ok
            ? (edgeTarget ?? unknown(UnknownWhy.Unresolved))
            : entry.imported === '*'
              ? unknown(UnknownWhy.Opaque, 'non-portable-export')
              : resolveExport(edgeTarget.value, entry.imported);
      } else {
        result = unknown(UnknownWhy.Opaque, 'ambiguous-export');
      }
    } else {
      const matches: DeclRef[] = [];
      let isAmbiguous = false;
      let unresolved: Unknown | null = null;
      for (const star of exported === 'default' ? [] : plan.exports) {
        if (star.e !== ExportKind.Star) {
          continue;
        }
        const edgeTarget = linkedEdges[module][star.edge]?.target;
        if (edgeTarget === undefined || !edgeTarget.ok) {
          unresolved = canonicalReason(
            unresolved,
            edgeTarget?.reason ?? { why: UnknownWhy.Unresolved }
          );
          continue;
        }
        const candidate = resolveExport(edgeTarget.value, exported);
        if (candidate.ok) {
          if (!matches.some((match) => sameDecl(match, candidate.value))) {
            matches.push(candidate.value);
          }
        } else if (isOpaque(candidate.reason, 'ambiguous-star-export')) {
          isAmbiguous = true;
        } else if (
          // ECMAScript ResolveExport: a star leg that circles back is "not found here", not an error.
          candidate.reason.why !== UnknownWhy.Cycle &&
          !isOpaque(candidate.reason, 'missing-export')
        ) {
          unresolved = canonicalReason(unresolved, candidate.reason);
        }
      }
      result =
        matches.length === 1 && !isAmbiguous
          ? { ok: true, value: matches[0] }
          : matches.length > 1 || isAmbiguous
            ? unknown(UnknownWhy.Opaque, 'ambiguous-star-export')
            : unresolved === null
              ? unknown(UnknownWhy.Opaque, 'missing-export')
              : { ok: false, reason: unresolved };
    }
    exportStack.delete(key);
    // A result that met a pair visited before this frame holds only for this search.
    if (earliestHit >= order) {
      exportCache.set(key, result);
      earliestHit = Infinity;
    }
    earliestHit = Math.min(outerHit, earliestHit);
    return result;
  };

  const linkedImports: LinkedImport[][] = plans.map((plan, module) =>
    plan.imports.map((source): LinkedImport => {
      if (source.typeOnly) {
        return { kind: ImportTargetKind.TypeOnly, source };
      }
      const moduleTarget =
        linkedEdges[module][source.edge]?.target ?? unknown(UnknownWhy.Unresolved);
      if (source.imported === '*') {
        return { kind: ImportTargetKind.Namespace, source, target: moduleTarget };
      }
      return {
        kind: ImportTargetKind.Declaration,
        source,
        target: moduleTarget.ok ? resolveExport(moduleTarget.value, source.imported) : moduleTarget,
      };
    })
  );
  const importsByBinding = linkedImports.map((imports) => {
    const index = new Map<LocalId, LinkedImport>();
    for (const imported of imports) {
      if (!index.has(imported.source.binding)) {
        index.set(imported.source.binding, imported);
      }
    }
    return index;
  });

  return {
    moduleByPath,
    qrlIndexes,
    linkedEdges,
    linkedImports,
    importsByBinding,
    resolveLocalBinding,
    resolveExport,
  };
}

type ExplicitExport = Exclude<ModulePlan['exports'][number], { e: ExportKind.Star }>;

function indexExplicitExports(plan: ModulePlan): Map<string, ExplicitExport[]> {
  const byName = new Map<string, ExplicitExport[]>();
  for (const entry of plan.exports) {
    if (entry.e === ExportKind.Star) {
      continue;
    }
    const named = byName.get(entry.exported);
    if (named === undefined) {
      byName.set(entry.exported, [entry]);
    } else {
      named.push(entry);
    }
  }
  return byName;
}

function indexLocalDeclarations(plan: ModulePlan, module: number): Map<LocalId, Maybe<DeclRef>> {
  const targets = new Map<LocalId, Maybe<DeclRef>>();
  const add = (binding: LocalId | null, table: DeclTable, index: number): void => {
    if (binding === null) {
      return;
    }
    targets.set(
      binding,
      targets.has(binding)
        ? unknown(UnknownWhy.Opaque, 'ambiguous-local-binding')
        : { ok: true, value: { module, table, index } }
    );
  };
  plan.qrls.forEach((qrl, index) => add(qrl.declaration?.binding ?? null, DeclTable.Qrls, index));
  for (const [table, declarations] of [
    [DeclTable.Hooks, plan.hooks],
    [DeclTable.Natives, plan.natives],
  ] as const) {
    declarations.forEach((declaration, index) => add(declaration.binding, table, index));
  }
  return targets;
}

export function unknown<T>(why: UnknownWhy, code?: string): Maybe<T> {
  return why === UnknownWhy.Opaque
    ? { ok: false, reason: { why, code: code! } }
    : { ok: false, reason: { why } as Unknown };
}

export function sameDecl(left: DeclRef, right: DeclRef): boolean {
  return left.module === right.module && left.table === right.table && left.index === right.index;
}

function isOpaque(reason: Unknown, code: string): boolean {
  return reason.why === UnknownWhy.Opaque && reason.code === code;
}

/** Picks by content, not by visit order, which cached cycle legs would otherwise decide. */
function canonicalReason(current: Unknown | null, next: Unknown): Unknown {
  return current !== null && reasonKey(current) <= reasonKey(next) ? current : next;
}

function reasonKey(reason: Unknown): string {
  return reason.why === UnknownWhy.Opaque ? `${reason.why}:${reason.code}` : reason.why;
}
