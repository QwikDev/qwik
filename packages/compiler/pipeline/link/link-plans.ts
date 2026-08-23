/**
 * `linkPlans(plans, entries, specialization, snapshots, complete) -> LinkedPlan`; pure over its
 * explicit inputs. `complete: false` = per-module transform link (dangling refs become typed
 * unknowns); `complete: true` = artifact link (dangling refs are `LinkResult.failed`).
 */
import {
  DeliveryKind,
  EntryKind,
  LINKED_PLAN_VERSION,
  LinkResultKind,
  PlanFormat,
  UnknownWhy,
  type LinkedModule,
  type LinkedPlan,
  type LinkedProgram,
  type LinkResult,
  type ModulePlan,
  type Specialization,
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

/** Per environment; host-built from the bundler resolver. Keyed by plan path + edge id. */
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

/** Claims + framework policies + emissions — all canonical data, never live callbacks. */
export interface PluginSnapshot {
  claims: { plugin: string; module: string; exports: string[] | '*' }[];
  /** Framework-owned strip/registration policies (Router, test tooling); core only executes. */
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

/**
 * Generic roots only — a render root, a framework's server entry, and a library's public surface
 * are indistinguishable to the linker. No discovery heuristics: hosts derive entries from their own
 * config/topology and error on ambiguity or absence when an artifact was requested.
 */
export type LinkEntry =
  | { kind: EntryKind.Module; module: string }
  | { kind: EntryKind.Export; module: string; export: string };

export function linkPlans(
  plans: readonly ModulePlan[],
  entries: readonly LinkEntry[],
  specialization: Specialization,
  resolver: ResolverSnapshot,
  plugins: PluginSnapshot,
  complete: boolean
): LinkResult {
  void resolver;
  void plugins;
  const moduleByPath = new Map(plans.map((plan, index) => [plan.path, index]));
  const linkedEntries: LinkedPlan['entries'] = [];
  for (const entry of entries) {
    const module = moduleByPath.get(entry.module);
    if (module === undefined) {
      if (complete) {
        return {
          kind: LinkResultKind.Failed,
          diagnostics: [
            {
              module: entry.module,
              code: 'unresolved-entry',
              message: `Entry module "${entry.module}" is not among the linked plans.`,
            },
          ],
        };
      }
      continue;
    }
    if (entry.kind === EntryKind.Module) {
      linkedEntries.push({ kind: EntryKind.Module, module });
    } else {
      linkedEntries.push({
        kind: EntryKind.Export,
        module,
        export: entry.export,
        target: { ok: false, reason: { why: UnknownWhy.Opaque, code: 'mock-no-export-linking' } },
      });
    }
  }

  return {
    kind: LinkResultKind.Linked,
    plan: {
      format: PlanFormat.LinkedPlan,
      version: LINKED_PLAN_VERSION,
      specialization,
      complete,
      entries: linkedEntries,
      modules: plans.map(materializeModule),
      implementations: [],
      diagnostics: plans.flatMap((plan, module) =>
        plan.diagnostics.map((diagnostic) => ({ module, diagnostic }))
      ),
    },
  };
}

/** MOCK: 1:1 materialization — no folding, no cross-module facts yet. */
function materializeModule(plan: ModulePlan): LinkedModule {
  const programs: LinkedProgram[] = plan.programs.map((program) => ({
    ...program,
    facts: {
      needsId: { ok: true, value: program.needsId },
      waitForTasks: { ok: true, value: false },
      providesContextEffective: { ok: true, value: false },
      runtimeScope: { ok: true, value: false },
    },
  }));
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
    components: plan.components,
    hooks: plan.hooks,
    callables: plan.callables,
    values: plan.values,
    contexts: [],
    natives: [],
    defs: plan.defs,
    edges: plan.edges.map((edge) => ({
      ...edge,
      target: { ok: false, reason: { why: UnknownWhy.External } },
      runtime: false,
    })),
    exports: plan.exports,
    assembly: plan.assembly,
    diagnostics: plan.diagnostics,
  };
}
