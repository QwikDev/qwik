/** `analyseModule(file, options) -> ModulePlan` — one file, one plan, pure (DESIGN.md rule 7). */
import {
  AssemblyKind,
  BindingScope,
  BoundaryKind,
  DeclTable,
  SurfaceKind,
  DiagnosticCategory,
  FnBodyKind,
  ExportKind,
  ExportTargetKind,
  LifetimeCommit,
  LifetimeOwner,
  ModuleKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  type ComponentParameter,
  type Diagnostic,
  type ModulePlan,
} from '../schema';
import { createBindingGraph, type BindingGraph } from './ast/bindings';
import { createJsxAnalysis } from './ast/jsx-analysis';
import { findRuntimeJsx, findComponentCandidates } from './ast/returns-jsx';
import { parseModule } from './ast/parse';
import { scanModuleSurface } from './module-surface';
import { discoverComponents, type DiscoveredComponent } from './discover';
import { lowerSetup } from './lower-setup';
import { createLowerContext, pushQrl, QrlIdentityKind } from './lower-context';
import { lowerRenderExpression } from './lower-jsx';
import { normalizeSource } from './normalize';
import { emptyPlan } from './plan';
import { createOriginalRangeMapper } from '../../src/normalization';

import { InvalidModuleError, UnsupportedError } from '../errors';
import { allocateGeneratedName } from '../names';
import { QwikGenWord } from '../words';

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
  plan.source.normalizationMap = normalized.map as ModulePlan['source']['normalizationMap'];
  const finish = () => finishPlan(plan, normalized.code, input.code);
  if (normalized.errors.length > 0) {
    return finishPlan(failedPlan(plan, normalized.errors), normalized.code, input.code);
  }

  const parsed = parseModule(input.path, normalized.code);
  if (parsed.errors.length > 0) {
    return finishPlan(failedPlan(plan, parsed.errors), normalized.code, input.code);
  }

  const jsx = createJsxAnalysis();
  const candidates = findComponentCandidates(parsed.program, jsx);
  if (candidates.length === 0) {
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
      return finish();
    }
    // Non-Qwik module: authored source kept, transpiled at generate.
    const surfaceProgram =
      normalized.map === null ? parsed.program : parseModule(input.path, input.code).program;
    const surfaceBindings = createBindingGraph(surfaceProgram);
    plan.bindings = surfaceBindings.bindings;
    scanModuleSurface(surfaceProgram, null, plan, surfaceBindings);
    plan.kind = ModuleKind.Foreign;
    plan.source.normalizationMap = null;
    return plan;
  }

  const components = discoverComponents(candidates);
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
  const bindings = createBindingGraph(parsed.program);
  plan.bindings = bindings.bindings;
  plan.source.code = normalized.code;
  plan.lifetimes.push({
    id: 0,
    parent: null,
    owner: LifetimeOwner.Component,
    commit: LifetimeCommit.Immediate,
  });
  const authoredProgram =
    normalized.map === null ? null : parseModule(input.path, input.code).program;
  const coreBindings = scanModuleSurface(parsed.program, authoredProgram, plan, bindings);
  const authoredStatements = parsed.program.body.filter(
    (statement) => statement.type !== 'ImportDeclaration' && !componentStatements.has(statement)
  );
  const retainedBindings = new Set(
    bindings.freeReferences(authoredStatements).map((reference) => reference.binding)
  );
  for (const imported of plan.imports) {
    if (coreBindings.has(imported.binding) && retainedBindings.has(imported.binding)) {
      plan.assembly.push({
        a: AssemblyKind.Import,
        edge: imported.edge,
        binding: imported.binding,
      });
    }
  }
  const lowerContext = createLowerContext(
    plan,
    input.path,
    options.scope,
    bindings,
    coreBindings,
    jsx
  );
  for (const component of components) {
    const componentBinding =
      component.bindingNode === null ? null : bindings.declaration(component.bindingNode);
    const parameterSurface = lowerParameterSurface(component.param, bindings);
    lowerContext.propsBinding = parameterSurface?.binding ?? null;
    lowerContext.propsMembers = new Map(
      parameterSurface?.kind === SurfaceKind.Object
        ? parameterSurface.bindings.map(({ binding, name }) => [binding, name])
        : []
    );
    let rootOps;
    let setup;
    try {
      setup = lowerSetup(component.setupStatements, lowerContext);
      lowerContext.locals = setup.locals;
      rootOps = lowerRenderExpression(component.renderExpression, lowerContext);
    } catch (error) {
      if (error instanceof InvalidModuleError) {
        plan.kind = ModuleKind.Failed;
        plan.diagnostics.push({
          code: error.code,
          message: error.message,
          span: error.span,
          category: DiagnosticCategory.Error,
        });
        return finish();
      }
      throw error;
    }
    plan.programs.push({
      body: { kind: ProgramBodyKind.Ops, ops: rootOps },
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
    const parameter =
      parameterSurface === null
        ? null
        : { pattern: plan.payloads.length - 1, surface: parameterSurface };
    const body = component.fn.body!;
    // A component IS a QRL: a Program body plus an authored declaration to splice over.
    const { index: qrlIndex } = pushQrl(lowerContext, {
      identity: {
        kind: QrlIdentityKind.Declared,
        id: `${input.path}#${component.name}`,
        name: component.name,
      },
      ctxName: component.name,
      boundary: { kind: BoundaryKind.Component },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program: plan.programs.length - 1 },
      captures: [],
      params: { authored: component.param === null ? 0 : 1, used: [], sources: [] },
      origin: {
        range: [component.statement.start, component.statement.end],
        functionRange: [component.fn.start, component.fn.end],
        calleeRange: null,
        argumentRanges: [],
        paramRanges: component.param === null ? [] : [component.param.range],
        bodyRange: [body.start, body.end],
        bodyKind: body.type === 'BlockStatement' ? FnBodyKind.Block : FnBodyKind.Expression,
      },
      declaration: {
        name: component.name,
        binding: componentBinding,
        parameter,
        root: { name: `q${component.name}-` },
        replacementRange: [component.statement.start, component.statement.end],
        declarationKind: component.declarationKind,
        isExported:
          component.statement.type === 'ExportNamedDeclaration' ||
          component.statement.type === 'ExportDefaultDeclaration',
        localName: componentBinding === null ? null : plan.bindings[componentBinding].name,
      },
    });
    if (componentBinding === null) {
      const componentExport = plan.exports.find(
        (entry): entry is Extract<(typeof plan.exports)[number], { e: ExportKind.Local }> =>
          entry.e === ExportKind.Local && entry.exported === component.name
      )!;
      componentExport.target = {
        t: ExportTargetKind.Declaration as const,
        table: DeclTable.Qrls,
        index: qrlIndex,
      };
    }
    plan.assembly.push({ a: AssemblyKind.Splice, qrl: qrlIndex });
  }
  return finish();
}

function lowerParameterSurface(
  parameter: DiscoveredComponent['param'],
  bindings: BindingGraph
): ComponentParameter['surface'] | null {
  if (parameter === null) {
    return null;
  }
  if (parameter.node.type === 'Identifier') {
    return { kind: SurfaceKind.Identifier, binding: bindings.declaration(parameter.node)! };
  }
  const members = parameter.members!;
  const binding = members.some((member) => member.name !== 'children')
    ? bindings.addSynthetic(
        allocateGeneratedName(
          QwikGenWord.ComponentProps,
          bindings.bindings.map((binding) => binding.name)
        ),
        BindingScope.Param
      )
    : null;
  return {
    kind: SurfaceKind.Object,
    binding,
    bindings: members.map(({ node, name }) => ({ binding: bindings.declaration(node)!, name })),
  };
}

function finishPlan(plan: ModulePlan, normalizedCode: string, authoredCode: string): ModulePlan {
  if (plan.source.normalizationMap === null || normalizedCode === authoredCode) {
    return plan;
  }
  const mapRange = createOriginalRangeMapper(
    normalizedCode,
    authoredCode,
    plan.source.normalizationMap as Parameters<typeof createOriginalRangeMapper>[2]
  );
  for (const edge of plan.edges) {
    if (edge.ownerRange[0] !== edge.ownerRange[1]) {
      edge.authoredOwnerRange = mapRange(edge.ownerRange);
      edge.authoredSourceRange = mapRange(edge.sourceRange);
    }
  }
  for (const imported of plan.imports) {
    if (imported.specifierRange[0] !== imported.specifierRange[1]) {
      imported.authoredSpecifierRange = mapRange(imported.specifierRange);
      imported.authoredImportedRange = mapRange(imported.importedRange);
    }
  }
  plan.diagnostics = plan.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    span: diagnostic.span === null ? null : mapRange(diagnostic.span),
  }));
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
