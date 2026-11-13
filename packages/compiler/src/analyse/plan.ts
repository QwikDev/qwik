import { MODULE_PLAN_VERSION, ModuleKind, PlanFormat, type ModulePlan } from '../schema';

export function emptyPlan(path: string, code = ''): ModulePlan {
  return {
    format: PlanFormat.ModulePlan,
    version: MODULE_PLAN_VERSION,
    path,
    kind: ModuleKind.Qwik,
    source: { code, originalPath: path, normalizationMap: null },
    bindings: [],
    lifetimes: [],
    payloads: [],
    programs: [],
    qrls: [],
    hooks: [],
    natives: [],
    defs: [],
    edges: [],
    imports: [],
    exports: [],
    assembly: [],
    diagnostics: [],
  };
}
