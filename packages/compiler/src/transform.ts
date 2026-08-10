import type { Diagnostic, SegmentAnalysis, TransformModule } from '@qwik.dev/optimizer';
import type { ImportDeclaration, Program } from 'oxc-parser';
import { getIdentifierName, getRange, unwrapExpression, visit } from './ast-utils';
import type { AstNode } from './types';
import { createModule } from './module-utils';
import { createOriginalRangeMapper } from './normalization';
import type { CompilerContext, SourceRange } from './types';
import { analyzeModule } from './analysis';
import {
  createAsyncForDiagnostic,
  createCustomHookDiagnostic,
  createKeylessCollectionDiagnostic,
  createImplicitDollarArgumentDiagnostic,
  createModuleWriteDiagnostic,
  createRefDiagnostic,
  createScopedStyleContentDiagnostic,
  createStyleHookDiagnostic,
  createTransformFailureDiagnostic,
  createUnsupportedComponentShapeDiagnostic,
  createUnsupportedBoundaryShapeDiagnostic,
  createUnsupportedRuntimeJsxDiagnostic,
  createUseIdDiagnostic,
  validateImplicitDollarImplementations,
  validateModule,
  validateSerializableCaptures,
} from './transform-diagnostics';
import { createComponentDefinition, discoverComponentCandidates } from './discover';
import { emitCsrModule, emitCsrSegmentRender } from '../generators/js/csr/emit-csr';
import { collectNativeMarkers, nativePluginFns, type NativeMarker } from './native-lower';
import { emitSsrOpPlan, findWireBlock, type PlanSsrComponent } from './emit-plan-ssr';
import {
  emitModulePlan,
  type PlanHookCall,
  type PlanHookMeta,
  type PlanImportMeta,
} from './emit-plan';
import { validateNativeReadiness } from './validate-native';
import { collectModuleDefs } from './defs-lower';
import type { EmittedModule } from './emitted-module';
import { TargetImportResolver } from './emit-qrl';
import {
  emitBindingImport,
  emitSegmentModules,
  type SegmentComponentImport,
} from '../generators/js/shared/emit-segment';
import { getTargetModuleReferences, shouldEmitSegmentModule } from './segment-plan';
import {
  emitSsrModule,
  emitSsrSegmentRender,
  lastUngeneratedReason,
  type SsrPlanData,
} from '../generators/js/ssr/emit-ssr';
import { extractQrls, isSetupQrlSegment } from './extract';
import {
  createCsrComponentCardinalityResolver,
  planCsr,
  planCsrRenderFunction,
  type CsrComponentCardinalityResolver,
} from '../generators/js/csr/plan-csr';
import {
  createSsrComponentReturnModeResolver,
  planSsr,
  planSsrRenderFunction,
  type SsrComponentReturnModeResolver,
} from './plan-ssr';
import { lowerComponentResult } from './lower';
import { lowerSemanticModulePlan, type SemanticLowerFailure } from './semantic-lower';
import { assembleGeneratedModule, assembleModule, type RangeReplacement } from './module-assembly';
import { analyzeComponentShape } from './shape';
import type {
  BindingId,
  BindingInfo,
  ModuleAnalysis,
  ModuleBoundaryPlan,
  ModuleDeclaration,
  RenderNodePlan,
  RenderPlan,
  RenderFunctionPlan,
  SetupPlan,
  ComponentDefinition,
  ComponentOutput,
  InlineComponentReferencePlan,
  TransformResult,
  SegmentPlan,
} from './plan-types';
import {
  getSegmentDisplayName,
  createSegmentSourceIdentity,
  createSegmentSymbolName,
  getSegmentSymbolHash,
} from './segment-identity';
import { QWIK_IMPORT, QwikGenWord, type GeneratedNames } from './words';
import {
  createModuleBoundaryPlan,
  findInvalidModuleSetupHook,
  findInvalidModuleStyleBoundary,
  findUnsupportedModuleBoundaryJsx,
} from './segment-plan';

interface LocalComponentModule {
  readonly output: ComponentOutput;
  readonly name: string;
  readonly path: string;
  readonly importPath: string;
}

interface MarkerImportRetarget {
  readonly targetName: string;
  readonly localName: string;
}

export function transformModule(ctx: CompilerContext): TransformResult {
  const program = ctx.program;
  if (program === null) {
    return { kind: 'not-applicable' };
  }
  const analysis = analyzeModule(program);
  const extractedQrls = extractQrls(program, ctx.input.path, analysis, ctx.options.scope);
  extractedQrls.moduleDefs = collectModuleDefs(program, analysis, {
    modulePath: ctx.input.path,
    bindingIdAt: (range) =>
      range === null
        ? null
        : (analysis.references.find(
            (reference) => reference.range[0] === range[0] && reference.range[1] === range[1]
          )?.bindingId ??
          analysis.bindings.find(
            (binding) =>
              binding.declarationRange !== null &&
              binding.declarationRange[0] === range[0] &&
              binding.declarationRange[1] === range[1]
          )?.id ??
          null),
    isSourceBinding: () => false,
    isFunctionBinding: () => false,
  });
  const candidates = discoverComponentCandidates(program, analysis);
  if (analysis.moduleJsxRange !== null) {
    return {
      kind: 'failure',
      diagnostics: [
        createUnsupportedRuntimeJsxDiagnostic(
          ctx.input.path,
          ctx.input.code,
          analysis.moduleJsxRange
        ),
      ],
    };
  }
  // native$ markers must be stripped and collected even in a module with no components
  const native = collectNativeMarkers(program, analysis, ctx.input.code);
  if (native.diagnostics.length > 0) {
    return transformFailure(ctx, native.diagnostics[0].range, native.diagnostics[0].message);
  }
  if (
    candidates.length === 0 &&
    native.markers.length === 0 &&
    extractedQrls.invalidBoundaries.length === 0 &&
    !extractedQrls.segments.some((segment) => segment.parentId === null && segment.qrl !== null) &&
    analysis.jsxFunctionRanges.length === 0 &&
    analysis.moduleArgumentJsxRanges.length === 0
  ) {
    return { kind: 'not-applicable' };
  }

  const components: ComponentDefinition[] = [];
  const shapeDiagnostics: Diagnostic[] = [];
  for (const candidate of candidates) {
    const result = analyzeComponentShape(candidate.fn, candidate.plan.bindingId, analysis);
    if (result.kind === 'failure') {
      shapeDiagnostics.push(
        createUnsupportedComponentShapeDiagnostic(
          ctx.input.path,
          ctx.input.code,
          result.range,
          result.message
        )
      );
    } else {
      components.push(createComponentDefinition(candidate, result.shape));
    }
  }
  if (shapeDiagnostics.length > 0) {
    return { kind: 'failure', diagnostics: shapeDiagnostics };
  }

  if (extractedQrls.invalidBoundaries.length > 0) {
    return {
      kind: 'failure',
      diagnostics: extractedQrls.invalidBoundaries.map((boundary) =>
        createImplicitDollarArgumentDiagnostic(
          ctx.input.path,
          ctx.input.code,
          boundary.range,
          boundary.message
        )
      ),
    };
  }
  const discoveredModuleBoundaries = createModuleBoundaryPlan(
    extractedQrls,
    components.map((component) => component.replacementRange),
    program
  );
  const invalidModuleStyle = findInvalidModuleStyleBoundary(
    program,
    discoveredModuleBoundaries,
    analysis
  );
  if (invalidModuleStyle !== null) {
    return {
      kind: 'failure',
      diagnostics: [
        createStyleHookDiagnostic(
          ctx.input.path,
          ctx.input.code,
          invalidModuleStyle.range,
          invalidModuleStyle.message
        ),
      ],
    };
  }
  const invalidModuleSetupHook = findInvalidModuleSetupHook(
    program,
    discoveredModuleBoundaries,
    analysis
  );
  if (invalidModuleSetupHook !== null) {
    return {
      kind: 'failure',
      diagnostics: [
        createCustomHookDiagnostic(
          ctx.input.path,
          ctx.input.code,
          invalidModuleSetupHook.range,
          `${invalidModuleSetupHook.hook}() is only supported in linear component or custom-hook setup.`
        ),
      ],
    };
  }
  const loweredModuleBoundaries = lowerSemanticModulePlan(
    program,
    discoveredModuleBoundaries,
    extractedQrls
  );
  if (loweredModuleBoundaries.kind === 'failure') {
    const semanticDiagnostic = createSemanticLowerDiagnostic(ctx, loweredModuleBoundaries);
    return {
      kind: 'failure',
      diagnostics: [
        semanticDiagnostic ??
          createUnsupportedBoundaryShapeDiagnostic(
            ctx.input.path,
            ctx.input.code,
            loweredModuleBoundaries.range,
            loweredModuleBoundaries.message
          ),
      ],
    };
  }
  const moduleBoundaries = loweredModuleBoundaries.plan;
  const unsupportedBoundaryJsx = findUnsupportedModuleBoundaryJsx(program, moduleBoundaries);
  if (unsupportedBoundaryJsx !== null) {
    return {
      kind: 'failure',
      diagnostics: [
        createUnsupportedBoundaryShapeDiagnostic(
          ctx.input.path,
          ctx.input.code,
          unsupportedBoundaryJsx,
          'JSX in this module boundary has no supported render owner.'
        ),
      ],
    };
  }
  let outputs: ComponentOutput[] = [];
  for (const component of components) {
    const lowered = lowerComponentResult(component, extractedQrls, analysis);
    if (lowered.kind === 'failure') {
      const semanticDiagnostic = createSemanticLowerDiagnostic(ctx, lowered);
      if (semanticDiagnostic !== null) {
        return {
          kind: 'failure',
          diagnostics: [semanticDiagnostic],
        };
      }
      return transformFailure(
        ctx,
        lowered.range,
        lowered.message ||
          `Qualified component "${component.exportName}" could not be lowered by the compiler.`
      );
    }
    outputs.push({ component, result: lowered.plan });
  }
  outputs = propagateComponentIdRequirements(outputs, analysis);
  const componentCardinality = createCsrComponentCardinalityResolver(outputs);
  const componentReturnMode = createSsrComponentReturnModeResolver(outputs);
  const allSegments = uniqueSegments([
    ...outputs.flatMap((output) => output.result.segments),
    ...moduleBoundaries.segments,
  ]);
  const segments = collectReachableSegments(
    outputs,
    moduleBoundaries.roots.map((root) => root.segmentId),
    moduleBoundaries.functions,
    allSegments,
    ctx.emitTarget,
    ctx.input.code,
    componentCardinality,
    componentReturnMode
  );
  if (segments === null) {
    return transformFailure(ctx, null, 'The compiler could not plan reachable segments.');
  }
  const diagnostics = [
    ...validateModule(ctx.input.code, ctx.input.path, components, extractedQrls),
    ...validateImplicitDollarImplementations(
      ctx.input.path,
      ctx.input.code,
      analysis,
      segments,
      ctx.emitTarget
    ),
    ...validateSerializableCaptures(ctx.input.path, ctx.input.code, program, analysis, segments),
    ...validateCollectionKeys(ctx.input.path, ctx.input.code, outputs),
    ...(ctx.emitTarget === 'ssr' &&
    typeof (ctx.options as { nativeTarget?: string }).nativeTarget === 'string'
      ? validateNativeReadiness(ctx.input.path, ctx.input.code, outputs, componentReturnMode)
      : []),
  ];
  if (diagnostics.some((item) => item.category !== 'warning')) {
    return { kind: 'failure', diagnostics };
  }
  ctx.diagnostics.push(...diagnostics);

  const referencedComponents = new Set([
    ...outputs.flatMap((output) => collectPlanComponentBindingIds(output.result, analysis)),
    ...moduleBoundaries.segments.flatMap((segment) =>
      segment.embeddedRenders.flatMap((render) =>
        collectComponentBindingIds(render.render, analysis)
      )
    ),
    ...moduleBoundaries.functions.flatMap((fn) =>
      fn.renders.flatMap((render) => collectComponentBindingIds(render.render, analysis))
    ),
  ]);
  const componentOutputs = outputs.filter(
    (output) =>
      output.component.bindingId === null ||
      (output.component.bindingId !== null &&
        output.component.exported &&
        output.component.exportName !== 'default' &&
        output.component.localName !== null &&
        referencedComponents.has(output.component.bindingId))
  );
  const componentOutputSet = new Set(componentOutputs);
  const mainOutputs = outputs.filter((output) => !componentOutputSet.has(output));
  const explicitExtensions = ctx.options.explicitExtensions === true;
  const componentModules = componentOutputs.map<LocalComponentModule>((output) => {
    const name =
      output.component.localName ?? `inline_component_${output.component.replacementRange[0]}`;
    const path = `${ctx.input.path}_component_${name}.js`;
    return {
      output,
      name,
      path,
      importPath: `./${basename(path).slice(0, -3)}${explicitExtensions ? '.js' : ''}`,
    };
  });
  const componentByBinding = new Map(
    componentModules.flatMap((component) =>
      component.output.component.bindingId === null
        ? []
        : [[component.output.component.bindingId, component] as const]
    )
  );
  const boundNames = analysis.bindings.map((binding) => binding.name);
  const generatedNames: GeneratedNames = {
    props: allocateGeneratedName('props', boundNames),
    ctx: allocateGeneratedName('ctx', boundNames),
    invokeCtx: allocateGeneratedName(QwikGenWord.InvokeContext, boundNames),
  };
  const componentImports = new Map<BindingId, SegmentComponentImport>(
    componentModules.flatMap((component) =>
      component.output.component.bindingId === null
        ? []
        : [
            [
              component.output.component.bindingId,
              { path: component.importPath, importedName: component.name },
            ] as const,
          ]
    )
  );
  const inlineComponents: InlineComponentReferencePlan[] = componentModules.flatMap((component) =>
    component.output.component.bindingId === null
      ? [
          {
            symbolName: component.name,
            importPath: component.importPath,
            replacementRange: component.output.component.replacementRange,
            captureNames: component.output.result.captures.map((capture) => capture.name),
          },
        ]
      : []
  );

  // a capture-free QRL segment writing module state keeps its implementation in the origin
  // module, where the assignment is legal; the chunk becomes a re-export shim
  for (const segment of segments) {
    if (
      segment.kind === 'qrl' &&
      segment.captures.length === 0 &&
      segment.references.some(
        (reference) =>
          reference.role === 'write' &&
          analysis.bindings.some(
            (binding) => binding.id === reference.bindingId && binding.kind === 'module'
          )
      )
    ) {
      segment.implementationInOrigin = true;
    }
  }
  const moduleWrite = findExtractedModuleWrite(componentModules, segments, analysis);
  if (moduleWrite !== null) {
    return {
      kind: 'failure',
      diagnostics: [
        createModuleWriteDiagnostic(
          ctx.input.path,
          ctx.input.code,
          moduleWrite.reference.range,
          moduleWrite.binding.name
        ),
      ],
    };
  }

  const reachableSegmentIds = new Set(segments.map((segment) => segment.id));
  const mainSegments = uniqueSegments([
    ...mainOutputs.flatMap((output) => output.result.segments),
    ...moduleBoundaries.segments,
  ]).filter((segment) => reachableSegmentIds.has(segment.id));
  const rootSegments = mainSegments.filter((segment) => segment.parentId === null);
  const moduleRootSegments = rootSegments.filter((segment) => segment.lifetimeId === null);
  const removableMarkers = findRemovableMarkerBindings(analysis, allSegments);
  const markerRetargets = createMainMarkerRetargets(
    analysis,
    rootSegments,
    removableMarkers,
    ctx.emitTarget
  );
  // shared plan-side tables: production JS emission and plan emission read the same data
  const modulePluginFns = nativePluginFns(native.markers, ctx.input.path);
  const planData: SsrPlanData = {
    defs: (extractedQrls.moduleDefs ?? []).map((def) => ({ name: def.name })),
    contexts: collectPlanContexts(program, analysis),
    pluginFns: modulePluginFns,
    bindingName: (binding) =>
      analysis.bindings.find((candidate) => candidate.id === binding)?.name ?? null,
    moduleBindingName: (binding) => {
      const info = analysis.bindings.find((candidate) => candidate.id === binding);
      return info !== undefined && (info.kind === 'import' || info.kind === 'module')
        ? info.name
        : null;
    },
    importLocalName: (module, exportName) => {
      const original = analysis.bindings.find(
        (candidate) =>
          candidate.import !== null &&
          candidate.import.source === module &&
          candidate.import.importedName === exportName &&
          !candidate.import.typeOnly
      )?.name;
      if (original !== undefined) {
        return original;
      }
      // dollar markers retarget to their Qrl variant in the emitted module
      for (const [binding, retarget] of markerRetargets) {
        if (retarget.targetName !== exportName) {
          continue;
        }
        const info = analysis.bindings.find((candidate) => candidate.id === binding);
        if (info?.import?.source === module) {
          return retarget.localName;
        }
      }
      return null;
    },
  };
  const emittedMain = emitModule(
    ctx,
    analysis,
    mainOutputs,
    mainSegments,
    null,
    markerRetargets,
    componentCardinality,
    componentReturnMode,
    generatedNames,
    moduleBoundaries.functions,
    moduleRootSegments,
    inlineComponents,
    planData
  );
  if (emittedMain === null) {
    const reason = lastUngeneratedReason();
    return transformFailure(
      ctx,
      null,
      reason === ''
        ? 'The compiler could not emit the qualified module.'
        : `The compiler cannot emit ${reason}. Deliver the construct as a plugin or rewrite it.`
    );
  }
  const main = assembleMainModule(
    ctx,
    program,
    analysis,
    mainOutputs,
    componentModules,
    emittedMain,
    segments,
    extractedQrls.moduleDeclarations,
    removableMarkers,
    markerRetargets,
    native.markers
  );
  if (main === null) {
    return transformFailure(ctx, null, 'The compiler produced incomplete component output.');
  }

  const localModules: TransformModule[] = [];
  for (const component of componentModules) {
    const componentSegments = component.output.result.segments.filter((segment) =>
      reachableSegmentIds.has(segment.id)
    );
    const moduleOutput = {
      ...component.output,
      component: {
        ...component.output.component,
        exportName: component.name,
        declarationKind:
          component.output.component.declarationKind === 'const'
            ? ('function' as const)
            : component.output.component.declarationKind,
      },
    };
    const emitted = emitModule(
      ctx,
      analysis,
      [moduleOutput],
      componentSegments,
      getInputImportPath(ctx.input.path, explicitExtensions),
      new Map(),
      componentCardinality,
      componentReturnMode,
      generatedNames,
      [],
      [],
      [],
      planData
    );
    const emittedComponent = emitted?.components.find(
      (candidate) => candidate.identity === component.output.component.identity
    );
    if (emitted === null || emittedComponent === undefined) {
      return transformFailure(
        ctx,
        component.output.component.functionRange,
        lastUngeneratedReason() === ''
          ? `The compiler could not emit component "${component.name}".`
          : `The compiler cannot emit ${lastUngeneratedReason()}. Deliver the construct as a plugin or rewrite it.`
      );
    }
    const imports = [
      emitRuntimeImport(emitted.imports),
      ...emitted.localImports,
      ...emitComponentModuleImports(
        component.output,
        analysis,
        componentByBinding,
        ctx.input.path,
        explicitExtensions,
        collectEagerComponentBindingIds([component.output.result])
      ),
    ].filter(Boolean);
    const code = joinModuleParts(imports, emitted.hoists, [emittedComponent.moduleCode]);
    const assembled = assembleGeneratedModule(
      ctx.input.code,
      ctx.input.path,
      component.path,
      code,
      component.output.component.replacementRange,
      ctx.options.sourceMaps === true,
      ctx.input.normalizationMap ?? null
    );
    localModules.push(
      createModule(component.path, assembled.code, assembled.map, {
        isEntry: true,
        origPath: ctx.input.path,
        segment: createComponentAnalysis(
          component.output.component,
          component.output.result.captures.length > 0,
          ctx.input.path,
          ctx.options.scope,
          mapMetadataRange(ctx)
        ),
      })
    );
  }

  // chunk emission reuses the owning component's wire block when one exists
  const wireCache = new Map<ComponentOutput, PlanSsrComponent | null>();
  const allOutputs = [...mainOutputs, ...componentModules.map((component) => component.output)];
  const findSegmentWireBlock = (segment: SegmentPlan) => {
    // embedded renders are synthetic children of their parent segment's id
    const baseId = segment.id.replace(/_embedded_\d+$/, '');
    const owner = allOutputs.find((output) =>
      output.result.segments.some((candidate) => candidate.id === baseId)
    );
    if (owner === undefined) {
      // module-level QRL segments belong to no component — serialize the block alone
      if (segment.render === null) {
        return undefined;
      }
      const moduleBlock = emitSsrOpPlan(
        null,
        segments,
        componentReturnMode,
        ctx.input.code,
        planData.bindingName,
        undefined,
        segment
      );
      return moduleBlock === null ? undefined : { render: moduleBlock as never };
    }
    let wire = wireCache.get(owner);
    if (wire === undefined) {
      wire = emitSsrOpPlan(
        owner.result,
        owner.result.segments,
        componentReturnMode,
        ctx.input.code,
        planData.bindingName
      );
      wireCache.set(owner, wire);
    }
    const inWire = wire === null ? undefined : findWireBlock(wire, segment.id);
    if (inWire !== undefined) {
      return inWire;
    }
    // value-expression and embedded segments have no block on the component wire —
    // serialize their own render with the same machinery
    if (segment.render === null) {
      return undefined;
    }
    const block = emitSsrOpPlan(
      owner.result,
      owner.result.segments,
      componentReturnMode,
      ctx.input.code,
      planData.bindingName,
      undefined,
      segment
    );
    return block === null ? undefined : { render: block as never };
  };
  const emittedSegments = segments.filter((segment) =>
    shouldEmitSegmentModule(segment, ctx.emitTarget)
  );
  const segmentModules = emitSegmentModules(
    segments,
    ctx.input.code,
    ctx.input.path,
    explicitExtensions,
    componentImports,
    analysis,
    ctx.emitTarget,
    ctx.emitTarget === 'ssr'
      ? (segment, source, imports, segments, inputPath, explicitExtensions, generatedNames) =>
          emitSsrSegmentRender(
            segment,
            source,
            imports,
            segments,
            inputPath,
            explicitExtensions,
            generatedNames,
            componentReturnMode,
            findSegmentWireBlock(segment),
            planData
          )
      : (segment, source, imports, segments, inputPath, explicitExtensions, generatedNames) =>
          emitCsrSegmentRender(
            segment,
            source,
            imports,
            segments,
            inputPath,
            explicitExtensions,
            componentCardinality,
            generatedNames
          ),
    generatedNames
  );
  if (segmentModules === null || segmentModules.length !== emittedSegments.length) {
    const reason = lastUngeneratedReason();
    return transformFailure(
      ctx,
      null,
      reason === ''
        ? 'The compiler could not emit extracted segments.'
        : `The compiler cannot emit ${reason}. Deliver the construct as a plugin or rewrite it.`
    );
  }
  const mapRange = mapMetadataRange(ctx);
  const mappedSegments = segmentModules.map((module, index) => {
    const assembled = assembleGeneratedModule(
      ctx.input.code,
      ctx.input.path,
      module.path,
      module.code,
      emittedSegments[index].range,
      ctx.options.sourceMaps === true,
      ctx.input.normalizationMap ?? null
    );
    return {
      ...module,
      code: assembled.code,
      map: assembled.map,
      segment:
        module.segment === null ? null : { ...module.segment, loc: mapRange(module.segment.loc) },
    };
  });
  const planModules: TransformModule[] =
    ctx.emitTarget === 'ssr' && (ctx.options as { emitPlan?: boolean }).emitPlan === true
      ? [
          {
            path: `${ctx.input.path}.plan.json`,
            isEntry: false,
            code: JSON.stringify(
              emitModulePlan(
                outputs,
                segments,
                ctx.input.code,
                ctx.input.path,
                componentReturnMode,
                collectPlanImports(analysis),
                collectPlanContexts(program, analysis),
                (extractedQrls.moduleDefs ?? []).map((def) => ({
                  name: def.name,
                  params: [...def.params],
                  body: def.body,
                })),
                (binding) =>
                  analysis.bindings.find((candidate) => candidate.id === binding)?.name ?? null,
                modulePluginFns,
                collectPlanHooks(program, analysis),
                collectComponentHookCalls(program, analysis, outputs)
              ),
              null,
              2
            ),
            map: null,
            segment: null,
            origPath: null,
          },
        ]
      : [];
  return { kind: 'success', modules: [main, ...localModules, ...mappedSegments, ...planModules] };
}

function assembleMainModule(
  ctx: CompilerContext,
  program: Program,
  analysis: ModuleAnalysis,
  outputs: readonly ComponentOutput[],
  componentModules: readonly LocalComponentModule[],
  emitted: EmittedModule,
  segments: readonly SegmentPlan[],
  declarations: readonly ModuleDeclaration[],
  removableMarkers: ReadonlySet<BindingId>,
  markerRetargets: ReadonlyMap<BindingId, MarkerImportRetarget>,
  nativeMarkers: readonly NativeMarker[] = []
): TransformModule | null {
  const emittedComponents = new Map(
    emitted.components.map((component) => [component.identity, component])
  );
  const replacements: RangeReplacement[] = [
    ...emitted.replacements,
    // native$ is a build-time marker: the module keeps the implementation alone
    ...nativeMarkers.map((marker) => ({
      range: marker.range,
      value: ctx.input.code.slice(marker.implementationRange[0], marker.implementationRange[1]),
    })),
  ];
  const markerImports = createUnusedMarkerImportReplacements(
    program,
    ctx.input.code,
    analysis,
    new Set([
      ...removableMarkers,
      ...findUnusedMainImportBindings(
        analysis,
        outputs,
        componentModules,
        segments,
        emitted.imports,
        ctx.emitTarget,
        nativeMarkers
      ),
    ]),
    markerRetargets
  );
  replacements.push(...markerImports.replacements);
  for (const output of outputs) {
    const component = emittedComponents.get(output.component.identity);
    if (component === undefined) {
      return null;
    }
    replacements.push({ range: output.component.replacementRange, value: component.rangeCode });
  }

  const constReplacements = createExtractedConstComponentReplacements(
    program,
    ctx.input.code,
    componentModules
  );
  if (constReplacements === null) {
    return null;
  }
  replacements.push(...constReplacements);

  for (const component of componentModules) {
    const declaration = component.output.component;
    if (declaration.declarationKind === 'const') {
      continue;
    }
    replacements.push({
      range: declaration.replacementRange,
      value: isDirectNamedExport(program, declaration.replacementRange)
        ? `{ ${component.name} };`
        : '',
    });
  }
  replacements.push(
    ...createModuleReferenceExports(segments, componentModules, declarations, analysis)
  );

  const runtime = planRuntimeImports(program, emitted.imports, markerImports.removedImports);
  replacements.push(...runtime.replacements);
  const eagerComponents = collectEagerComponentBindingIds(outputs.map((output) => output.result));
  const componentImports = componentModules.flatMap((component) =>
    component.output.component.bindingId === null ||
    component.output.component.exported ||
    (component.output.component.bindingId !== null &&
      eagerComponents.has(component.output.component.bindingId))
      ? [
          emitBindingImport(
            {
              source: component.importPath,
              importedName: component.name,
              typeOnly: false,
              attributes: [],
            },
            component.name
          ),
        ]
      : []
  );
  const imports = [runtime.declaration, ...emitted.localImports, ...componentImports].filter(
    Boolean
  );
  const prelude = joinModuleParts(imports, emitted.hoists, []);
  if (prelude !== '') {
    const insertionPoint = getPreludeInsertionPoint(program, ctx.input.code);
    replacements.push({
      range: [insertionPoint, insertionPoint],
      value: withSurroundingNewline(prelude, ctx.input.code, insertionPoint),
    });
  }

  const assembled = assembleModule(
    ctx.input.code,
    ctx.input.path,
    ctx.input.path,
    replacements,
    ctx.options.sourceMaps === true,
    ctx.input.normalizationMap ?? null
  );
  return createModule(ctx.input.path, assembled.code, assembled.map);
}

function createExtractedConstComponentReplacements(
  program: Program,
  source: string,
  componentModules: readonly LocalComponentModule[]
): RangeReplacement[] | null {
  const componentsByRange = new Map(
    componentModules
      .filter((component) => component.output.component.declarationKind === 'const')
      .map((component) => [rangeKey(component.output.component.replacementRange), component])
  );
  const replacements: RangeReplacement[] = [];

  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') {
      continue;
    }
    const declarators = declaration.declarations.map((declarator) => {
      const range = getRange(declarator);
      const initializerRange = getRange(declarator.init);
      return {
        range,
        component:
          initializerRange === null ? undefined : componentsByRange.get(rangeKey(initializerRange)),
      };
    });
    const extracted = declarators.filter((entry) => entry.component !== undefined);
    if (extracted.length === 0) {
      continue;
    }
    const statementRange = getRange(statement);
    if (statementRange === null || declarators.some((entry) => entry.range === null)) {
      return null;
    }

    const remaining = declarators.filter((entry) => entry.component === undefined);
    const comments = collectDeclaratorComments(
      source,
      getRange(declaration),
      declarators.map((entry) => entry.range!)
    );
    const declarations =
      remaining.length === 0
        ? ''
        : `${statement.type === 'ExportNamedDeclaration' ? 'export ' : ''}${declaration.kind} ${remaining
            .map((entry) => source.slice(entry.range![0], entry.range![1]))
            .join(', ')};`;
    const exports =
      statement.type === 'ExportNamedDeclaration'
        ? `export { ${extracted.map((entry) => entry.component!.name).join(', ')} };`
        : '';
    replacements.push({
      range: statementRange,
      value: [comments, declarations, exports].filter(Boolean).join('\n'),
    });
  }

  return replacements;
}

function collectDeclaratorComments(
  source: string,
  declarationRange: SourceRange | null,
  declaratorRanges: readonly SourceRange[]
): string {
  if (declarationRange === null || declaratorRanges.length === 0) {
    return '';
  }
  const gaps: SourceRange[] = [
    [declarationRange[0], declaratorRanges[0][0]],
    ...declaratorRanges
      .slice(1)
      .map((range, index) => [declaratorRanges[index][1], range[0]] as SourceRange),
    [declaratorRanges[declaratorRanges.length - 1][1], declarationRange[1]],
  ];
  return gaps
    .flatMap(
      (range) => source.slice(range[0], range[1]).match(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g) ?? []
    )
    .join('\n');
}

function emitModule(
  ctx: CompilerContext,
  analysis: ModuleAnalysis,
  outputs: readonly ComponentOutput[],
  segments: readonly SegmentPlan[],
  localImplementationSource: string | null,
  markerRetargets: ReadonlyMap<BindingId, MarkerImportRetarget>,
  componentCardinality: CsrComponentCardinalityResolver,
  componentReturnMode: SsrComponentReturnModeResolver,
  generatedNames: GeneratedNames,
  functions: ModuleBoundaryPlan['functions'],
  moduleRoots: readonly SegmentPlan[],
  inlineComponents: readonly InlineComponentReferencePlan[],
  planData?: SsrPlanData
): EmittedModule | null {
  const targetImports = new TargetImportResolver(analysis.bindings.map((binding) => binding.name));
  // module-provided names: core imports resolve in place; anything else taken means fallback
  const coreNames = new Set<string>([
    ...analysis.bindings
      .filter((binding) => binding.import?.source.startsWith('@qwik.dev/') === true)
      .map((binding) => binding.name),
    ...[...markerRetargets.values()].map((retarget) => retarget.targetName),
  ]);
  const takenNames = new Set<string>(
    analysis.bindings
      .filter((binding) => !coreNames.has(binding.name))
      .map((binding) => binding.name)
  );
  // aliased core imports: generated calls reuse the module's local name
  const coreAliases = new Map<string, string>();
  for (const binding of analysis.bindings) {
    if (
      binding.import?.source.startsWith('@qwik.dev/') === true &&
      binding.import.importedName !== binding.name
    ) {
      coreAliases.set(binding.import.importedName, binding.name);
    }
  }
  if (localImplementationSource === null) {
    for (const segment of segments) {
      if (segment.parentId !== null) {
        continue;
      }
      const boundary = segment.qrl;
      if (
        boundary === null ||
        boundary.kind === 'explicit' ||
        (boundary.kind === 'implicit' &&
          ctx.emitTarget === 'ssr' &&
          boundary.role === 'visible-task' &&
          segment.lifetimeId !== null)
      ) {
        continue;
      }
      const source = boundary.source;
      if (source === null) {
        continue;
      }
      const importedName =
        boundary.kind === 'sync'
          ? '_qrlSync'
          : ctx.emitTarget === 'csr'
            ? boundary.baseName
            : `${boundary.baseName}Qrl`;
      const attributes = boundary.kind === 'sync' ? [] : boundary.attributes;
      const binding = analysis.bindings.find(
        (candidate) =>
          candidate.import?.source === source &&
          candidate.import.importedName === importedName &&
          sameImportAttributes(candidate.import.attributes, attributes)
      );
      if (binding !== undefined) {
        targetImports.addExisting(source, importedName, attributes, binding.name);
      }
    }
    for (const [bindingId, target] of markerRetargets) {
      const imported = analysis.bindings.find((binding) => binding.id === bindingId)?.import;
      if (imported !== null && imported !== undefined) {
        targetImports.addExisting(
          imported.source,
          target.targetName,
          imported.attributes,
          target.localName
        );
      }
    }
  }
  return ctx.emitTarget === 'ssr'
    ? emitSsrModule(
        outputs,
        segments,
        ctx.input.code,
        ctx.input.path,
        ctx.options.explicitExtensions === true,
        localImplementationSource,
        targetImports,
        generatedNames,
        componentReturnMode,
        functions,
        moduleRoots,
        inlineComponents,
        planData,
        { core: coreNames, taken: takenNames, aliases: coreAliases }
      )
    : emitCsrModule(
        outputs,
        segments,
        ctx.input.code,
        ctx.input.path,
        ctx.options.explicitExtensions === true,
        localImplementationSource,
        targetImports,
        componentCardinality,
        generatedNames,
        functions,
        moduleRoots,
        inlineComponents
      );
}

function allocateGeneratedName(base: string, names: readonly string[]): string {
  const used = new Set(names);
  let name = base;
  let index = 0;
  while (used.has(name)) {
    name = `${base}${index++}`;
  }
  return name;
}

function forEachRenderNode(render: RenderPlan, visit: (node: RenderNodePlan) => void): void {
  const visitRender = (value: RenderPlan) => value.roots.forEach(visitNode);
  const visitNode = (node: RenderNodePlan): void => {
    visit(node);
    switch (node.kind) {
      case 'component':
        node.slots.forEach((slot) => visitRender(slot.render.render));
        return;
      case 'element':
        node.children.forEach(visitNode);
        return;
      case 'branch':
        visitRender(node.then.render);
        if (node.else !== null) {
          visitRender(node.else.render);
        }
        return;
      case 'suspense':
        visitRender(node.content.render);
        return;
      case 'slot':
        if (node.fallback !== null) {
          visitRender(node.fallback.render);
        }
        return;
      case 'collection':
        visitRender(node.row.render);
        return;
      case 'dynamic-value':
      case 'static-text':
        return;
      default:
        node satisfies never;
    }
  };
  visitRender(render);
}

function collectComponentBindingIds(render: RenderPlan, analysis: ModuleAnalysis): BindingId[] {
  const bindings: BindingId[] = [];
  forEachRenderNode(render, (node) => {
    if (node.kind !== 'component') {
      return;
    }
    const bindingId =
      node.bindingId ??
      analysis.references.find((reference) => sameRange(reference.range, node.tagRange))
        ?.bindingId ??
      null;
    if (bindingId !== null) {
      bindings.push(bindingId);
    }
  });
  return bindings;
}

function collectPlanComponentBindingIds(
  plan: ComponentOutput['result'],
  analysis: ModuleAnalysis
): BindingId[] {
  return [
    ...collectComponentBindingIds(plan.render, analysis),
    ...plan.segments.flatMap((segment) =>
      segment.embeddedRenders.flatMap((render) =>
        collectComponentBindingIds(render.render, analysis)
      )
    ),
  ];
}

/** A reactive collection without a key still renders; it just rebuilds every row on each change. */
function validateCollectionKeys(
  file: string,
  source: string,
  outputs: readonly ComponentOutput[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const output of outputs) {
    forEachRenderNode(output.result.render, (node) => {
      if (node.kind === 'collection' && node.source.kind !== 'direct-array' && node.key === null) {
        diagnostics.push(createKeylessCollectionDiagnostic(file, source, node.range));
      }
    });
  }
  return diagnostics;
}

function propagateComponentIdRequirements(
  outputs: readonly ComponentOutput[],
  analysis: ModuleAnalysis
): ComponentOutput[] {
  const needsId = new Set(
    outputs.flatMap((output) =>
      output.result.needsId && output.component.bindingId !== null
        ? [output.component.bindingId]
        : []
    )
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const output of outputs) {
      if (
        output.component.bindingId !== null &&
        !needsId.has(output.component.bindingId) &&
        collectPlanComponentBindingIds(output.result, analysis).some((id) => needsId.has(id))
      ) {
        needsId.add(output.component.bindingId);
        changed = true;
      }
    }
  }
  return outputs.map((output) =>
    output.component.bindingId !== null && needsId.has(output.component.bindingId)
      ? { ...output, result: markPlanNeedsId(output.result, needsId) }
      : output
  );
}

function markPlanNeedsId(
  plan: ComponentOutput['result'],
  componentNeedsId: ReadonlySet<BindingId>
): ComponentOutput['result'] {
  const renderFunctions = new Map<string, RenderFunctionPlan>();
  const mapSetup = (setup: readonly SetupPlan[]): SetupPlan[] =>
    setup.map((item) =>
      item.kind === 'render-value' ? { ...item, render: mapRenderFunction(item.render) } : item
    );
  const mapRender = (render: RenderPlan): RenderPlan => ({
    ...render,
    roots: render.roots.map((node): RenderNodePlan => {
      switch (node.kind) {
        case 'element':
          return { ...node, children: mapRender({ roots: node.children, effects: [] }).roots };
        case 'component':
          return {
            ...node,
            needsId: node.bindingId !== null && componentNeedsId.has(node.bindingId),
            slots: node.slots.map((slot) => ({
              ...slot,
              render: mapRenderFunction(slot.render),
            })),
          };
        case 'branch':
          return {
            ...node,
            then: mapRenderFunction(node.then),
            else: node.else === null ? null : mapRenderFunction(node.else),
          };
        case 'suspense':
          return { ...node, content: mapRenderFunction(node.content) };
        case 'slot':
          return {
            ...node,
            fallback: node.fallback === null ? null : mapRenderFunction(node.fallback),
          };
        case 'collection':
          return { ...node, row: mapRenderFunction(node.row) };
        default:
          return node;
      }
    }),
  });
  const renderNeedsId = (render: RenderPlan, setup: readonly SetupPlan[]): boolean =>
    setup.some((item) => item.kind === 'render-value' && item.render.needsId) ||
    render.roots.some(nodeNeedsId);
  const nodeNeedsId = (node: RenderNodePlan): boolean => {
    switch (node.kind) {
      case 'element':
        return node.children.some(nodeNeedsId);
      case 'component':
        return node.needsId || node.slots.some((slot) => slot.render.needsId);
      case 'branch':
        return node.then.needsId || node.else?.needsId === true;
      case 'suspense':
        return node.content.needsId;
      case 'slot':
        return node.fallback?.needsId === true;
      case 'collection':
        return node.row.needsId;
      case 'dynamic-value':
      case 'static-text':
        return false;
      default:
        return node satisfies never;
    }
  };
  const mapRenderFunction = (render: RenderFunctionPlan): RenderFunctionPlan => {
    if (render.segmentId !== null) {
      const existing = renderFunctions.get(render.segmentId);
      if (existing !== undefined) {
        return existing;
      }
    }
    const setup = mapSetup(render.setup);
    const plan = mapRender(render.render);
    const mapped: RenderFunctionPlan = {
      ...render,
      needsId: render.needsId || renderNeedsId(plan, setup),
      setup,
      render: plan,
    };
    if (render.segmentId !== null) {
      renderFunctions.set(render.segmentId, mapped);
    }
    return mapped;
  };
  const render = mapRender(plan.render);
  const setup = mapSetup(plan.setup);
  return {
    ...plan,
    needsId: true,
    render,
    setup,
    segments: plan.segments.map((segment) => ({
      ...segment,
      render: segment.render === null ? null : mapRenderFunction(segment.render),
      embeddedRenders: segment.embeddedRenders.map(mapRenderFunction),
    })),
  };
}

function emitComponentModuleImports(
  output: ComponentOutput,
  analysis: ModuleAnalysis,
  components: ReadonlyMap<BindingId, LocalComponentModule>,
  inputPath: string,
  explicitExtensions: boolean,
  eagerComponents: ReadonlySet<BindingId>
): string[] {
  const imports = new Set<string>();
  for (const binding of referencedModuleBindings(output, analysis)) {
    if (binding.id === output.component.bindingId) {
      continue;
    }
    const component = components.get(binding.id);
    if (component !== undefined) {
      if (!component.output.component.exported && !eagerComponents.has(binding.id)) {
        continue;
      }
      imports.add(
        emitBindingImport(
          {
            source: component.importPath,
            importedName: component.name,
            typeOnly: false,
            attributes: [],
          },
          binding.name
        )
      );
    } else if (binding.import !== null) {
      imports.add(emitBindingImport(binding.import, binding.name));
    } else if (binding.kind === 'module') {
      imports.add(
        emitBindingImport(
          {
            source: getInputImportPath(inputPath, explicitExtensions),
            importedName: binding.name,
            typeOnly: false,
            attributes: [],
          },
          binding.name
        )
      );
    }
  }
  return [...imports];
}

function collectEagerComponentBindingIds(
  plans: readonly ComponentOutput['result'][]
): Set<BindingId> {
  const bindings = new Set<BindingId>();
  const visitSetup = (setup: readonly SetupPlan[]): void => {
    for (const item of setup) {
      if (item.kind === 'render-value') {
        visitRenderFunction(item.render);
      }
    }
  };
  const visitRenderFunction = (render: RenderFunctionPlan): void => {
    visitSetup(render.setup);
    visitRender(render.render);
  };
  const visitNode = (node: RenderNodePlan): void => {
    switch (node.kind) {
      case 'element':
        node.children.forEach(visitNode);
        return;
      case 'component':
        if (node.bindingId !== null) {
          bindings.add(node.bindingId);
        }
        return;
      case 'collection':
        if (node.source.kind === 'direct-array') {
          visitRenderFunction(node.row);
        }
        return;
      case 'static-text':
      case 'dynamic-value':
      case 'branch':
      case 'suspense':
      case 'slot':
        return;
    }
  };
  const visitRender = (render: RenderPlan): void => render.roots.forEach(visitNode);
  for (const plan of plans) {
    visitSetup(plan.setup);
    visitRender(plan.render);
    for (const segment of plan.segments) {
      segment.embeddedRenders.forEach(visitRenderFunction);
    }
  }
  return bindings;
}

function createModuleReferenceExports(
  segments: readonly SegmentPlan[],
  componentModules: readonly LocalComponentModule[],
  declarations: readonly ModuleDeclaration[],
  analysis: ModuleAnalysis
): RangeReplacement[] {
  const componentBindings = new Set(
    componentModules.flatMap((component) =>
      component.output.component.bindingId === null ? [] : [component.output.component.bindingId]
    )
  );
  const needed = new Set<BindingId>();
  for (const segment of segments) {
    for (const reference of getTargetModuleReferences(segment)) {
      if (reference.import === null && !componentBindings.has(reference.bindingId)) {
        needed.add(reference.bindingId);
      }
    }
  }
  for (const component of componentModules) {
    for (const binding of referencedModuleBindings(component.output, analysis)) {
      if (binding.kind === 'module' && !componentBindings.has(binding.id)) {
        needed.add(binding.id);
      }
    }
  }

  const grouped = new Map<ModuleDeclaration, string[]>();
  for (const bindingId of needed) {
    const binding = analysis.bindings.find((candidate) => candidate.id === bindingId);
    if (binding === undefined || binding.declarationRange === null) {
      continue;
    }
    const declaration = declarations.find((candidate) =>
      containsRange(candidate.range, binding.declarationRange!)
    );
    if (declaration !== undefined && !declaration.exported) {
      const names = grouped.get(declaration) ?? [];
      names.push(binding.name);
      grouped.set(declaration, names);
    }
  }
  return [...grouped].map(([declaration, names]) => ({
    range: [declaration.range[1], declaration.range[1]],
    value: `\nexport { ${[...new Set(names)].join(', ')} };`,
  }));
}

function referencedModuleBindings(
  output: ComponentOutput,
  analysis: ModuleAnalysis
): BindingInfo[] {
  const ids = new Set(output.result.referenceBindingIds);
  return analysis.bindings.filter(
    (binding) => ids.has(binding.id) && (binding.kind === 'import' || binding.kind === 'module')
  );
}

function findRemovableMarkerBindings(
  analysis: ModuleAnalysis,
  segments: readonly SegmentPlan[]
): Set<BindingId> {
  const callRanges = new Map<BindingId, Set<string>>();
  for (const segment of segments) {
    const bindingId = segment.qrl?.markerBindingId;
    if (bindingId === undefined || segment.calleeRange === null) {
      continue;
    }
    const ranges = callRanges.get(bindingId) ?? new Set<string>();
    ranges.add(rangeKey(segment.calleeRange));
    callRanges.set(bindingId, ranges);
  }
  return new Set(
    [...callRanges].flatMap(([bindingId, ranges]) => {
      const binding = analysis.bindings.find((candidate) => candidate.id === bindingId);
      const onlyTransformedCalls = analysis.references
        .filter((reference) => reference.bindingId === bindingId)
        .every((reference) => ranges.has(rangeKey(reference.range)));
      return binding?.import != null && onlyTransformedCalls ? [bindingId] : [];
    })
  );
}

function createMainMarkerRetargets(
  analysis: ModuleAnalysis,
  rootSegments: readonly SegmentPlan[],
  removable: ReadonlySet<BindingId>,
  target: 'csr' | 'ssr'
): Map<BindingId, MarkerImportRetarget> {
  const retargets = new Map<BindingId, MarkerImportRetarget>();
  for (const segment of rootSegments) {
    const boundary = segment.qrl;
    if (boundary?.kind !== 'implicit' || !removable.has(boundary.markerBindingId)) {
      continue;
    }
    const targetName = implicitBoundaryTargetName(boundary, target);
    if (targetName === null) {
      continue;
    }
    const binding = analysis.bindings.find(
      (candidate) => candidate.id === boundary.markerBindingId
    );
    const imported = binding?.import;
    if (binding === undefined || imported === null || imported === undefined) {
      continue;
    }
    const existingTarget = analysis.bindings.some(
      (candidate) =>
        candidate.id !== binding.id &&
        candidate.import?.source === imported.source &&
        candidate.import.importedName === targetName &&
        sameImportAttributes(candidate.import.attributes, imported.attributes)
    );
    const localName = binding.name === imported.importedName ? targetName : binding.name;
    const localNameTaken = analysis.bindings.some(
      (candidate) => candidate.id !== binding.id && candidate.name === localName
    );
    if (!existingTarget && !localNameTaken) {
      retargets.set(binding.id, {
        targetName,
        localName,
      });
    }
  }
  return retargets;
}

function findUnusedMainImportBindings(
  analysis: ModuleAnalysis,
  outputs: readonly ComponentOutput[],
  componentModules: readonly LocalComponentModule[],
  segments: readonly SegmentPlan[],
  runtimeImports: readonly string[],
  target: 'csr' | 'ssr',
  nativeMarkers: readonly NativeMarker[] = []
): BindingId[] {
  const used = new Set<BindingId>();
  const replacedRanges = [
    ...outputs.map((output) => output.component.replacementRange),
    ...componentModules.map((component) => component.output.component.replacementRange),
    ...segments.flatMap((segment) =>
      segment.lifetimeId === null && segment.parentId === null ? [segment.functionRange] : []
    ),
    // the marker call is replaced by its implementation, so its own reads do not count
    ...nativeMarkers.map((marker) => marker.range),
  ];
  for (const reference of analysis.references) {
    if (
      reference.bindingId !== null &&
      !replacedRanges.some((range) => containsRange(range, reference.range))
    ) {
      used.add(reference.bindingId);
    }
  }
  for (const output of outputs) {
    for (const binding of referencedModuleBindings(output, analysis)) {
      used.add(binding.id);
    }
  }
  for (const binding of analysis.bindings) {
    if (
      binding.import?.source === QWIK_IMPORT &&
      binding.import.importedName === binding.name &&
      runtimeImports.includes(binding.name)
    ) {
      used.add(binding.id);
    }
  }
  for (const segment of segments) {
    if (segment.parentId !== null) {
      continue;
    }
    const boundary = segment.qrl;
    let targetName: string;
    let source: string | null;
    let attributes: readonly { readonly key: string; readonly value: string }[];
    if (boundary?.kind === 'sync') {
      targetName = '_qrlSync';
      source = boundary.source;
      attributes = [];
    } else if (boundary?.kind === 'implicit') {
      const implicitTarget = implicitBoundaryTargetName(boundary, target);
      if (implicitTarget === null) {
        continue;
      }
      targetName = implicitTarget;
      source = boundary.source;
      attributes = boundary.attributes;
    } else {
      continue;
    }
    if (source === null) {
      continue;
    }
    const implementation = analysis.bindings.find(
      (binding) =>
        binding.import?.source === source &&
        binding.import.importedName === targetName &&
        sameImportAttributes(binding.import.attributes, attributes)
    );
    if (implementation !== undefined) {
      used.add(implementation.id);
    }
  }
  for (const component of componentModules) {
    if (component.output.component.bindingId !== null) {
      used.delete(component.output.component.bindingId);
    }
  }
  return analysis.bindings.flatMap((binding) =>
    binding.kind === 'import' && binding.import?.typeOnly !== true && !used.has(binding.id)
      ? [binding.id]
      : []
  );
}

function implicitBoundaryTargetName(
  boundary: Extract<SegmentPlan['qrl'], { kind: 'implicit' }>,
  target: 'csr' | 'ssr'
): string | null {
  if (target === 'ssr' && boundary.role === 'visible-task') {
    return null;
  }
  if (boundary.role === 'style' || boundary.role === 'scoped-style') {
    return boundary.baseName;
  }
  return target === 'csr' ? boundary.baseName : `${boundary.baseName}Qrl`;
}

function createUnusedMarkerImportReplacements(
  program: Program,
  source: string,
  analysis: ModuleAnalysis,
  removableMarkers: ReadonlySet<BindingId>,
  markerRetargets: ReadonlyMap<BindingId, MarkerImportRetarget>
): { replacements: RangeReplacement[]; removedImports: Set<number> } {
  const bindingsByDeclaration = new Map(
    analysis.bindings.flatMap((binding) =>
      binding.declarationRange === null
        ? []
        : [[rangeKey(binding.declarationRange), binding] as const]
    )
  );
  const replacements: RangeReplacement[] = [];
  const removedImports = new Set<number>();
  for (const [bindingId, target] of markerRetargets) {
    const binding = analysis.bindings.find((candidate) => candidate.id === bindingId);
    const imported = binding?.import;
    const range =
      target.localName === target.targetName ? imported?.specifierRange : imported?.importedRange;
    if (range !== undefined) {
      replacements.push({ range, value: target.targetName });
    }
  }
  const removable = new Set(
    [...removableMarkers].filter((bindingId) => !markerRetargets.has(bindingId))
  );
  if (removable.size === 0) {
    return { replacements, removedImports };
  }
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }
    const entries = statement.specifiers.flatMap((specifier) => {
      const localRange = getRange(specifier.local);
      const range = getRange(specifier);
      const binding =
        localRange === null ? undefined : bindingsByDeclaration.get(rangeKey(localRange));
      return range === null || binding === undefined ? [] : [{ specifier, range, binding }];
    });
    const removed = entries.filter((entry) => removable.has(entry.binding.id));
    if (removed.length === 0) {
      continue;
    }
    if (removed.length === entries.length) {
      const range = getRange(statement);
      if (range !== null) {
        replacements.push({ range, value: '' });
        removedImports.add(range[0]);
      }
      continue;
    }

    const named = entries.filter((entry) => entry.specifier.type === 'ImportSpecifier');
    const keptNamed = named.filter((entry) => !removable.has(entry.binding.id));
    if (keptNamed.length === 0) {
      const first = named[0]?.range;
      const last = named[named.length - 1]?.range;
      if (first === undefined || last === undefined) {
        continue;
      }
      const open = source.lastIndexOf('{', first[0]);
      const close = source.indexOf('}', last[1]);
      if (open === -1 || close === -1) {
        continue;
      }
      let previous: (typeof entries)[number] | undefined;
      for (const entry of entries) {
        if (entry.range[1] <= open) {
          previous = entry;
        }
      }
      const comma = previous === undefined ? -1 : findImportComma(source, previous.range[1], open);
      if (comma !== -1) {
        replacements.push({ range: [comma, comma + 1], value: '' });
      }
      replacements.push({ range: [open, close + 1], value: '' });
      continue;
    }

    for (let index = 0; index < named.length; ) {
      if (!removable.has(named[index].binding.id)) {
        index++;
        continue;
      }
      const start = index;
      while (index < named.length && removable.has(named[index].binding.id)) {
        index++;
      }
      const hasKeptAfter = index < named.length;
      for (let current = start; current < index; current++) {
        const entry = named[current];
        replacements.push({ range: entry.range, value: '' });
        const adjacent = hasKeptAfter ? named[current + 1] : named[current - 1];
        if (adjacent === undefined) {
          continue;
        }
        const comma = hasKeptAfter
          ? findImportComma(source, entry.range[1], adjacent.range[0])
          : findImportComma(source, adjacent.range[1], entry.range[0]);
        if (comma !== -1) {
          replacements.push({ range: [comma, comma + 1], value: '' });
        }
      }
    }
  }
  return { replacements, removedImports };
}

function findImportComma(source: string, start: number, end: number): number {
  let blockComment = false;
  let lineComment = false;
  for (let index = start; index < end; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index++;
      }
    } else if (lineComment) {
      if (char === '\n' || char === '\r') {
        lineComment = false;
      }
    } else if (char === '/' && next === '*') {
      blockComment = true;
      index++;
    } else if (char === '/' && next === '/') {
      lineComment = true;
      index++;
    } else if (char === ',') {
      return index;
    }
  }
  return -1;
}

function findExtractedModuleWrite(
  components: readonly LocalComponentModule[],
  segments: readonly SegmentPlan[],
  analysis: ModuleAnalysis
): { binding: BindingInfo; reference: ModuleAnalysis['references'][number] } | null {
  for (const segment of segments) {
    if (segment.implementationInOrigin) {
      continue;
    }
    for (const reference of segment.references) {
      if (reference.role !== 'write' || reference.bindingId === null) {
        continue;
      }
      const binding = analysis.bindings.find((candidate) => candidate.id === reference.bindingId);
      if (binding?.kind === 'module') {
        return { binding, reference };
      }
    }
  }
  for (const component of components) {
    const range =
      component.output.component.functionRange ?? component.output.component.replacementRange;
    for (const reference of analysis.references) {
      if (
        reference.role !== 'write' ||
        reference.bindingId === null ||
        !containsRange(range, reference.range)
      ) {
        continue;
      }
      const binding = analysis.bindings.find((candidate) => candidate.id === reference.bindingId);
      if (binding?.kind === 'module') {
        return { binding, reference };
      }
    }
  }
  return null;
}

function planRuntimeImports(
  program: Program,
  requested: readonly string[],
  removedImports: ReadonlySet<number>
): { replacements: RangeReplacement[]; declaration: string } {
  const missing = missingRuntimeImports(program, requested);
  if (missing.length === 0) {
    return { replacements: [], declaration: '' };
  }
  const target = program.body.find(
    (statement): statement is ImportDeclaration =>
      statement.type === 'ImportDeclaration' &&
      !removedImports.has(statement.start) &&
      statement.importKind !== 'type' &&
      statement.source.value === QWIK_IMPORT &&
      !statement.specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier')
  );
  if (target === undefined) {
    return { replacements: [], declaration: emitRuntimeImport(missing) };
  }
  const named = target.specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
  const anchor = getRange(named[named.length - 1] ?? target.specifiers[0]);
  if (anchor === null) {
    return { replacements: [], declaration: emitRuntimeImport(missing) };
  }
  return {
    replacements: [
      {
        range: [anchor[1], anchor[1]],
        value: named.length > 0 ? `, ${missing.join(', ')}` : `, { ${missing.join(', ')} }`,
      },
    ],
    declaration: '',
  };
}

function missingRuntimeImports(program: Program, requested: readonly string[]): string[] {
  const existing = new Set<string>();
  for (const statement of program.body) {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.importKind === 'type' ||
      statement.source.value !== QWIK_IMPORT
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') {
        continue;
      }
      const imported = getIdentifierName(specifier.imported);
      const local = getIdentifierName(specifier.local);
      if (imported !== null && imported === local) {
        existing.add(imported);
      }
    }
  }
  return [...new Set(requested)].filter((name) => !existing.has(name));
}

function emitRuntimeImport(names: readonly string[]): string {
  return names.length === 0
    ? ''
    : `import { ${[...new Set(names)].join(', ')} } from ${JSON.stringify(QWIK_IMPORT)};`;
}

function getPreludeInsertionPoint(program: Program, source: string): number {
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration' || isDirective(statement)) {
      continue;
    }
    const range = getRange(statement);
    if (range !== null) {
      return range[0];
    }
  }
  return source.length;
}

function isDirective(statement: Program['body'][number]): boolean {
  return (
    statement.type === 'ExpressionStatement' &&
    'directive' in statement &&
    typeof statement.directive === 'string'
  );
}

function withSurroundingNewline(value: string, source: string, offset: number): string {
  const before = offset > 0 && source[offset - 1] !== '\n' ? '\n' : '';
  const after = offset < source.length && source[offset] !== '\n' ? '\n' : '';
  return `${before}${value}${after}`;
}

function joinModuleParts(
  imports: readonly string[],
  hoists: readonly string[],
  body: readonly string[]
): string {
  return [
    imports.filter(Boolean).join('\n'),
    hoists.filter(Boolean).join('\n'),
    body.filter(Boolean).join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function uniqueSegments(segments: readonly SegmentPlan[]): SegmentPlan[] {
  const seen = new Set<string>();
  return segments.filter((segment) => !seen.has(segment.id) && seen.add(segment.id));
}

function collectReachableSegments(
  outputs: readonly ComponentOutput[],
  moduleRootIds: readonly string[],
  functions: ModuleBoundaryPlan['functions'],
  segments: readonly SegmentPlan[],
  target: 'csr' | 'ssr',
  source: string,
  componentCardinality: CsrComponentCardinalityResolver,
  componentReturnMode: SsrComponentReturnModeResolver
): SegmentPlan[] | null {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const children = new Map<string, SegmentPlan[]>();
  for (const segment of segments) {
    if (segment.parentId !== null) {
      const nested = children.get(segment.parentId) ?? [];
      nested.push(segment);
      children.set(segment.parentId, nested);
    }
  }
  const queue: string[] = [...moduleRootIds];
  for (const output of outputs) {
    const plan =
      target === 'csr'
        ? planCsr(output.result, source, componentCardinality)
        : planSsr(output.result, componentReturnMode);
    if (plan === null) {
      return null;
    }
    queue.push(...plan.usedSegmentIds);
  }
  for (const fn of functions) {
    for (const renderFunction of fn.renders) {
      const plan =
        target === 'csr'
          ? planCsrRenderFunction(renderFunction, segments, source, componentCardinality)
          : planSsrRenderFunction(renderFunction, segments, componentReturnMode);
      if (plan === null) {
        return null;
      }
      queue.push(...plan.usedSegmentIds);
    }
  }
  const reachable = new Set<string>();
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (reachable.has(id)) {
      continue;
    }
    const segment = byId.get(id);
    if (segment === undefined) {
      return null;
    }
    reachable.add(id);
    for (const child of children.get(id) ?? []) {
      if (isSetupQrlSegment(child) || (segment.propsParts.length > 0 && child.kind === 'event')) {
        queue.push(child.id);
      }
    }
    if (segment.render !== null) {
      const render =
        target === 'csr'
          ? planCsrRenderFunction(segment.render, segments, source, componentCardinality)
          : planSsrRenderFunction(segment.render, segments, componentReturnMode);
      if (render === null) {
        return null;
      }
      queue.push(...render.usedSegmentIds);
    }
    for (const embedded of segment.embeddedRenders) {
      const render =
        target === 'csr'
          ? planCsrRenderFunction(embedded, segments, source, componentCardinality)
          : planSsrRenderFunction(embedded, segments, componentReturnMode);
      if (render === null) {
        return null;
      }
      queue.push(...render.usedSegmentIds);
    }
  }
  return segments.filter((segment) => reachable.has(segment.id));
}

function isDirectNamedExport(program: Program, range: SourceRange): boolean {
  return program.body.some((statement) => {
    if (statement.type !== 'ExportNamedDeclaration' || statement.declaration === null) {
      return false;
    }
    const declarationRange = getRange(statement.declaration);
    return declarationRange !== null && containsRange(declarationRange, range);
  });
}

function transformFailure(
  ctx: CompilerContext,
  range: SourceRange | null,
  message: string
): TransformResult {
  return {
    kind: 'failure',
    diagnostics: [
      createTransformFailureDiagnostic(ctx.input.path, ctx.input.code, range ?? [0, 0], message),
    ],
  };
}

function createSemanticLowerDiagnostic(
  ctx: CompilerContext,
  failure: SemanticLowerFailure
): Diagnostic | null {
  const { path, code } = ctx.input;
  switch (failure.code) {
    case 'ref':
      return createRefDiagnostic(path, code, failure.range, failure.message);
    case 'async-for':
      return createAsyncForDiagnostic(path, code, failure.range, failure.message);
    case 'use-id':
      return createUseIdDiagnostic(path, code, failure.range, failure.message);
    case 'style-hook':
      return createStyleHookDiagnostic(path, code, failure.range, failure.message);
    case 'custom-hook':
      return createCustomHookDiagnostic(path, code, failure.range, failure.message);
    case 'scoped-style-content':
      return createScopedStyleContentDiagnostic(path, code, failure.range, failure.message);
    case 'unsupported-syntax':
      return null;
  }
}

function createComponentAnalysis(
  component: ComponentDefinition,
  captures: boolean,
  inputPath: string,
  scope: string | undefined,
  mapRange: (range: SourceRange) => SourceRange
): SegmentAnalysis {
  const inputName = basename(inputPath);
  const sourceName = inputName.replace(/\.[cm]?[jt]sx?$/, '');
  const componentName =
    component.exportName === 'default' ? (component.localName ?? 'default') : component.exportName;
  const name = createSegmentSymbolName(
    createSegmentSourceIdentity(inputPath, scope),
    sanitizeIdentifier(`${sourceName}_${componentName}`),
    'component'
  );
  return {
    origin: inputName,
    name,
    entry: null,
    displayName: getSegmentDisplayName(name),
    hash: getSegmentSymbolHash(name),
    canonicalFilename: `${inputName}_${name}`,
    extension: 'js',
    parent: null,
    ctxKind: 'function',
    ctxName: 'component',
    captures,
    loc: mapRange(component.functionRange ?? [0, 0]),
    paramNames: component.params.map((param) => param.name ?? '_'),
  };
}

/** Module-level `createContextId('name')` declarations — engines resolve context names here. */
/** Built-in hook names — calls to these are framework hooks, not custom hooks. */
const BUILTIN_HOOK_NAMES = new Set([
  'useConstant',
  'useSignal',
  'useStore',
  'useServerData',
  'useComputed',
  'useComputedQrl',
  'useComputed$',
  'useAsync',
  'useAsyncQrl',
  'useAsync$',
  'useSerializer',
  'useSerializerQrl',
  'useSerializer$',
  'useTask',
  'useTaskQrl',
  'useTask$',
  'useVisibleTask',
  'useVisibleTaskQrl',
  'useVisibleTask$',
  'useContext',
  'useContextProvider',
  'useId',
  'useStyles',
  'useStylesQrl',
  'useStyles$',
  'useStylesScoped',
  'useStylesScopedQrl',
  'useStylesScoped$',
  'useOn',
  'useOnDocument',
  'useOnWindow',
]);

const SCOPED_STYLE_HOOKS = new Set(['useStylesScoped', 'useStylesScopedQrl', 'useStylesScoped$']);

/** Scans a function body for hook facts: built-in capabilities and nested custom-hook calls. */
function scanHookBody(
  body: AstNode,
  analysis: ModuleAnalysis
): { capabilities: string[]; calls: { module: string | null; name: string }[] } {
  const capabilities = new Set<string>();
  const calls: { module: string | null; name: string }[] = [];
  const seenCalls = new Set<string>();
  visit(body, (node) => {
    if (node.type !== 'CallExpression') {
      return;
    }
    const callee = unwrapExpression((node as { callee: unknown }).callee);
    const name = callee == null ? null : getIdentifierName(callee);
    if (name === null || !/^use[A-Z$_]/.test(name)) {
      return;
    }
    if (SCOPED_STYLE_HOOKS.has(name)) {
      capabilities.add('scoped-styles');
      return;
    }
    if (name === 'useContextProvider') {
      capabilities.add('context-provider');
      return;
    }
    if (BUILTIN_HOOK_NAMES.has(name)) {
      return;
    }
    const binding = analysis.bindings.find((candidate) => candidate.name === name);
    const module = binding?.import?.source ?? null;
    const key = `${module ?? '.'}:${name}`;
    if (!seenCalls.has(key)) {
      seenCalls.add(key);
      calls.push({ module, name });
    }
  });
  return { capabilities: [...capabilities], calls };
}

/** Exported `use*` fns with their hook capabilities — the linker closes these transitively. */
function collectPlanHooks(program: Program, analysis: ModuleAnalysis): PlanHookMeta[] {
  const exportedNames = new Set(
    analysis.exports.flatMap((entry) => {
      const binding = analysis.bindings.find((candidate) => candidate.id === entry.bindingId);
      return binding === undefined ? [] : [binding.name];
    })
  );
  const hooks: PlanHookMeta[] = [];
  const record = (name: string, fnNode: AstNode): void => {
    if (!/^use[A-Z$_]/.test(name) || !exportedNames.has(name) || BUILTIN_HOOK_NAMES.has(name)) {
      return;
    }
    const { capabilities, calls } = scanHookBody(fnNode, analysis);
    hooks.push({ name, capabilities, calls });
  };
  visit(program, (node) => {
    if (node.type === 'FunctionDeclaration') {
      const fnName = getIdentifierName((node as { id: unknown }).id);
      if (fnName !== null) {
        record(fnName, node);
      }
      return;
    }
    if (node.type === 'VariableDeclarator') {
      const declarator = node as { id: unknown; init: unknown };
      const declaredName = getIdentifierName(unwrapExpression(declarator.id));
      const init = unwrapExpression(declarator.init);
      if (
        declaredName !== null &&
        init != null &&
        (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
      ) {
        record(declaredName, init);
      }
    }
  });
  return hooks;
}

/** Direct custom-hook calls per component output, aligned by index. */
function collectComponentHookCalls(
  program: Program,
  analysis: ModuleAnalysis,
  outputs: readonly ComponentOutput[]
): PlanHookCall[][] {
  const byRangeKey = new Map<string, number>();
  outputs.forEach((output, index) => {
    const range = output.component.functionRange;
    if (range !== null) {
      byRangeKey.set(`${range[0]}:${range[1]}`, index);
    }
  });
  const result: PlanHookCall[][] = outputs.map(() => []);
  visit(program, (node) => {
    if (
      node.type !== 'FunctionDeclaration' &&
      node.type !== 'ArrowFunctionExpression' &&
      node.type !== 'FunctionExpression'
    ) {
      return;
    }
    const range = getRange(node);
    const index = range === null ? undefined : byRangeKey.get(`${range[0]}:${range[1]}`);
    if (index !== undefined) {
      result[index] = scanHookBody(node, analysis).calls;
    }
  });
  return result;
}

function collectPlanContexts(
  program: Program,
  analysis: ModuleAnalysis
): { binding: BindingId; name: string; declaredName: string }[] {
  const contexts: { binding: BindingId; name: string; declaredName: string }[] = [];
  visit(program, (node) => {
    if (node.type !== 'VariableDeclarator') {
      return;
    }
    const declarator = node as { id: unknown; init: unknown };
    const init = unwrapExpression(declarator.init);
    if (init?.type !== 'CallExpression') {
      return;
    }
    const call = init as { callee: unknown; arguments: unknown[] };
    const calleeName = getIdentifierName(unwrapExpression(call.callee));
    const isCreateContextId = analysis.bindings.some(
      (binding) =>
        binding.name === calleeName &&
        binding.import?.importedName === 'createContextId' &&
        binding.import.source.startsWith('@qwik.dev/')
    );
    if (!isCreateContextId) {
      return;
    }
    const argument = unwrapExpression(call.arguments[0]) as
      | { type: string; value?: unknown }
      | null
      | undefined;
    if (argument?.type !== 'Literal' || typeof argument.value !== 'string') {
      return;
    }
    const idRange = getRange(unwrapExpression(declarator.id));
    const declared = analysis.bindings.find(
      (binding) =>
        binding.declarationRange !== null &&
        idRange !== null &&
        binding.declarationRange[0] === idRange[0] &&
        binding.declarationRange[1] === idRange[1]
    );
    if (declared !== undefined) {
      contexts.push({ binding: declared.id, name: argument.value, declaredName: declared.name });
    }
  });
  return contexts;
}

function collectPlanImports(analysis: ModuleAnalysis): PlanImportMeta[] {
  const imports: PlanImportMeta[] = [];
  for (const binding of analysis.bindings) {
    const importBinding = binding.import;
    // only relative sources can resolve to sibling module plans
    if (importBinding === null || importBinding.typeOnly || !importBinding.source.startsWith('.')) {
      continue;
    }
    imports.push({
      binding: binding.id,
      name: binding.name,
      module: importBinding.source,
      export: importBinding.importedName,
    });
  }
  return imports;
}

function mapMetadataRange(ctx: CompilerContext): (range: SourceRange) => SourceRange {
  if (
    ctx.input.normalizationMap === null ||
    ctx.input.normalizationMap === undefined ||
    ctx.input.originalCode === undefined ||
    ctx.input.originalCode === ctx.input.code
  ) {
    return (range) => range;
  }
  return createOriginalRangeMapper(
    ctx.input.code,
    ctx.input.originalCode,
    ctx.input.normalizationMap as Parameters<typeof createOriginalRangeMapper>[2]
  );
}

function sanitizeIdentifier(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

function basename(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return slash === -1 ? path : path.slice(slash + 1);
}

function getInputImportPath(inputPath: string, explicitExtensions: boolean): string {
  const inputName = basename(inputPath).replace(/\.[cm]?[jt]sx?$/, '');
  return `./${inputName}${explicitExtensions ? '.js' : ''}`;
}

function containsRange(outer: SourceRange, inner: SourceRange): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

function sameRange(left: SourceRange, right: SourceRange): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function rangeKey(range: SourceRange): string {
  return `${range[0]}:${range[1]}`;
}

function sameImportAttributes(
  left: readonly { readonly key: string; readonly value: string }[],
  right: readonly { readonly key: string; readonly value: string }[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (attribute, index) =>
        attribute.key === right[index].key && attribute.value === right[index].value
    )
  );
}
