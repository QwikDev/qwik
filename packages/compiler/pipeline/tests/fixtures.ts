import {
  BuildMode,
  Environment,
  ModuleKind,
  PlanFormat,
  type LinkedPlan,
  type ModulePlan,
  type Specialization,
} from '../schema';

export function emptyModulePlan(path: string): ModulePlan {
  return {
    format: PlanFormat.ModulePlan,
    version: 1,
    path,
    kind: ModuleKind.Qwik,
    source: { code: '', originalPath: path, normalizationMap: null },
    bindings: [],
    lifetimes: [],
    payloads: [],
    programs: [],
    qrls: [],
    components: [],
    hooks: [],
    callables: [],
    values: [],
    contexts: [],
    contextProviders: [],
    natives: [],
    defs: [],
    pluginSites: [],
    edges: [],
    imports: [],
    exports: [],
    assembly: [],
    diagnostics: [],
  };
}

export function serverSpecialization(): Specialization {
  return { environment: Environment.Server, mode: BuildMode.Prod, stripExports: [] };
}

export function emptyLinkedPlan(specialization: Specialization): LinkedPlan {
  return {
    format: PlanFormat.LinkedPlan,
    version: 1,
    specialization,
    complete: true,
    entries: [],
    modules: [],
    implementations: [],
    diagnostics: [],
  };
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
