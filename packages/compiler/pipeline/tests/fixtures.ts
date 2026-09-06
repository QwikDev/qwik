import {
  LINKED_PLAN_VERSION,
  BuildMode,
  Environment,
  PlanFormat,
  type LinkedPlan,
  type Specialization,
} from '../schema';
import type { Program } from 'oxc-parser';
import { runInNewContext } from 'node:vm';
import { parseModule } from '../analyse/ast/parse';
import { createBindingGraph } from '../analyse/ast/bindings';
import { createLowerContext } from '../analyse/lower-context';
import { emptyPlan } from '../analyse/plan';

export { emptyPlan as emptyModulePlan };

export function loadChunkFunction(
  module: { path: string; code: string },
  captures: unknown[] = []
) {
  const declaration = parseModule(module.path, module.code).program.body.find(
    (statement) => statement.type === 'ExportNamedDeclaration'
  )?.declaration;
  if (declaration?.type !== 'VariableDeclaration') {
    throw new Error('expected an exported function');
  }
  const expression = declaration.declarations[0].init!;
  return runInNewContext(`(${module.code.slice(expression.start, expression.end)})`, {
    _captures: captures,
  });
}

export function createTestLowerContext(program: Program, source: string, path = 't.tsx') {
  const plan = emptyPlan(path, source);
  const bindings = createBindingGraph(program);
  plan.bindings = bindings.bindings;
  return { bindings, ctx: createLowerContext(plan, path, undefined, bindings) };
}

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
