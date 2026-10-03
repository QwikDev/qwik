/** Pure module linking over plans and host-provided resolver/plugin snapshots. */
import {
  DiagnosticCategory,
  EntryKind,
  LINKED_PLAN_VERSION,
  ModuleKind,
  LinkResultKind,
  PlanFormat,
  type LinkedPlan,
  type LinkResult,
  type ModulePlan,
  type Specialization,
} from '../schema';
import { linkRenderResults } from './render-results';
import { linkContent } from './link-content';
import { linkEffects } from './link-effects';
import { linkComponentReferences } from './component-references';
import { linkHookTwins } from './link-hooks';
import { resolveModules } from './resolve';
import { materializeModules } from './materialize';
import { foldBranches } from './branches';
import { reportJsHoles } from './js-holes';
import { foldConstants } from './constants';
import { applyStripping } from './strip';
import { markReachable, resolveEntries } from './reachability';

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

export type LinkEntry =
  | { kind: EntryKind.Module; module: string; exposeExports?: boolean }
  | { kind: EntryKind.Export; module: string; export: string };

export type LinkDiagnostic = Extract<
  LinkResult,
  { kind: LinkResultKind.Failed }
>['diagnostics'][number];

export function linkPlans(
  plans: readonly ModulePlan[],
  entries: readonly LinkEntry[],
  specialization: Specialization,
  resolver: ResolverSnapshot,
  complete: boolean
): LinkResult {
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

  const resolution = resolveModules(plans, resolver, diagnostics);
  if (diagnostics.length > 0) {
    return failed(diagnostics, plans);
  }
  const { qrlIndexes, importsByBinding, resolveLocalBinding } = resolution;
  const linkedModules = materializeModules(plans, resolution);
  foldConstants(linkedModules, specialization);
  foldBranches(linkedModules, specialization);
  reportJsHoles(linkedModules, specialization);
  applyStripping(linkedModules, specialization);
  const linkedEntries = resolveEntries(plans, entries, resolution, diagnostics);
  const visited = markReachable(
    plans,
    linkedModules,
    linkedEntries,
    resolution,
    complete,
    diagnostics
  );
  linkedModules.forEach((module) => linkHookTwins(module, diagnostics));
  // A refused reference is known, not missing, so it fails an incomplete link too.
  const refused = linkComponentReferences(plans, linkedModules, resolveLocalBinding);
  if (refused.length > 0) {
    return failed(refused, plans);
  }
  if (complete && diagnostics.length > 0) {
    return failed(diagnostics, plans);
  }
  const plan: LinkedPlan = {
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
  };
  linkRenderResults(plan, visited, qrlIndexes, importsByBinding, resolveLocalBinding);
  plan.modules.forEach(linkContent);
  plan.modules.forEach(linkEffects);
  return { kind: LinkResultKind.Linked, plan };
}

/**
 * A module that failed analysis has no exports to link, so the edge errors its importers report are
 * consequences. Its own diagnostic rides along, or the failure names every module but the cause.
 */
function failed(diagnostics: LinkDiagnostic[], plans: readonly ModulePlan[] = []): LinkResult {
  const causes = plans.flatMap((plan): LinkDiagnostic[] =>
    plan.kind === ModuleKind.Failed
      ? plan.diagnostics
          .filter((diagnostic) => diagnostic.category === DiagnosticCategory.Error)
          .map(({ code, message }) => ({ module: plan.path, code, message }))
      : []
  );
  const unique = new Map<string, LinkDiagnostic>();
  for (const diagnostic of [...causes, ...diagnostics]) {
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
