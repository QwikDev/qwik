import {
  LINKED_PLAN_VERSION,
  BuildMode,
  Environment,
  PlanFormat,
  type LinkedPlan,
  type Specialization,
} from '../schema';

export { emptyPlan as emptyModulePlan } from '../analyse/plan';

export function serverSpecialization(): Specialization {
  return { environment: Environment.Server, mode: BuildMode.Prod, stripExports: [] };
}

export function emptyLinkedPlan(specialization: Specialization): LinkedPlan {
  return {
    format: PlanFormat.LinkedPlan,
    version: LINKED_PLAN_VERSION,
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
