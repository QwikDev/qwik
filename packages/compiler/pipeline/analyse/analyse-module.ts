/** `analyseModule(file, options) -> ModulePlan` — one file, one plan, pure (DESIGN.md rule 7). */
import {
  AssemblyKind,
  BindingScope,
  BoundaryKind,
  SurfaceKind,
  DeclarationKind,
  DiagnosticCategory,
  FnBodyKind,
  LifetimeCommit,
  LifetimeOwner,
  ModuleKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  type Diagnostic,
  type ModulePlan,
} from '../schema';
import { collectBindingNames } from './ast/bindings';
import { findRuntimeJsx, hasComponentCandidates } from './ast/returns-jsx';
import { parseModule } from './ast/parse';
import { scanCoreImports } from './core-imports';
import { discoverComponents } from './discover';
import { lowerSetup } from './lower-setup';
import { createLowerContext } from './lower-context';
import { lowerJsx } from './lower-jsx';
import { normalizeSource } from './normalize';
import { emptyPlan } from './plan';

import { InvalidModuleError, UnsupportedError } from '../errors';

export interface AnalyseOptions {
  transpileTs?: boolean;
  rootDir?: string;
  /** Identity-affecting: feeds QRL naming/hashing. */
  scope?: string;
}

export interface AnalyseInput {
  path: string;
  code: string;
  devPath?: string;
}

export async function analyseModule(
  input: AnalyseInput,
  options: AnalyseOptions
): Promise<ModulePlan> {
  const plan = emptyPlan(input.path, input.code);
  const normalized = await normalizeSource(input.path, input.code, options);
  if (normalized.errors.length > 0) {
    return failedPlan(plan, normalized.errors);
  }

  const parsed = parseModule(input.path, normalized.code);
  if (parsed.errors.length > 0) {
    return failedPlan(plan, parsed.errors);
  }

  if (!hasComponentCandidates(parsed.program)) {
    const leftoverJsx = findRuntimeJsx(parsed.program);
    if (leftoverJsx !== null) {
      // Fail closed — the foreign fallback would compile this JSX against react/jsx-runtime.
      plan.kind = ModuleKind.Failed;
      plan.diagnostics.push({
        code: 'unsupported-runtime-jsx',
        message: 'JSX must belong to a supported component or resumable boundary.',
        span: [leftoverJsx.start, leftoverJsx.end],
        category: DiagnosticCategory.Error,
      });
      return plan;
    }
    // Non-Qwik module: authored source kept, transpiled at generate.
    plan.kind = ModuleKind.Foreign;
    return plan;
  }

  const components = discoverComponents(parsed.program);
  const componentStatements = new Set(components.map((component) => component.statement));
  for (const statement of parsed.program.body as unknown[]) {
    if (!componentStatements.has(statement as never)) {
      const leftover = findRuntimeJsx(statement);
      if (leftover !== null) {
        throw new UnsupportedError('JSX outside the discovered components');
      }
    }
  }

  plan.kind = ModuleKind.Qwik;
  plan.bindings = collectBindingNames(parsed.program).map((name, id) => ({
    id,
    name,
    scope: BindingScope.Module,
    varKind: null,
    declarationRange: null,
  }));
  plan.source.code = normalized.code;
  plan.lifetimes.push({
    id: 0,
    parent: null,
    owner: LifetimeOwner.Component,
    commit: LifetimeCommit.Immediate,
  });
  const coreBindings = scanCoreImports(
    parsed.program,
    plan,
    plan.bindings.map((binding) => binding.name)
  );
  const lowerContext = createLowerContext(plan, input.path, options.scope, coreBindings);
  for (const component of components) {
    lowerContext.propsParamName = component.param?.name ?? null;
    let rootOp;
    let setup;
    try {
      setup = lowerSetup(component.setupStatements, lowerContext);
      lowerContext.locals = setup.locals;
      rootOp = lowerJsx(component.jsx, lowerContext);
    } catch (error) {
      if (error instanceof InvalidModuleError) {
        plan.kind = ModuleKind.Failed;
        plan.diagnostics.push({
          code: error.code,
          message: error.message,
          span: error.span,
          category: DiagnosticCategory.Error,
        });
        return plan;
      }
      throw error;
    }
    plan.programs.push({
      body: { kind: ProgramBodyKind.Ops, ops: [rootOp] },
      setup: setup.setup,
      params: [],
      lifetime: 0,
      needsId: false,
      async: false,
    });
    if (component.param !== null) {
      plan.payloads.push({
        range: component.param.range,
        constants: [],
        qrls: [],
        reads: [],
        awaits: [],
        useIds: [],
        renders: [],
        temps: [],
      });
    }
    // A component IS a QRL: a Program body plus an authored declaration to splice over.
    plan.qrls.push({
      id: `${input.path}#${component.name}`,
      parent: null,
      name: component.name,
      ctxName: component.name,
      boundary: { kind: BoundaryKind.Component },
      markerAttributes: [],
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program: plan.programs.length - 1 },
      captures: [],
      params: { authored: component.param === null ? 0 : 1, used: [], sources: [] },
      origin: {
        range: [component.statement.start, component.statement.end],
        functionRange: [component.arrow.start, component.arrow.end],
        calleeRange: null,
        argumentRanges: [],
        paramRanges: component.param === null ? [] : [component.param.range],
        bodyRange: [component.arrow.body.start, component.arrow.body.end],
        bodyKind:
          component.arrow.body.type === 'BlockStatement' ? FnBodyKind.Block : FnBodyKind.Expression,
      },
      propsParts: [],
      declaration: {
        name: component.name,
        binding: null,
        parameter:
          component.param === null
            ? null
            : {
                pattern: plan.payloads.length - 1,
                surface: {
                  kind: SurfaceKind.Identifier,
                  binding: plan.bindings.findIndex(
                    (binding) => binding.name === component.param!.name
                  ),
                },
              },
        root: { name: `q${component.name}-` },
        replacementRange: [component.statement.start, component.statement.end],
        declarationKind: component.declarationKind,
        localName: component.declarationKind === DeclarationKind.Const ? component.name : null,
      },
    });
    plan.assembly.push({ a: AssemblyKind.Splice, qrl: plan.qrls.length - 1 });
  }
  return plan;
}

function failedPlan(plan: ModulePlan, errors: { message?: string }[]): ModulePlan {
  plan.kind = ModuleKind.Failed;
  plan.diagnostics.push(
    ...errors.map(
      (error): Diagnostic => ({
        code: 'parse-error',
        message: error.message ?? 'Unable to parse module',
        span: null,
        category: DiagnosticCategory.Error,
      })
    )
  );
  return plan;
}
