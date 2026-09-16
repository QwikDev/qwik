/** `analyseModule(file, options) -> ModulePlan` — one file, one plan, pure (DESIGN.md rule 7). */
import {
  AssemblyKind,
  BoundaryKind,
  DeclTable,
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
  type Diagnostic,
  type ModulePlan,
} from '../schema';
import { createBindingGraph } from './ast/bindings';
import { createJsxAnalysis } from './ast/jsx-analysis';
import { findComponentCandidates, findHookCandidates } from './ast/returns-jsx';
import { lowerCoreHookAliases, lowerHooks } from './lower-hook';
import { parseModule } from './ast/parse';
import { scanModuleSurface } from './module-surface';
import { discoverComponents } from './discover';
import { childrenReadError, lowerComponentParameter } from './lower-parameter';
import { finalizeLocalFunctions, lowerSetup } from './lower-setup';
import {
  createLowerContext,
  pushPayload,
  pushQrl,
  QrlIdentityKind,
  type LowerContext,
} from './lower-context';
import { lowerRenderExpression } from './lower-jsx';
import { normalizeSource } from './normalize';
import { emptyPlan } from './plan';
import { createOriginalRangeMapper } from '../../src/normalization';

import { isFunctionLike } from './ast/utils';
import { explicitQrlRoots, recordFunctionJsx, recordPayloadQrls } from './lower-function';
import { createSegmentSymbolName, sanitizeSegmentName } from '../segment-identity';
import { InvalidModuleError, UnsupportedError } from '../errors';
import type { Node } from 'oxc-parser';
import { recordBindingResults } from './results';
import { recordTypeContracts } from './type-results';

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

  const bindings = createBindingGraph(parsed.program);
  plan.bindings = bindings.bindings;
  const authoredProgram =
    normalized.map === null ? null : parseModule(input.path, input.code).program;
  const coreBindings = scanModuleSurface(parsed.program, authoredProgram, plan, bindings);
  const jsx = createJsxAnalysis(bindings, coreBindings);
  const candidates = findComponentCandidates(parsed.program, jsx, bindings, coreBindings);
  const components = discoverComponents(candidates);
  const componentStatements = new Set(components.map((component) => component.statement));
  const authoredStatements: Node[] = parsed.program.body.flatMap((statement): Node[] => {
    if (statement.type === 'ImportDeclaration') {
      return [];
    }
    if (!componentStatements.has(statement)) {
      return [statement];
    }
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    return declaration?.type === 'VariableDeclaration'
      ? declaration.declarations.filter(
          (declarator) => !components.some((component) => component.bindingNode === declarator.id)
        )
      : [];
  });
  const lowerContext = createLowerContext(
    plan,
    input.path,
    options.scope,
    bindings,
    coreBindings,
    jsx
  );
  let loweredHooks: Set<Node>;
  try {
    loweredHooks = lowerHooks(
      findHookCandidates(parsed.program, bindings).filter(
        (hook) => !candidates.some((candidate) => candidate.fn === hook.fn)
      ),
      lowerContext
    );
    lowerCoreHookAliases(parsed.program, lowerContext);
  } catch (error) {
    recordModuleError(plan, error);
    return finish();
  }
  const jsxRoots = jsx.scopedRoots(authoredStatements).filter((root) => !loweredHooks.has(root));
  const helperRoots = [
    ...jsxRoots,
    ...explicitQrlRoots(authoredStatements, lowerContext).filter(
      (root) => !(jsxRoots as readonly Node[]).includes(root) && !loweredHooks.has(root)
    ),
  ];
  const leftoverJsx = jsxRoots.find((root) => !isFunctionLike(root));
  if (leftoverJsx !== undefined) {
    if (candidates.length === 0) {
      // Fail closed — the foreign fallback would compile this JSX against react/jsx-runtime.
      plan.kind = ModuleKind.Failed;
      plan.diagnostics.push({
        code: 'unsupported-runtime-jsx',
        message: 'JSX must belong to a supported component or function.',
        span: [leftoverJsx.start, leftoverJsx.end],
        category: DiagnosticCategory.Error,
      });
      return finish();
    }
    throw new UnsupportedError('JSX outside the discovered components');
  }
  if (candidates.length === 0 && helperRoots.length === 0 && plan.hooks.length === 0) {
    // Non-Qwik module: authored source kept, transpiled at generate.
    if (authoredProgram !== null) {
      const foreignPlan = emptyPlan(input.path, input.code);
      const surfaceBindings = createBindingGraph(authoredProgram);
      foreignPlan.bindings = surfaceBindings.bindings;
      const foreignCore = scanModuleSurface(authoredProgram, null, foreignPlan, surfaceBindings);
      recordTypeContracts(foreignPlan, authoredProgram, input.code, surfaceBindings);
      recordBindingResults(
        createLowerContext(foreignPlan, input.path, options.scope, surfaceBindings, foreignCore)
      );
      foreignPlan.kind = ModuleKind.Foreign;
      return foreignPlan;
    }
    plan.kind = ModuleKind.Foreign;
    plan.source.normalizationMap = null;
    recordTypeContracts(plan, parsed.program, input.code, bindings);
    recordBindingResults(
      createLowerContext(plan, input.path, options.scope, bindings, coreBindings, jsx)
    );
    return plan;
  }

  plan.kind = ModuleKind.Qwik;
  plan.source.code = normalized.code;
  recordTypeContracts(
    plan,
    authoredProgram ?? parsed.program,
    input.code,
    authoredProgram === null ? bindings : undefined
  );
  plan.lifetimes.push({
    id: 0,
    parent: null,
    owner: LifetimeOwner.Component,
    commit: LifetimeCommit.Immediate,
  });
  try {
    for (const root of helperRoots) {
      const payload = pushPayload(lowerContext, [root.start, root.end]);
      recordPayloadQrls(lowerContext, payload, root);
      if (isFunctionLike(root)) {
        recordFunctionJsx(lowerContext, payload, root);
      }
      plan.assembly.push({ a: AssemblyKind.Payload, payload });
    }
  } catch (error) {
    recordModuleError(plan, error);
    return finish();
  }
  // Compiled hook bodies are emitted from their setup and extracted markers are replaced, so
  // references inside them retain no authored import.
  const replacedRanges = [
    ...plan.assembly.flatMap((intent) =>
      intent.a === AssemblyKind.Hook ? [plan.hooks[intent.hook].range] : []
    ),
    ...plan.payloads.flatMap((payload) =>
      payload.qrls.map((entry) => entry.marker?.calleeRange ?? entry.range)
    ),
  ];
  const retainedBindings = new Set(
    bindings
      .freeReferences([
        ...authoredStatements,
        ...components.flatMap(({ param }) => (param === null ? [] : [param.node])),
      ])
      .filter(
        ({ node }) => !replacedRanges.some(([start, end]) => node.start >= start && node.end <= end)
      )
      .map((reference) => reference.binding)
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
  for (const component of components) {
    const componentBinding =
      component.bindingNode === null ? null : bindings.declaration(component.bindingNode);
    let loweredParameter;
    let rootOps;
    let setup;
    try {
      loweredParameter = lowerComponentParameter(component, lowerContext);
      diagnoseChildrenReads(lowerContext);
      lowerContext.styleScopes = [];
      setup = lowerSetup(component.setupStatements, lowerContext, loweredParameter.locals);
      lowerContext.locals = setup.locals;
      rootOps =
        component.renderExpression === null
          ? []
          : lowerRenderExpression(component.renderExpression, lowerContext);
    } catch (error) {
      recordModuleError(plan, error);
      return finish();
    }
    plan.programs.push({
      body: { kind: ProgramBodyKind.Ops, ops: rootOps },
      setup: [...loweredParameter.setup, ...setup.setup],
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
      loweredParameter.surface === null
        ? null
        : { pattern: plan.payloads.length - 1, surface: loweredParameter.surface };
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
        replacementRange: component.replacementRange,
        ...(component.expressionOnly ? { expressionOnly: true } : {}),
        declarationKind: component.declarationKind,
        isExported:
          component.statement.type === 'ExportNamedDeclaration' ||
          component.statement.type === 'ExportDefaultDeclaration',
        localName: componentBinding === null ? null : plan.bindings[componentBinding].name,
        ...(component.expressionOnly
          ? {}
          : {
              symbol: createSegmentSymbolName(
                lowerContext.sourceIdentity,
                `${sanitizeSegmentName(component.name)}_component`,
                'component'
              ),
            }),
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
  finalizeLocalFunctions(lowerContext);
  recordBindingResults(lowerContext);
  return finish();
}

function diagnoseChildrenReads(ctx: LowerContext): void {
  if (ctx.propsBinding === null) {
    return;
  }
  for (const { node } of ctx.bindings.referencesOf(ctx.propsBinding)) {
    const parent = ctx.bindings.parentOf(node);
    if (
      parent?.type === 'MemberExpression' &&
      !parent.computed &&
      parent.object === node &&
      parent.property.type === 'Identifier' &&
      parent.property.name === 'children'
    ) {
      throw childrenReadError([parent.start, parent.end]);
    }
  }
}

function recordModuleError(plan: ModulePlan, error: unknown): void {
  if (!(error instanceof InvalidModuleError)) {
    throw error;
  }
  plan.kind = ModuleKind.Failed;
  plan.diagnostics.push({
    code: error.code,
    message: error.message,
    span: error.span,
    category: DiagnosticCategory.Error,
  });
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
