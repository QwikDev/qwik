/** Pure module linking over plans and host-provided resolver/plugin snapshots. */
import {
  EntryKind,
  LINKED_PLAN_VERSION,
  LinkResultKind,
  PlanFormat,
  type LinkedPlan,
  type LinkResult,
  type ModulePlan,
  type Specialization,
} from '../schema';
import { linkRenderResults } from './render-results';
import { linkContent } from './link-content';
import { linkHookTwins } from './link-hooks';
import { resolveModules } from './resolve';
import { materializeModules } from './materialize';
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

  const resolution = resolveModules(plans, resolver, diagnostics);
  if (diagnostics.length > 0) {
    return failed(diagnostics);
  }
  const { qrlIndexes, importsByBinding, resolveLocalBinding } = resolution;
  const linkedModules = materializeModules(plans, resolution);
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
  if (complete && diagnostics.length > 0) {
    return failed(diagnostics);
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
  return { kind: LinkResultKind.Linked, plan };
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
