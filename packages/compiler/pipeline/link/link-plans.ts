/** Pure module linking over plans and host-provided resolver/plugin snapshots. */
import {
  ComponentTargetKind,
  DeclTable,
  DeliveryKind,
  EntryKind,
  EsmEdgeKind,
  ExportKind,
  ExportTargetKind,
  ImportTargetKind,
  LINKED_PLAN_VERSION,
  LinkResultKind,
  OpKind,
  PlanFormat,
  ProjectionKind,
  ProgramBodyKind,
  QrlBodyKind,
  UnknownWhy,
  type DeclRef,
  type LinkedImport,
  type LinkedModule,
  type LinkedOp,
  type LinkedPlan,
  type LinkedProgram,
  type LinkResult,
  type Maybe,
  type ModulePlan,
  type Op,
  type Specialization,
  type Unknown,
} from '../schema';

export const enum ResolutionKind {
  Resolved = 'resolved',
  External = 'external',
  Unresolved = 'unresolved',
  Failed = 'failed',
}

export const enum SideEffects {
  Free = 'free',
  Present = 'present',
  Unknown = 'unknown',
}

export interface ResolverSnapshot {
  edges: Record<
    string,
    Record<
      number,
      | { r: ResolutionKind.Resolved; path: string; sideEffects: SideEffects }
      | { r: ResolutionKind.External }
      | { r: ResolutionKind.Unresolved }
      | { r: ResolutionKind.Failed }
    >
  >;
}

export interface PluginSnapshot {
  claims: { plugin: string; module: string; exports: string[] | '*' }[];
  policies: {
    plugin: string;
    stripCtxName?: string[];
    regCtxName?: string[];
    stripEventHandlers?: boolean;
  }[];
  emissions: {
    plugin: string;
    fnId: string;
    language: string;
    argCount: number;
    async: boolean;
    files: { path: string; source: string }[];
    dependencies: Record<string, string>;
  }[];
}

export type LinkEntry =
  | { kind: EntryKind.Module; module: string }
  | { kind: EntryKind.Export; module: string; export: string };

type LinkDiagnostic = Extract<LinkResult, { kind: LinkResultKind.Failed }>['diagnostics'][number];

export function linkPlans(
  plans: readonly ModulePlan[],
  entries: readonly LinkEntry[],
  specialization: Specialization,
  resolver: ResolverSnapshot,
  plugins: PluginSnapshot,
  complete: boolean
): LinkResult {
  void plugins;
  const diagnostics: LinkDiagnostic[] = [];
  const moduleByPath = new Map<string, number>();
  plans.forEach((plan, index) => {
    if (moduleByPath.has(plan.path)) {
      diagnostics.push({
        module: plan.path,
        code: 'duplicate-module',
        message: `Module "${plan.path}" was provided more than once.`,
      });
    } else {
      moduleByPath.set(plan.path, index);
    }
  });
  if (diagnostics.length > 0) {
    return failed(diagnostics);
  }

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
      if (op.op === OpKind.DynamicSlot) {
        if (!qrlIndexes[module].has(op.render.qrl)) {
          diagnostics.push({
            module: plan.path,
            code: 'invalid-qrl-reference',
            message: `Dynamic slot references unknown QRL "${op.render.qrl}".`,
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
  if (diagnostics.length > 0) {
    return failed(diagnostics);
  }

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

  const bindingCache = new Map<string, Maybe<DeclRef>>();
  const exportCache = new Map<string, Maybe<DeclRef>>();
  const resolveLocalBinding = (module: number, binding: number): Maybe<DeclRef> => {
    const key = `${module}:${binding}`;
    const cached = bindingCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const plan = plans[module];
    const candidates: { table: DeclTable; index: number }[] = [];
    plan.qrls.forEach((qrl, index) => {
      if (qrl.declaration?.binding === binding) {
        candidates.push({ table: DeclTable.Qrls, index });
      }
    });
    plan.hooks.forEach((hook, index) => {
      if (hook.binding === binding) {
        candidates.push({ table: DeclTable.Hooks, index });
      }
    });
    plan.callables.forEach((callable, index) => {
      if (callable.binding === binding) {
        candidates.push({ table: DeclTable.Callables, index });
      }
    });
    plan.values.forEach((value, index) => {
      if (value.binding === binding) {
        candidates.push({ table: DeclTable.Values, index });
      }
    });
    plan.contexts.forEach((context, index) => {
      if (context.binding === binding) {
        candidates.push({ table: DeclTable.Contexts, index });
      }
    });
    plan.natives.forEach((native, index) => {
      if (native.binding === binding) {
        candidates.push({ table: DeclTable.Natives, index });
      }
    });
    const result: Maybe<DeclRef> =
      candidates.length === 1
        ? { ok: true, value: { module, ...candidates[0] } }
        : unknown(
            UnknownWhy.Opaque,
            candidates.length === 0 ? 'non-portable-export' : 'ambiguous-local-binding'
          );
    bindingCache.set(key, result);
    return result;
  };

  const resolvingExports = new Set<string>();
  const resolveExport = (module: number, exported: string): Maybe<DeclRef> => {
    const key = `${module}:${exported}`;
    const cached = exportCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (resolvingExports.has(key)) {
      return unknown(UnknownWhy.Cycle);
    }
    resolvingExports.add(key);
    const plan = plans[module];
    const explicit = plan.exports.filter(
      (entry) => entry.e !== ExportKind.Star && entry.exported === exported
    );
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
      let unresolved: Unknown | null = null;
      for (const star of exported === 'default' ? [] : plan.exports) {
        if (star.e !== ExportKind.Star) {
          continue;
        }
        const edgeTarget = linkedEdges[module][star.edge]?.target;
        if (edgeTarget === undefined || !edgeTarget.ok) {
          unresolved ??= edgeTarget?.reason ?? { why: UnknownWhy.Unresolved };
          continue;
        }
        const candidate = resolveExport(edgeTarget.value, exported);
        if (candidate.ok) {
          if (!matches.some((match) => sameDecl(match, candidate.value))) {
            matches.push(candidate.value);
          }
        } else if (!isMissingExport(candidate.reason)) {
          unresolved ??= candidate.reason;
        }
      }
      result =
        matches.length === 1
          ? { ok: true, value: matches[0] }
          : matches.length > 1
            ? unknown(UnknownWhy.Opaque, 'ambiguous-star-export')
            : unresolved === null
              ? unknown(UnknownWhy.Opaque, 'missing-export')
              : { ok: false, reason: unresolved };
    }
    resolvingExports.delete(key);
    exportCache.set(key, result);
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

  const linkOperation = (module: number, op: Op): LinkedOp => {
    if (op.op === OpKind.Element) {
      return { ...op, children: op.children.map((child) => linkOperation(module, child)) };
    }
    if (op.op !== OpKind.Component) {
      return op;
    }
    const target = op.target;
    if (target.t === ComponentTargetKind.Dynamic) {
      return { ...op, target };
    }
    const imported = linkedImports[module].find((entry) => entry.source.binding === target.binding);
    const declaration: Maybe<DeclRef> =
      imported === undefined
        ? resolveLocalBinding(module, target.binding)
        : imported.kind === ImportTargetKind.Declaration
          ? imported.target
          : unknown<DeclRef>(UnknownWhy.Opaque, 'non-portable-export');
    return {
      ...op,
      target: {
        t: ComponentTargetKind.Declaration,
        binding: target.binding,
        declaration,
      },
    };
  };

  const linkedModules: LinkedModule[] = plans.map((plan, module) =>
    materializeModule(
      plan,
      linkedEdges[module],
      linkedImports[module],
      plan.programs.map(
        (program): LinkedProgram => ({
          ...program,
          body:
            program.body.kind === ProgramBodyKind.Ops
              ? {
                  kind: ProgramBodyKind.Ops,
                  ops: program.body.ops.map((op) => linkOperation(module, op)),
                }
              : program.body,
          facts: {
            needsId: { ok: true, value: program.needsId },
            waitForTasks: { ok: true, value: false },
            providesContextEffective: { ok: true, value: false },
            runtimeScope: { ok: true, value: false },
          },
        })
      )
    )
  );

  const linkedEntries: LinkedPlan['entries'] = [];
  for (const entry of entries) {
    const module = moduleByPath.get(entry.module);
    if (module === undefined) {
      diagnostics.push({
        module: entry.module,
        code: 'unresolved-entry',
        message: `Entry module "${entry.module}" is not among the linked plans.`,
      });
      continue;
    }
    if (entry.kind === EntryKind.Module) {
      linkedEntries.push({ kind: EntryKind.Module, module });
    } else {
      linkedEntries.push({
        kind: EntryKind.Export,
        module,
        export: entry.export,
        target: resolveExport(module, entry.export),
      });
    }
  }

  const visited = new Set<string>();
  const visitedModules = new Set<number>();
  const reportImport = (module: number, imported: LinkedImport): void => {
    if (imported.kind === ImportTargetKind.TypeOnly || imported.target.ok) {
      return;
    }
    if (imported.target.reason.why === UnknownWhy.External) {
      return;
    }
    const specifier = plans[module].edges[imported.source.edge].specifier;
    diagnostics.push(importDiagnostic(plans[module].path, specifier, imported.target.reason));
  };
  const visitModuleSideEffects = (module: number): void => {
    if (visitedModules.has(module)) {
      return;
    }
    visitedModules.add(module);
    for (const edge of linkedModules[module].edges) {
      if (edge.kind !== EsmEdgeKind.SideEffect || edge.typeOnly) {
        continue;
      }
      edge.runtime = true;
      if (edge.target.ok) {
        visitModuleSideEffects(edge.target.value);
      } else if (complete && edge.target.reason.why !== UnknownWhy.External) {
        diagnostics.push(importDiagnostic(plans[module].path, edge.specifier, edge.target.reason));
      }
    }
  };
  const markExportPath = (module: number, exported: string, seen = new Set<string>()): void => {
    const key = `${module}:${exported}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const expected = resolveExport(module, exported);
    if (!expected.ok) {
      return;
    }
    for (const entry of plans[module].exports) {
      if (entry.e === ExportKind.Local) {
        continue;
      }
      if (entry.e === ExportKind.Reexport && entry.exported !== exported) {
        continue;
      }
      if (entry.e === ExportKind.Star && exported === 'default') {
        continue;
      }
      const edge = linkedModules[module].edges[entry.edge];
      if (!edge.target.ok) {
        continue;
      }
      const imported = entry.e === ExportKind.Reexport ? entry.imported : exported;
      if (imported === '*') {
        continue;
      }
      const candidate = resolveExport(edge.target.value, imported);
      if (!candidate.ok || !sameDecl(candidate.value, expected.value)) {
        continue;
      }
      edge.runtime = true;
      visitModuleSideEffects(edge.target.value);
      markExportPath(edge.target.value, imported, seen);
    }
  };
  const visitDecl = (decl: DeclRef): void => {
    const key = `${decl.module}:${decl.table}:${decl.index}`;
    if (visited.has(key)) {
      return;
    }
    visited.add(key);
    visitModuleSideEffects(decl.module);
    if (decl.table !== DeclTable.Qrls) {
      return;
    }
    const qrl = linkedModules[decl.module].qrls[decl.index];
    if (qrl?.body.b === QrlBodyKind.Program) {
      visitProgram(decl.module, qrl.body.program);
    }
  };
  const visitProgram = (module: number, program: number): void => {
    const body = linkedModules[module].programs[program]?.body;
    if (body?.kind !== ProgramBodyKind.Ops) {
      return;
    }
    for (const op of body.ops) {
      visitOp(module, op);
    }
  };
  const visitOp = (module: number, op: LinkedOp): void => {
    if (op.op === OpKind.Element) {
      for (const child of op.children) {
        visitOp(module, child);
      }
      return;
    }
    if (op.op === OpKind.Slot) {
      if (op.fallback !== null) {
        const qrl = qrlIndexes[module].get(op.fallback.qrl);
        if (qrl !== undefined) {
          visitDecl({ module, table: DeclTable.Qrls, index: qrl });
        }
      }
      return;
    }
    if (op.op === OpKind.DynamicSlot) {
      const qrl = qrlIndexes[module].get(op.render.qrl);
      if (qrl !== undefined) {
        visitDecl({ module, table: DeclTable.Qrls, index: qrl });
      }
      return;
    }
    if (op.op !== OpKind.Component) {
      return;
    }
    for (const projection of op.projections) {
      const use = projection.kind === ProjectionKind.Forward ? projection.fallback : projection.use;
      if (use === null) {
        continue;
      }
      const qrl = qrlIndexes[module].get(use.qrl);
      if (qrl !== undefined) {
        visitDecl({ module, table: DeclTable.Qrls, index: qrl });
      }
    }
    const target = op.target;
    if (target.t === ComponentTargetKind.Dynamic) {
      return;
    }
    const imported = linkedModules[module].imports.find(
      (entry) => entry.source.binding === target.binding
    );
    if (imported !== undefined) {
      linkedModules[module].edges[imported.source.edge].runtime = !imported.source.typeOnly;
      const targetModule = linkedModules[module].edges[imported.source.edge].target;
      if (
        targetModule.ok &&
        imported.kind === ImportTargetKind.Declaration &&
        imported.source.imported !== '*'
      ) {
        visitModuleSideEffects(targetModule.value);
        markExportPath(targetModule.value, imported.source.imported);
      }
      if (complete) {
        reportImport(module, imported);
      }
    }
    if (target.declaration.ok) {
      visitDecl(target.declaration.value);
    }
  };

  for (const entry of linkedEntries) {
    if (entry.kind === EntryKind.Export) {
      if (entry.target.ok) {
        visitDecl(entry.target.value);
      } else if (complete) {
        diagnostics.push(
          exportDiagnostic(plans[entry.module].path, entry.export, entry.target.reason)
        );
      }
    } else {
      visitModuleSideEffects(entry.module);
      for (const exported of plans[entry.module].exports) {
        if (exported.e === ExportKind.Star) {
          continue;
        }
        const target = resolveExport(entry.module, exported.exported);
        if (target.ok) {
          visitDecl(target.value);
        }
      }
    }
  }

  if (complete && diagnostics.length > 0) {
    return failed(diagnostics);
  }
  return {
    kind: LinkResultKind.Linked,
    plan: {
      format: PlanFormat.LinkedPlan,
      version: LINKED_PLAN_VERSION,
      specialization,
      complete,
      entries: linkedEntries,
      modules: linkedModules,
      implementations: [],
      diagnostics: plans.flatMap((plan, module) =>
        plan.diagnostics.map((diagnostic) => ({ module, diagnostic }))
      ),
    },
  };
}

function materializeModule(
  plan: ModulePlan,
  edges: LinkedModule['edges'],
  imports: LinkedImport[],
  programs: LinkedProgram[]
): LinkedModule {
  return {
    path: plan.path,
    kind: plan.kind,
    source: plan.source,
    bindings: plan.bindings,
    lifetimes: plan.lifetimes,
    payloads: plan.payloads,
    programs,
    qrls: plan.qrls.map((qrl) => ({
      ...qrl,
      delivery: { d: DeliveryKind.Chunk, chunkBase: `${plan.path}_${qrl.name}`, resolved: true },
    })),
    hooks: plan.hooks,
    callables: plan.callables,
    values: plan.values,
    contexts: [],
    natives: [],
    defs: plan.defs,
    edges,
    imports,
    exports: plan.exports,
    assembly: plan.assembly,
    diagnostics: plan.diagnostics,
  };
}

function unknown<T>(why: UnknownWhy, code?: string): Maybe<T> {
  return why === UnknownWhy.Opaque
    ? { ok: false, reason: { why, code: code! } }
    : { ok: false, reason: { why } as Unknown };
}

function sameDecl(left: DeclRef, right: DeclRef): boolean {
  return left.module === right.module && left.table === right.table && left.index === right.index;
}

function isMissingExport(reason: Unknown): boolean {
  return reason.why === UnknownWhy.Opaque && reason.code === 'missing-export';
}

function importDiagnostic(module: string, specifier: string, reason: Unknown): LinkDiagnostic {
  switch (reason.why) {
    case UnknownWhy.Failed:
      return { module, code: 'failed-edge', message: `Resolver failed for "${specifier}".` };
    case UnknownWhy.Cycle:
      return { module, code: 'cyclic-export', message: `Export cycle through "${specifier}".` };
    case UnknownWhy.Opaque:
      return {
        module,
        code: reason.code,
        message:
          reason.code === 'missing-export'
            ? `The target of "${specifier}" does not export the requested name.`
            : `Unable to link "${specifier}": ${reason.code}.`,
      };
    default:
      return { module, code: 'unresolved-edge', message: `Unable to resolve "${specifier}".` };
  }
}

function exportDiagnostic(module: string, exported: string, reason: Unknown): LinkDiagnostic {
  const code =
    reason.why === UnknownWhy.Cycle
      ? 'cyclic-export'
      : reason.why === UnknownWhy.Opaque
        ? reason.code
        : 'missing-export';
  return { module, code, message: `Unable to link export "${exported}" from "${module}".` };
}

function failed(diagnostics: LinkDiagnostic[]): LinkResult {
  const unique = new Map<string, LinkDiagnostic>();
  for (const diagnostic of diagnostics) {
    unique.set(`${diagnostic.module}\0${diagnostic.code}\0${diagnostic.message}`, diagnostic);
  }
  return {
    kind: LinkResultKind.Failed,
    diagnostics: [...unique.values()].sort(
      (left, right) =>
        left.module.localeCompare(right.module) ||
        left.code.localeCompare(right.code) ||
        left.message.localeCompare(right.message)
    ),
  };
}
