import type { SourceRange } from './types';
import {
  emitComponentFunction,
  emitComponentParamSetup,
  emitComponentRangeReplacement,
} from './emit-component';
import type { EmittedComponentCode, EmittedModule } from './emitted-module';
import {
  applyReplacements,
  emitCapturedQrlReference,
  emitModuleStyleBoundary,
  getNamedTargetImport,
  getTargetCallee,
  isModuleStyleBoundary,
  TargetImportResolver,
} from './emit-qrl';
import { emitFunctionRenders } from './emit-function';
import { emitSsrOpPlan } from './emit-plan-ssr';
import type { JsStatementRewriter } from './emit-plan-ssr';
import {
  emitJsProductionRender,
  emitJsSegmentBlock,
  lastUngeneratableDetail,
  lastUngeneratableSite,
} from './emit-js';
import {
  getSegmentImportPath,
  shouldResolveSsrSegment,
  type EmittedSegmentRender,
} from './emit-segment';
import { escapeAttr, escapeText, serializeAttrValue } from './html-utils';
import {
  planSsr,
  planSsrRenderFunction,
  planSsrSegmentRender,
  type SsrBranchOperation,
  type SsrCollectionOperation,
  type SsrComponentOperation,
  type SsrContentOperation,
  type SsrDynamicOperation,
  type SsrEmbeddedRenderPlan,
  type SsrElementOperation,
  type SsrEventHandlerPlan,
  type SsrOperation,
  type SsrPlan,
  type SsrPropOperation,
  type SsrRenderBlockPlan,
  type SsrRenderFunctionTargetPlan,
  type SsrSlotOperation,
  type SsrSuspenseOperation,
  type SsrComponentReturnModeResolver,
} from './plan-ssr';
import type {
  BindingId,
  OrderedPropPlan,
  ComponentDefinition,
  ComponentOutput,
  FunctionRenderPlan,
  InlineComponentReferencePlan,
  RenderFunctionPlan,
  SegmentPlan,
  SegmentReferencePlan,
  ValuePlan,
} from './plan-types';
import {
  DEFAULT_GENERATED_NAMES,
  QWIK_IMPORT,
  QwikAttributes,
  QwikGenWord,
  QwikHooks,
  QwikWord,
  type GeneratedNames,
} from './words';

interface SsrRender {
  readonly imports: readonly string[];
  readonly statements: readonly string[];
  readonly value: string;
}

interface SsrSetup {
  readonly imports: readonly string[];
  readonly statements: readonly string[];
  readonly flushTasks: boolean;
}

type SsrPrep = string | { readonly name: string };
type SsrPart = string | { readonly literal: string };

interface SsrStyleScope {
  readonly staticId: string | null;
  readonly runtimeName: string | null;
}

export interface SsrPlanData {
  readonly defs: readonly { readonly name: string }[];
  readonly contexts: readonly {
    readonly binding: number;
    readonly name: string;
    readonly declaredName?: string;
  }[];
  readonly pluginFns: readonly {
    readonly fnId: string;
    readonly module: string;
    readonly exportName: string;
  }[];
  readonly bindingName: (binding: number) => string | null;
  /** Names for module-scope bindings only (imports, top-level consts) — safe to reference. */
  readonly moduleBindingName: (binding: number) => string | null;
  /** Local name of an import by (module, export) — plugin-call resolution. */
  readonly importLocalName: (module: string, exportName: string) => string | null;
}

const EMPTY_PLAN_DATA: SsrPlanData = {
  defs: [],
  contexts: [],
  pluginFns: [],
  bindingName: () => null,
  moduleBindingName: () => null,
  importLocalName: () => null,
};

/** Why the last component failed to emit — surfaces in the compile diagnostic. */
let ungeneratedReason = '';
export function lastUngeneratedReason(): string {
  return ungeneratedReason;
}

/** Plan-first production emission for one component; null fails the compile loudly. */
function emitJsRenderForComponent(
  output: ComponentOutput,
  source: string,
  componentReturnMode: SsrComponentReturnModeResolver,
  generatedNames: GeneratedNames,
  planData: SsrPlanData,
  importNames: {
    readonly core: ReadonlySet<string>;
    readonly taken: ReadonlySet<string>;
    readonly aliases?: ReadonlyMap<string, string>;
  },
  rewriteJsStatement?: JsStatementRewriter
): (SsrRender & { readonly setup: SsrSetup }) | null {
  const wire = emitSsrOpPlan(
    output.result,
    output.result.segments,
    componentReturnMode,
    source,
    planData.bindingName,
    rewriteJsStatement
  );
  if (wire === null) {
    ungeneratedReason = 'its render structure has no SSR plan';
    return null;
  }
  const parameter = output.result.shape.parameter;
  const props =
    parameter == null
      ? null
      : parameter.kind === 'identifier'
        ? { kind: 'identifier' as const, binding: parameter.bindingIds[0] }
        : {
            kind: 'object' as const,
            bindings: parameter.bindingIds.map((b) => ({
              binding: b,
              name: planData.bindingName(b) ?? '',
            })),
          };
  // captured (inline) components read their `_captures` prelude locals by name
  ungeneratedReason = '';
  const pieces = emitJsProductionRender(
    wire,
    {
      name: output.component.exportName == null ? '' : String(output.component.exportName),
      propsBindings: parameter?.kind === 'identifier' ? parameter.bindingIds : [],
      props,
      providesContext: output.result.providesContext,
      captures: output.result.captures,
    },
    output.result.segments.map((segment) => ({
      id: segment.id,
      symbolName: segment.symbolName,
      chunk: '',
      kind: segment.kind,
      // mirrors the module's own `.s()` hoist eligibility for parentless segments
      resolved:
        segment.parentId === null &&
        segment.qrl?.kind !== 'sync' &&
        !isModuleStyleBoundary(segment) &&
        shouldResolveSsrSegment(segment),
      qrl:
        segment.qrl === null
          ? null
          : {
              kind: segment.qrl.kind,
              ...(segment.qrl.kind === 'implicit' ? { role: segment.qrl.role } : {}),
            },
      captures: segment.captures.map((capture) => ({
        binding: capture.bindingId,
        name: capture.name,
        source: capture.source,
        access: capture.access,
      })),
      ...(segment.visibleTaskStrategy == null
        ? {}
        : { visibleTaskStrategy: segment.visibleTaskStrategy }),
      ...(segment.initialOnly ? { initialOnly: true as const } : {}),
    })),
    planData.defs as never,
    planData.contexts,
    planData.pluginFns as never,
    {
      // the emitted head names the props param after the component's own parameter
      props:
        (output.component.params.length === 1 ? output.component.params[0]?.name : undefined) ??
        generatedNames.props,
      ctx: generatedNames.ctx,
      invokeCtx: generatedNames.invokeCtx,
    },
    planData.moduleBindingName,
    (importedName) => importNames.aliases?.get(importedName) ?? null,
    planData.bindingName,
    planData.importLocalName
  );
  if (pieces === null) {
    const detail = lastUngeneratableDetail();
    ungeneratedReason = `it uses a construct the compiler cannot lower yet${
      detail === '' ? '' : ` (${detail})`
    }`;
    return null;
  }
  // names the module already imports from core need no re-import; other collisions bail
  const neededImports: string[] = [];
  for (const name of pieces.imports) {
    if (importNames.core.has(name)) {
      continue;
    }
    if (importNames.taken.has(name)) {
      ungeneratedReason = `the local name "${name}" collides with a compiler runtime import`;
      return null;
    }
    neededImports.push(name);
  }
  return {
    imports: neededImports,
    statements: pieces.statements,
    value: pieces.value,
    setup: { imports: [], statements: pieces.setupStatements, flushTasks: pieces.flushTasks },
  };
}

export function emitSsrModule(
  outputs: readonly ComponentOutput[],
  segments: readonly SegmentPlan[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  localImplementationSource: string | null,
  qrlImports: TargetImportResolver,
  generatedNames: GeneratedNames,
  componentReturnMode: SsrComponentReturnModeResolver,
  functions: readonly FunctionRenderPlan[],
  moduleRoots: readonly SegmentPlan[],
  inlineComponents: readonly InlineComponentReferencePlan[],
  planData: SsrPlanData = EMPTY_PLAN_DATA,
  importNames: {
    readonly core: ReadonlySet<string>;
    readonly taken: ReadonlySet<string>;
    readonly aliases?: ReadonlyMap<string, string>;
  } = { core: new Set(), taken: new Set() }
): EmittedModule | null {
  const imports = new Set<string>();
  const components: EmittedComponentCode[] = [];
  const directSegmentIds = new Set<string>();
  const replacements: Array<{ range: SourceRange; value: string }> = [];
  const hoists: string[] = [];

  for (const segment of moduleRoots) {
    const boundary = segment.qrl;
    if (isModuleStyleBoundary(segment)) {
      const replacement = emitModuleStyleBoundary(segment, source, qrlImports);
      if (replacement === null) {
        return null;
      }
      replacements.push({
        range: segment.range,
        value: replacement,
      });
      continue;
    }
    const reference = emitCapturedQrlReference(
      segment.symbolName,
      segment.captures.map((capture) => capture.name)
    );
    if (boundary?.kind === 'explicit') {
      replacements.push({ range: segment.range, value: reference });
    } else if (boundary?.kind === 'sync') {
      const firstArg = segment.argumentRanges[0];
      if (firstArg === null || firstArg === undefined) {
        return null;
      }
      const callee = getNamedTargetImport(boundary.source, '_qrlSync', [], qrlImports);
      const value = source.slice(firstArg[0], firstArg[1]);
      replacements.push({
        range: segment.range,
        value: `${callee}(${value})`,
      });
    } else if (boundary?.kind === 'implicit' && boundary.role === 'visible-task') {
      const documentEvent =
        segment.visibleTaskStrategy === 'document-ready' ||
        segment.visibleTaskStrategy === 'document-idle';
      const event =
        segment.visibleTaskStrategy === 'document-ready'
          ? 'qinit'
          : segment.visibleTaskStrategy === 'document-idle'
            ? 'qidle'
            : 'qvisible';
      const useOn = getNamedTargetImport(
        boundary.source!,
        documentEvent ? QwikHooks.UseOnDocument : QwikHooks.UseOn,
        boundary.attributes,
        qrlImports
      );
      const createHandler = getNamedTargetImport(
        boundary.source!,
        QwikWord.CreateVisibleTaskHandlerQrl,
        boundary.attributes,
        qrlImports
      );
      replacements.push({
        range: segment.range,
        value: `${useOn}(${JSON.stringify(event)}, ${createHandler}(${reference}))`,
      });
    } else if (boundary?.kind === 'implicit' && segment.calleeRange !== null) {
      const callee = getTargetCallee(segment, 'ssr', qrlImports, localImplementationSource);
      if (callee === null) {
        return null;
      }
      replacements.push(
        { range: segment.calleeRange, value: callee },
        { range: segment.functionRange, value: reference }
      );
    } else {
      return null;
    }
  }

  const emittedFunctions = emitFunctionRenders(
    functions,
    source,
    inputPath,
    explicitExtensions,
    imports,
    segments,
    (symbolName, render, code, names, allSegments, path, extensions, generated) =>
      emitSsrFunctionRender(
        symbolName,
        render,
        code,
        names,
        allSegments,
        path,
        extensions,
        generated,
        componentReturnMode
      ),
    generatedNames
  );
  if (emittedFunctions === null) {
    return null;
  }
  emittedFunctions.directSegmentIds.forEach((id) => directSegmentIds.add(id));
  for (const component of inlineComponents) {
    imports.add(QwikWord.QrlWithChunk);
    imports.add(QwikWord.ComponentQrl);
    const qrl = `q_${component.symbolName}`;
    hoists.push(
      `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
        component.importPath
      )}, () => import(${JSON.stringify(component.importPath)}), ${JSON.stringify(
        component.symbolName
      )});`,
      `${qrl}.s(${component.symbolName});`
    );
    const reference =
      component.captureNames.length === 0
        ? qrl
        : `${qrl}.w([${component.captureNames.join(', ')}])`;
    replacements.push({
      range: component.replacementRange,
      value: `${QwikWord.ComponentQrl}(${reference})`,
    });
  }

  for (const output of outputs) {
    const captureNames = output.result.captures.map((capture) => capture.name);
    if (captureNames.length > 0) {
      imports.add(QwikWord.Captures);
    }
    const planned = planSsr(output.result, componentReturnMode);
    if (planned === null) {
      return null;
    }
    planned.directSegmentIds.forEach((id) => directSegmentIds.add(id));
    const componentSegments = new Map(
      output.result.segments.map((segment) => [segment.id, segment])
    );
    // plan-first: the wire plan is the cross-engine contract; generated bodies replace the
    // legacy tree walk per component, with the legacy path as fallback. Rendered bytes are
    // held identical by the Layer-A goldens and e2e suites.
    const render = emitJsRenderForComponent(
      output,
      source,
      componentReturnMode,
      generatedNames,
      planData,
      importNames,
      (operation) =>
        rewriteJsSetupStatement(
          operation,
          source,
          componentSegments,
          qrlImports,
          localImplementationSource
        )
    );
    if (render === null) {
      const name = output.component.exportName ?? output.component.localName ?? 'component';
      ungeneratedReason = `"${String(name)}": ${lastUngeneratedReason()}`;
      return null;
    }
    for (const name of render.imports) {
      imports.add(name);
    }
    components.push({
      identity: output.component.identity,
      moduleCode: emitComponent(
        output.component,
        render,
        source,
        false,
        generatedNames,
        planned.needsId ? planned.idBase : null,
        captureNames
      ),
      rangeCode: emitComponent(
        output.component,
        render,
        source,
        true,
        generatedNames,
        planned.needsId ? planned.idBase : null,
        captureNames
      ),
    });
  }

  hoists.push(...emittedFunctions.hoists);
  const localImports: string[] = [];
  const emittedSegmentIds = new Set<string>();
  // lifted local components duplicate their body inline — the parent needs their children too
  const localComponentSegmentIds = new Set(
    segments.filter((segment) => segment.kind === 'localComponent').map((segment) => segment.id)
  );
  for (const segment of segments) {
    if (
      emittedSegmentIds.has(segment.id) ||
      segment.qrl?.kind === 'sync' ||
      isModuleStyleBoundary(segment) ||
      (segment.parentId !== null &&
        !directSegmentIds.has(segment.id) &&
        !localComponentSegmentIds.has(segment.parentId))
    ) {
      continue;
    }
    emittedSegmentIds.add(segment.id);
    const path = getSegmentImportPath(inputPath, segment, explicitExtensions);
    const qrl = qrlName(segment);
    const declaration = `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
      path
    )}, () => import(${JSON.stringify(path)}), ${JSON.stringify(segment.symbolName)});`;
    if (shouldResolveSsrSegment(segment)) {
      localImports.push(`import { ${segment.symbolName} } from ${JSON.stringify(path)};`);
      hoists.push(`${declaration}\n${qrl}.s(${segment.symbolName});`);
    } else {
      hoists.push(declaration);
    }
  }
  if (hoists.length > 0) {
    imports.add(QwikWord.QrlWithChunk);
  }

  return {
    imports: [...imports],
    localImports: qrlImports
      .declarations({ source: QWIK_IMPORT, names: imports })
      .concat(localImports),
    hoists,
    components,
    replacements: [...replacements, ...emittedFunctions.replacements],
  };
}

export function emitSsrSegmentRender(
  segment: SegmentPlan,
  source: string,
  imports: Set<string>,
  segments: readonly SegmentPlan[] = [segment],
  inputPath = '',
  explicitExtensions = false,
  generatedNames = DEFAULT_GENERATED_NAMES,
  componentReturnMode?: SsrComponentReturnModeResolver,
  wireBlock?: import('./emit-plan-ssr').WireBlockMatch
): {
  hoists: string[];
  statements: string[];
  value: string;
  runtimeParameters?: readonly string[];
  trailingRuntimeParameters?: readonly string[];
  parameterBindingIds?: readonly number[];
  directSegmentIds?: readonly string[];
} | null {
  const renderFunction = segment.render;
  if (renderFunction === null) {
    return segment.kind === 'branchRender' ? { hoists: [], statements: [], value: "''" } : null;
  }
  const planned = planSsrSegmentRender(segment, segments, componentReturnMode, generatedNames);
  if (planned === null) {
    return null;
  }
  // plan-first chunk bodies, kind by kind; the walker below is the in-migration fallback
  if (
    (segment.kind === 'branchRender' ||
      segment.kind === 'slotRender' ||
      segment.kind === 'suspenseRender' ||
      segment.kind === 'forRender' ||
      segment.kind === 'collectionRender' ||
      segment.kind === 'qrl' ||
      segment.kind === 'localComponent') &&
    wireBlock?.render.ops !== undefined &&
    wireBlock.render.ssr.needsRootRange !== true
  ) {
    const generated = emitJsSegmentBlock(
      wireBlock.render as never,
      segments.map((candidate) => ({
        id: candidate.id,
        symbolName: candidate.symbolName,
        chunk: getSegmentImportPath(inputPath, candidate, explicitExtensions),
        kind: candidate.kind,
        resolved:
          candidate.parentId === segment.id &&
          candidate.qrl?.kind !== 'sync' &&
          !isModuleStyleBoundary(candidate) &&
          shouldResolveSsrSegment(candidate),
        qrl:
          candidate.qrl === null
            ? null
            : {
                kind: candidate.qrl.kind,
                ...(candidate.qrl.kind === 'implicit' ? { role: candidate.qrl.role } : {}),
              },
        captures: candidate.captures.map((capture) => ({
          binding: capture.bindingId,
          name: capture.name,
          source: capture.source,
          access: capture.access,
        })),
      })),
      [],
      [],
      [],
      {
        props: generatedNames.props,
        ctx: generatedNames.ctx,
        invokeCtx: generatedNames.invokeCtx,
      },
      // component-prop captures ride the props param, not the `_captures` prelude
      segment.captures
        .filter((capture) => capture.access !== 'component-prop')
        .map((capture) => ({ binding: capture.bindingId, name: capture.name })),
      // row params bind by their source names, matching the emitted head
      (planned.parameterBindingIds ?? []).map((binding, index) => ({
        binding,
        name: source.slice(segment.paramRanges[index][0], segment.paramRanges[index][1]),
      })),
      undefined,
      undefined,
      undefined,
      planned.rowRoot ? ` ${QwikAttributes.Row}` : null,
      [
        // innermost first: rows bracket in a row-marker range, projections in a slot marker
        ...(planned.rowMarker
          ? [
              {
                open: `createSsrRecord('<!r=', createSsrNodeId(${planned.runtimeParameters?.includes('rowId') ? 'rowId' : '__rowId'}), '>')`,
                close: '<!/r>',
              },
            ]
          : []),
        ...(planned.slotMarker
          ? [{ open: `createSsrRecord('<!s=', createSsrNodeId(rangeId), '>')`, close: '<!/s>' }]
          : []),
      ],
      wireBlock.props ?? null,
      wireBlock.providesContext === true
    );
    if (generated !== null) {
      for (const name of generated.imports) {
        imports.add(name);
      }
      return {
        hoists: [...generated.chunkImports, ...generated.hoists],
        statements: generated.statements,
        value: generated.value,
        runtimeParameters: planned.runtimeParameters,
        trailingRuntimeParameters: planned.trailingRuntimeParameters,
        parameterBindingIds: planned.parameterBindingIds,
        directSegmentIds: planned.directSegmentIds,
      };
    }
  }
  if (process.env.QWIK_CHUNK_CENSUS === '1') {
    // eslint-disable-next-line no-console
    console.error(
      'CHUNK-WALKER',
      segment.kind,
      segment.id,
      'block:',
      wireBlock?.render.ops !== undefined,
      'why:',
      lastUngeneratableSite(),
      lastUngeneratableDetail(),
      'rootRange:',
      wireBlock?.render.ssr.needsRootRange === true,
      'markers:',
      planned.rowMarker,
      planned.slotMarker
    );
  }
  const emitted = emitSsrRenderTarget(
    planned,
    source,
    imports,
    segments,
    inputPath,
    explicitExtensions,
    generatedNames,
    captureNames(segment, undefined, generatedNames),
    {
      surroundingRangeId: planned.surroundingRangeId,
      rootAttribute: planned.rowRoot ? QwikAttributes.Row : null,
      rowMarkerId: planned.rowMarker ? 'rowId' : null,
      slotMarkerId: planned.slotMarker ? 'rangeId' : null,
    }
  );
  return emitted === null
    ? null
    : {
        ...emitted,
        runtimeParameters: planned.runtimeParameters,
        trailingRuntimeParameters: planned.trailingRuntimeParameters,
        parameterBindingIds: planned.parameterBindingIds,
      };
}

function emitSsrFunctionRender(
  _symbolName: string,
  render: RenderFunctionPlan,
  source: string,
  imports: Set<string>,
  segments: readonly SegmentPlan[],
  inputPath: string,
  explicitExtensions: boolean,
  generatedNames: GeneratedNames,
  componentReturnMode: SsrComponentReturnModeResolver
): EmittedSegmentRender | null {
  const planned = planSsrRenderFunction(render, segments, componentReturnMode);
  return planned === null
    ? null
    : emitSsrRenderTarget(
        planned,
        source,
        imports,
        segments,
        inputPath,
        explicitExtensions,
        generatedNames,
        [],
        {
          surroundingRangeId: null,
          rootAttribute: null,
          rowMarkerId: null,
          slotMarkerId: null,
        }
      );
}

function emitSsrRenderTarget(
  planned: SsrRenderFunctionTargetPlan,
  source: string,
  imports: Set<string>,
  segments: readonly SegmentPlan[],
  inputPath: string,
  explicitExtensions: boolean,
  generatedNames: GeneratedNames,
  rootedCaptures: readonly string[],
  options: {
    readonly surroundingRangeId: string | null;
    readonly rootAttribute: string | null;
    readonly rowMarkerId: string | null;
    readonly slotMarkerId: string | null;
  }
): EmittedSegmentRender | null {
  const segmentById = new Map(segments.map((candidate) => [candidate.id, candidate]));
  const qrlImports = new TargetImportResolver();
  const setup = emitSetup(
    planned,
    source,
    segmentById,
    qrlImports,
    getInputImportPath(inputPath, explicitExtensions),
    false,
    generatedNames
  );
  if (setup === null) {
    return null;
  }
  const emitted = new SsrEmitter(
    source,
    segmentById,
    rootedCaptures,
    qrlImports,
    getInputImportPath(inputPath, explicitExtensions),
    generatedNames
  ).emit(planned.render, {
    surroundingRangeId: options.surroundingRangeId,
    rootAttribute: options.rootAttribute,
    rowMarkerId: options.rowMarkerId,
    slotMarkerId: options.slotMarkerId,
    contextBoundary: false,
    structuredRoot: !planned.render.staticRoot,
  });
  if (emitted === null) {
    return null;
  }
  for (const name of emitted.imports) {
    imports.add(name);
  }
  for (const name of setup.imports) {
    imports.add(name);
  }
  return {
    hoists: qrlImports.declarations({ source: QWIK_IMPORT, names: imports }),
    statements: [...setup.statements, ...emitted.statements],
    value: emitted.value,
  };
}

function emitComponent(
  component: ComponentDefinition,
  render: SsrRender & { readonly setup: SsrSetup },
  source: string,
  range: boolean,
  generatedNames: GeneratedNames,
  idBase: string | null,
  captureNames: readonly string[]
): string {
  const emit = range ? emitComponentRangeReplacement : emitComponentFunction;
  if (!render.setup.flushTasks) {
    return emit(
      component,
      [...render.setup.statements, ...render.statements],
      render.value,
      source,
      component.shape.async,
      generatedNames,
      idBase,
      captureNames
    );
  }
  return emit(
    component,
    render.setup.statements,
    `${QwikWord.MaybeThen}(${generatedNames.ctx}.scheduler.flush(), () => ${emitInvokeRender(
      render.statements,
      render.value
    )})`,
    source,
    component.shape.async,
    generatedNames,
    idBase,
    captureNames
  );
}

/**
 * Applies the source-level QRL/useId rewrites to one raw setup statement. Returned src is final
 * generator-ready JS. 'skip' drops the statement (standalone useId / empty); null bails.
 */
export function rewriteJsSetupStatement(
  operation: {
    readonly range: SourceRange;
    readonly segmentIds: readonly string[];
    readonly useIds: readonly { range: SourceRange; ordinal: number; standalone: boolean }[];
  },
  source: string,
  segments: ReadonlyMap<string, SegmentPlan>,
  qrlImports: TargetImportResolver,
  localImplementationSource: string | null
): { readonly src: string; readonly imports: readonly string[] } | 'skip' | null {
  const imports = new Set<string>();
  const operationSegments = operation.segmentIds.flatMap((id) => {
    const segment = segments.get(id);
    return segment === undefined ? [] : [segment];
  });
  if (
    operationSegments.length === 0 &&
    operation.useIds.length === 1 &&
    operation.useIds[0].standalone
  ) {
    return 'skip';
  }
  const replacements: { range: SourceRange; value: string }[] = operation.useIds.map((useId) => ({
    range: useId.range,
    value: `(_id + 'u${useId.ordinal}')`,
  }));
  for (const segment of operationSegments) {
    const boundary = segment.qrl;
    if (boundary?.kind === 'implicit' && boundary.role === 'visible-task') {
      const documentEvent =
        segment.visibleTaskStrategy === 'document-ready' ||
        segment.visibleTaskStrategy === 'document-idle';
      const event =
        segment.visibleTaskStrategy === 'document-ready'
          ? 'qinit'
          : segment.visibleTaskStrategy === 'document-idle'
            ? 'qidle'
            : 'qvisible';
      const useOn = documentEvent ? QwikHooks.UseOnDocument : QwikHooks.UseOn;
      imports.add(useOn);
      imports.add(QwikWord.CreateVisibleTaskHandlerQrl);
      replacements.push({
        range: segment.range,
        value: `${useOn}(${JSON.stringify(event)}, ${QwikWord.CreateVisibleTaskHandlerQrl}(${qrlReference(segment)}))`,
      });
    } else if (boundary?.kind === 'explicit') {
      replacements.push({ range: segment.range, value: qrlReference(segment) });
    } else if (boundary?.kind === 'sync') {
      const firstArg = segment.argumentRanges[0];
      if (firstArg === null || firstArg === undefined) {
        return null;
      }
      const callee = getNamedTargetImport(boundary.source, '_qrlSync', [], qrlImports);
      const value = source.slice(firstArg[0], firstArg[1]);
      replacements.push({
        range: segment.range,
        value: `${callee}(${value})`,
      });
    } else if (boundary?.kind === 'implicit' && segment.calleeRange !== null) {
      const callee = getTargetCallee(segment, 'ssr', qrlImports, localImplementationSource);
      if (callee === null) {
        return null;
      }
      replacements.push(
        { range: segment.calleeRange, value: callee },
        { range: segment.functionRange, value: qrlReference(segment) }
      );
    }
  }
  const statement = applyReplacements(source, operation.range, replacements).trim();
  if (statement === '' || statement === 'undefined;') {
    return 'skip';
  }
  return { src: statement, imports: [...imports] };
}

function emitSetup(
  plan: Pick<SsrPlan, 'setup'>,
  source: string,
  segments: ReadonlyMap<string, SegmentPlan>,
  qrlImports: TargetImportResolver,
  localImplementationSource: string | null,
  flushTasks = false,
  generatedNames: GeneratedNames = DEFAULT_GENERATED_NAMES
): SsrSetup | null {
  const imports = new Set<string>();
  const statements: string[] = [];
  // lifted local components mark after all setup: captures may be declared below the function
  const pendingComponentMarks: string[] = [];

  if (flushTasks) {
    imports.add(QwikWord.GetActiveInvokeContextOrNull);
    imports.add(QwikWord.MaybeThen);
    imports.add('invoke');
    statements.push(
      `const ${QwikGenWord.InvokeContext} = ${QwikWord.GetActiveInvokeContextOrNull}();`
    );
  }

  for (const operation of plan.setup) {
    if (operation.kind === 'render-value') {
      const render = new SsrEmitter(
        source,
        segments,
        [],
        qrlImports,
        localImplementationSource
      ).emit(operation.render, {
        surroundingRangeId: null,
        rootAttribute: null,
        rowMarkerId: null,
        slotMarkerId: null,
        contextBoundary: false,
        structuredRoot: !operation.render.staticRoot,
      });
      if (render === null) {
        return null;
      }
      for (const name of render.imports) {
        imports.add(name);
      }
      const body = [...render.statements, `return ${render.value};`]
        .map((statement) => `  ${statement}`)
        .join('\n');
      statements.push(`const ${operation.name} = () => {\n${body}\n};`);
      continue;
    }
    if (operation.kind === 'local-component') {
      const useIdSetup = operation.target.setup.some(
        (item) => item.kind === 'statement' && item.useIds.length > 0
      );
      if (useIdSetup) {
        return null; // useId() inside local components needs idBase plumbing
      }
      const childSetup = emitSetup(
        { setup: operation.target.setup },
        source,
        segments,
        qrlImports,
        localImplementationSource,
        false,
        generatedNames
      );
      if (childSetup === null) {
        return null;
      }
      const render = new SsrEmitter(
        source,
        segments,
        [],
        qrlImports,
        localImplementationSource,
        generatedNames
      ).emit(operation.target.render, {
        surroundingRangeId: null,
        rootAttribute: null,
        rowMarkerId: null,
        slotMarkerId: null,
        contextBoundary: operation.providesContext,
        structuredRoot: !operation.target.render.staticRoot,
      });
      if (render === null) {
        return null;
      }
      childSetup.imports.forEach((name) => imports.add(name));
      render.imports.forEach((name) => imports.add(name));
      const param = operation.parameter?.param ?? null;
      const propsName = param?.name ?? generatedNames.props;
      const paramSetup = emitComponentParamSetup(param, propsName, source);
      const body = [
        ...(paramSetup === null ? [] : [paramSetup]),
        ...childSetup.statements,
        ...render.statements,
        `return ${render.value};`,
      ]
        .map((statement) => `  ${statement}`)
        .join('\n');
      statements.push(
        `function ${operation.name}(${propsName}, ${generatedNames.ctx}) {\n${body}\n}`
      );
      const liftedSegment = segments.get(operation.segment);
      if (liftedSegment === undefined) {
        return null;
      }
      imports.add(QwikWord.MarkComponent);
      pendingComponentMarks.push(
        `${QwikWord.MarkComponent}(${operation.name}, ${qrlReference(liftedSegment, undefined, generatedNames)});`
      );
      continue;
    }
    if (operation.kind === 'style') {
      const helper = operation.scoped ? QwikHooks.UseStylesScoped : QwikHooks.UseStyles;
      imports.add(helper);
      const call = `${helper}(${source.slice(
        operation.argumentRange[0],
        operation.argumentRange[1]
      )}, ${JSON.stringify(operation.styleId)})`;
      statements.push(
        applyReplacements(source, operation.range, [
          {
            range: operation.callRange,
            value: operation.resultUsed
              ? `({ ${operation.scoped ? 'scopeId' : 'styleId'}: ${call} })`
              : call,
          },
        ]).trim()
      );
      continue;
    }
    const rewritten = rewriteJsSetupStatement(
      operation,
      source,
      segments,
      qrlImports,
      localImplementationSource
    );
    if (rewritten === null) {
      return null;
    }
    if (rewritten === 'skip') {
      continue;
    }
    for (const name of rewritten.imports) {
      imports.add(name);
    }
    statements.push(rewritten.src);
  }

  statements.push(...pendingComponentMarks);
  return { imports: [...imports], statements, flushTasks };
}

function emitInvokeRender(statements: readonly string[], value: string): string {
  const body = [...statements, `return ${value};`].map((statement) => `  ${statement}`).join('\n');
  return `invoke(${QwikGenWord.InvokeContext}, () => {\n${body}\n})`;
}

class SsrEmitter {
  private readonly imports = new Set<string>();
  private readonly declaredIds: string[] = [];
  private readonly eagerIds = new Set<string>();
  private readonly statements: string[] = [];
  private readonly steps: {
    readonly name: string;
    readonly value: string;
    readonly expression: string;
    readonly statements: readonly string[];
    readonly after: string | null;
    readonly eager: boolean;
  }[] = [];
  private readonly targetNames = new Map<number, string>();
  private readonly sharedElementTargets = new Map<string, string>();
  private readonly declaredElementTargets: string[] = [];
  private readonly addedRoots: Set<string>;
  private nextName = 0;
  private rootRangeName: string | null = null;
  private rootRangeOwned = false;
  private rootAttribute: string | null = null;
  private structuredRoot = true;
  private didEmitRoot = false;
  private synchronousBlock = false;
  private runtimeStyleScopeName: string | null = null;
  private embeddedRenders = new Map<string, SsrEmbeddedRenderPlan>();

  constructor(
    private readonly source: string,
    private readonly segments: ReadonlyMap<string, SegmentPlan>,
    rootedCaptures: readonly string[] = [],
    private readonly qrlImports = new TargetImportResolver(),
    private readonly localImplementationSource: string | null = null,
    private readonly generatedNames = DEFAULT_GENERATED_NAMES
  ) {
    this.addedRoots = new Set(rootedCaptures);
  }

  emit(
    block: SsrRenderBlockPlan,
    options: {
      readonly surroundingRangeId: string | null;
      readonly rootAttribute: string | null;
      readonly rowMarkerId: string | null;
      readonly slotMarkerId: string | null;
      readonly contextBoundary: boolean;
      readonly structuredRoot: boolean;
    }
  ): SsrRender | null {
    this.rootAttribute = options.rootAttribute;
    this.structuredRoot = options.structuredRoot;
    this.synchronousBlock = block.synchronous;
    this.runtimeStyleScopeName = block.runtimeStyleScopeName;
    this.embeddedRenders = new Map(
      block.embeddedRenders.map((render) => [rangeKey(render.range), render])
    );
    if (block.needsRootRange) {
      if (options.surroundingRangeId !== null) {
        this.rootRangeName = options.surroundingRangeId;
      } else {
        this.rootRangeName = this.declareId('rootRange');
        this.rootRangeOwned = true;
      }
    }
    const parts = this.operations(block.operations);
    if (parts === null) {
      return null;
    }
    if (this.rootRangeOwned) {
      this.imports.add(QwikWord.CreateSsrRecord);
      this.imports.add(QwikWord.CreateSsrNodeId);
      parts.unshift(
        `${QwikWord.CreateSsrRecord}('<!b=', ${QwikWord.CreateSsrNodeId}(${this.rootRangeName}), '>')`
      );
      parts.push(literal('<!/b>'));
    }
    if (options.rowMarkerId !== null) {
      this.imports.add(QwikWord.CreateSsrRecord);
      this.imports.add(QwikWord.CreateSsrNodeId);
      parts.unshift(
        `${QwikWord.CreateSsrRecord}('<!r=', ${QwikWord.CreateSsrNodeId}(${options.rowMarkerId}), '>')`
      );
      parts.push(literal('<!/r>'));
    }
    if (options.slotMarkerId !== null) {
      this.imports.add(QwikWord.CreateSsrRecord);
      this.imports.add(QwikWord.CreateSsrNodeId);
      parts.unshift(
        `${QwikWord.CreateSsrRecord}('<!s=', ${QwikWord.CreateSsrNodeId}(${options.slotMarkerId}), '>')`
      );
      parts.push(literal('<!/s>'));
    }
    if (options.contextBoundary) {
      this.imports.add(QwikWord.CreateSsrRecord);
      // Read the scope while the provider's invoke context is still active; the parts below run
      // after the children resolve, which may be a later microtask.
      const contextScope = this.name(QwikGenWord.ContextScope);
      this.statements.push(`const ${contextScope} = ${this.generatedNames.ctx}.contextScopeRef();`);
      parts.unshift(`${QwikWord.CreateSsrRecord}('<!c=', ${contextScope}, '>')`);
      parts.push(literal('<!/c>'));
    }
    let output = this.output(parts);
    const soleStep =
      this.steps.length === 1 && output === this.steps[0].name && this.steps[0].after === null;
    if (soleStep) {
      this.statements.push(...this.steps[0].statements);
      output = this.steps[0].expression;
    } else if (this.steps.length > 0) {
      const invokeContext = this.steps.length > 1 ? this.name(QwikGenWord.InvokeContext) : null;
      if (invokeContext !== null) {
        this.imports.add(QwikWord.GetActiveInvokeContextOrNull);
        this.imports.add('invoke');
        this.statements.push(
          `const ${invokeContext} = ${QwikWord.GetActiveInvokeContextOrNull}();`
        );
      }
      for (const step of this.steps) {
        if (step.eager) {
          this.statements.push(...step.statements, `const ${step.name} = ${step.expression};`);
        } else {
          const body = [...step.statements, `return ${step.expression};`]
            .map((line) => `  ${line}`)
            .join('\n');
          this.statements.push(
            `const ${step.name} = () => invoke(${invokeContext}, () => {\n${body}\n});`
          );
        }
      }
      let last = this.steps.length - 1;
      if (output === this.steps[last].name && this.steps[last].after === null) {
        output = this.steps[last].value;
        last--;
      }
      if (last >= 0) {
        this.imports.add(QwikWord.MaybeThen);
      }
      for (let i = last; i >= 0; i--) {
        const step = this.steps[i];
        const continuation =
          step.after === null ? output : `{\n  ${step.after};\n  return ${output};\n}`;
        output = `${QwikWord.MaybeThen}(${step.value}, (${step.name}) => ${continuation})`;
      }
    }
    return {
      imports: [...this.imports],
      statements: [
        ...this.declaredIds.map((name) =>
          this.eagerIds.has(name)
            ? `const ${name} = ${this.generatedNames.ctx}.nextId();`
            : `let ${name};`
        ),
        ...this.declaredElementTargets.map((name) => `let ${name};`),
        ...this.statements,
      ],
      value: output,
    };
  }

  private operations(operations: readonly SsrOperation[]): SsrPart[] | null {
    const values: SsrPart[] = [];
    for (const operation of operations) {
      const value = this.operation(operation);
      if (value === null) {
        return null;
      }
      values.push(...value);
    }
    return values;
  }

  private operation(operation: SsrOperation): SsrPart[] | null {
    switch (operation.kind) {
      case 'static':
        return [literal(escapeText(operation.value))];
      case 'element':
        return this.element(operation);
      case 'dynamic':
        return this.dynamic(operation);
      case 'content-effect':
        return this.content(operation);
      case 'component':
        return this.component(operation);
      case 'branch':
        return this.branch(operation);
      case 'suspense':
        return this.suspense(operation);
      case 'slot':
        return this.slot(operation);
      case 'collection':
        return this.collection(operation);
    }
  }

  private element(operation: SsrElementOperation): SsrPart[] | null {
    const root = !this.didEmitRoot;
    this.didEmitRoot = true;
    const target = operation.targetId === null ? null : this.targetName(operation.targetId);
    if (target !== null && operation.elementTargetUses > 1) {
      const shared = this.name('target');
      this.sharedElementTargets.set(target, shared);
      this.declaredElementTargets.push(shared);
    }
    const record: SsrPart[] = [literal(`<${operation.tag}`)];
    const styleScope: SsrStyleScope = {
      staticId: operation.styleScopedId,
      runtimeName: operation.runtimeStyleScope ? this.runtimeStyleScopeName : null,
    };
    let innerHTML: SsrPart | null = null;
    if (target !== null) {
      this.imports.add(QwikWord.CreateSsrNodeId);
      record.push(literal(` ${QwikAttributes.Id}="`));
      record.push(`${QwikWord.CreateSsrNodeId}(${target})`);
      record.push(literal('"'));
    }
    if (root && this.rootAttribute !== null) {
      record.push(literal(` ${this.rootAttribute}`));
    }
    if (operation.propsEffect !== null) {
      if (target === null) {
        return null;
      }
      const emitted = this.propsSegmentValue(
        operation.propsEffect,
        target,
        styleScope,
        operation.propsEffectRef
      );
      if (emitted === null) {
        return null;
      }
      record.push(`...${emitted}.attrs`);
      innerHTML = `${emitted}.innerHTML`;
    } else {
      const hasClass = operation.props.some(
        (prop) => prop.kind === 'spread' || ('name' in prop && prop.name === 'class')
      );
      if ((styleScope.staticId !== null || styleScope.runtimeName !== null) && !hasClass) {
        record.push(...this.scopeOnlyClassParts(styleScope));
      }
      for (const prop of operation.props) {
        const emitted = this.elementProp(prop, target, styleScope);
        if (emitted === null) {
          return null;
        }
        record.push(...emitted.parts);
        innerHTML = emitted.innerHTML ?? innerHTML;
      }
    }
    record.push(literal('>'));
    const start = this.record(record, root && this.structuredRoot ? operation.tag : null);
    if (operation.void) {
      return [start];
    }
    const children = this.operations(operation.children);
    if (children === null) {
      return null;
    }
    const body =
      innerHTML === null
        ? children
        : typeof innerHTML === 'string'
          ? [`(${innerHTML} ?? ${this.output(children)})`]
          : [innerHTML];
    return [start, ...body, literal(`</${operation.tag}>`)];
  }

  private elementProp(
    prop: SsrPropOperation,
    target: string | null,
    styleScope: SsrStyleScope
  ): { parts: SsrPart[]; innerHTML: SsrPart | null } | null {
    if (prop.kind === 'ref') {
      if (target === null) {
        return null;
      }
      const prep = this.inlineValuePrep(prop.value);
      if (prep === null) {
        return null;
      }
      const expression = `${this.generatedNames.ctx}.setRef(${this.expression(prop.value)}, ${target})`;
      if (this.steps.length === 0) {
        this.eagerIds.add(target);
        this.statements.push(...prep, `${expression};`);
        return { parts: [], innerHTML: null };
      }
      return {
        parts: [this.step(`(${expression}, '')`, [this.assignId(target), ...prep], 'ref')],
        innerHTML: null,
      };
    }
    if (prop.kind === 'static') {
      const serialized = serializeAttrValue(prop.name, prop.value);
      if (prop.name === 'class' && styleScope.runtimeName !== null) {
        if (serialized === null && styleScope.staticId === null) {
          return { parts: this.scopeOnlyClassParts(styleScope), innerHTML: null };
        }
        const value = scopeExpression(styleScope, serialized);
        this.imports.add(QwikWord.EscapeHTML);
        return {
          parts: [literal(' class="'), `${QwikWord.EscapeHTML}(${value})`, literal('"')],
          innerHTML: null,
        };
      }
      const value =
        prop.name === 'class' && styleScope.staticId !== null
          ? serialized
            ? `${styleScope.staticId} ${serialized}`
            : styleScope.staticId
          : serialized;
      return {
        parts:
          value === null
            ? []
            : [literal(value === '' ? ` ${prop.name}` : ` ${prop.name}="${escapeAttr(value)}"`)],
        innerHTML: null,
      };
    }
    if (prop.kind === 'inner-html') {
      if (!isValuePlan(prop.value)) {
        return {
          parts: [],
          innerHTML: literal(prop.value === null || prop.value === false ? '' : String(prop.value)),
        };
      }
      if (target === null) {
        return null;
      }
      const name = this.rawValue(prop.value, [this.assignId(target)], 'innerHTML');
      return name === null ? null : { parts: [], innerHTML: name };
    }
    if (prop.kind === 'event') {
      const dynamic = this.dynamicEventHandlerIndex(prop.handlers) !== -1;
      const emitted = this.eventValue(prop.handlers, prop.eventName, target);
      return emitted === null
        ? null
        : { parts: [dynamic ? `(${emitted} ?? '')` : emitted], innerHTML: null };
    }
    if (target === null) {
      if (prop.kind === 'dynamic' && isInitialOnlyValue(prop.value)) {
        if (prop.compilerString) {
          this.imports.add(QwikWord.EscapeHTML);
          return {
            parts: [
              literal(` ${prop.name}="`),
              `${QwikWord.EscapeHTML}(${this.expression(prop.value)})`,
              literal('"'),
            ],
            innerHTML: null,
          };
        }
        this.imports.add('renderDomPropsToString');
        return {
          parts: [
            `...renderDomPropsToString({ ${JSON.stringify(prop.name)}: ${this.expression(
              prop.value
            )} }${styleScopeArgument(styleScope, ', undefined, ')}).attrs`,
          ],
          innerHTML: null,
        };
      }
      return null;
    }
    if (prop.kind === 'spread') {
      const emitted = this.propsValue(prop.value, target, styleScope);
      return emitted === null
        ? null
        : { parts: [`...${emitted}.attrs`], innerHTML: `${emitted}.innerHTML` };
    }
    const name = this.attrValue(prop.value, prop.name, target, styleScope);
    this.imports.add(QwikWord.EscapeHTML);
    return name === null
      ? null
      : {
          parts: [
            `(${name} === null ? '' : ${JSON.stringify(` ${prop.name}`)} + (${name} === '' ? '' : '="' + ${QwikWord.EscapeHTML}(${name}) + '"'))`,
          ],
          innerHTML: null,
        };
  }

  private scopeOnlyClassParts(scope: SsrStyleScope): SsrPart[] {
    if (scope.runtimeName === null && scope.staticId !== null) {
      return [literal(` class="${escapeAttr(scope.staticId)}"`)];
    }
    this.imports.add(QwikWord.EscapeHTML);
    if (scope.staticId === null && scope.runtimeName !== null) {
      return [
        `(${scope.runtimeName} ? ' class="' + ${QwikWord.EscapeHTML}(${scope.runtimeName}) + '"' : '')`,
      ];
    }
    return [
      literal(' class="'),
      `${QwikWord.EscapeHTML}(${scopeExpression(scope, null)})`,
      literal('"'),
    ];
  }

  private dynamic(operation: SsrDynamicOperation): SsrPart[] | null {
    if (operation.output === 'content') {
      if (operation.synchronous) {
        return [this.expression(operation.value)];
      }
      const value = this.rawValue(operation.value, [], 'content');
      return value === null ? null : [value];
    }
    if (operation.target === null) {
      if (!isInitialOnlyValue(operation.value)) {
        return null;
      }
      this.imports.add(QwikWord.EscapeHTML);
      return [`${QwikWord.EscapeHTML}(String((${this.expression(operation.value)}) ?? ''))`];
    }
    let target: string;
    const prep: SsrPrep[] = [];
    if (operation.target.kind === 'element') {
      const id = this.targetName(operation.target.targetId);
      prep.push(this.assignId(id));
      this.imports.add(QwikWord.CreateSsrElementTextTarget);
      target = `${QwikWord.CreateSsrElementTextTarget}(${id})`;
    } else {
      const id =
        operation.target.targetId === null
          ? this.rootRangeName
          : this.targetName(operation.target.targetId);
      if (id === null) {
        return null;
      }
      prep.push(this.assignId(id));
      this.imports.add(QwikWord.CreateSsrRangeTextTarget);
      target = `${QwikWord.CreateSsrRangeTextTarget}(${id}, ${operation.target.markerIndex})`;
    }
    let name: string | null;
    if (operation.source === null) {
      name = this.textValue(operation.value, target, prep);
    } else {
      const source = this.source.slice(operation.source[0], operation.source[1]);
      this.imports.add(QwikWord.RenderSsrTextNode);
      name = this.step(
        `${QwikWord.RenderSsrTextNode}(${target}, ${source})`,
        [...prep, ...this.rootNames([source])],
        'text'
      );
    }
    if (name === null) {
      return null;
    }
    this.imports.add(QwikWord.EscapeHTML);
    const text = `${QwikWord.EscapeHTML}(${name})`;
    return operation.target.kind === 'element' ? [text] : [literal('<!t>'), text, literal('<!/t>')];
  }

  private content(operation: SsrContentOperation): SsrPart[] | null {
    const segment = this.segment(operation.segment);
    if (segment === null) {
      return null;
    }
    const id = this.declareId('contentId');
    const captures = this.captureNames(segment, operation.segment);
    const value = this.step(
      `${QwikWord.RenderSsrContent}(${this.generatedNames.ctx}, ${id}, [${captures.join(', ')}], ${qrlName(segment)}${operation.root ? ', true' : ''})`,
      [this.assignId(id), ...this.rootNames(captures)],
      'content'
    );
    this.imports.add(QwikWord.RenderSsrContent);
    this.imports.add(QwikWord.CreateSsrRecord);
    this.imports.add(QwikWord.CreateSsrNodeId);
    this.imports.add(QwikWord.EscapeSsrContent);
    return [
      `${QwikWord.CreateSsrRecord}('<!d=', ${QwikWord.CreateSsrNodeId}(${id}), '>')`,
      `${QwikWord.EscapeSsrContent}(${value})`,
      literal('<!/d>'),
    ];
  }

  private component(operation: SsrComponentOperation): SsrPart[] | null {
    const prep: string[] = [];
    let options = '';
    if (operation.slots.length > 0) {
      const scope = this.name('slotScope');
      prep.push(
        `const ${scope} = ${QwikWord.CreateSlotScope}();`,
        `${this.generatedNames.ctx}.addRoot(${scope});`
      );
      this.imports.add(QwikWord.CreateSlotScope);
      this.imports.add(QwikWord.RegisterProjection);
      for (const slot of operation.slots) {
        const segment = this.renderSegment(slot.render);
        if (segment === null) {
          return null;
        }
        prep.push(
          ...this.rootSegment(segment),
          `${QwikWord.RegisterProjection}(${scope}, ${JSON.stringify(slot.name)}, ${this.qrlReference(
            segment
          )}${slot.idBase === null ? '' : `, undefined, ${slot.idBase}`});`
        );
      }
      options = `, { slotScope: ${scope} }`;
    }
    const props = this.componentProps(operation.props, operation.propsSource);
    if (props === null) {
      return null;
    }
    prep.push(...props.prep);
    this.imports.add(QwikWord.CreateComponent);
    const tag = this.source.slice(operation.tagRange[0], operation.tagRange[1]);
    const componentContext = operation.blockingSuspense
      ? `${this.generatedNames.ctx}.inOrder()`
      : this.generatedNames.ctx;
    const expression = `${QwikWord.CreateComponent}(${props.value}, (props) => ${tag}(props, ${componentContext}${
      operation.idBase === null ? '' : `, ${operation.idBase}`
    })${options})`;
    if (operation.returnMode === 'sync' && this.synchronousBlock) {
      this.statements.push(...prep);
      return [expression];
    }
    return [this.step(expression, prep, 'component')];
  }

  private branch(operation: SsrBranchOperation): SsrPart[] | null {
    const condition = this.segment(operation.condition);
    const thenSegment = this.renderSegment(operation.then);
    const elseSegment = operation.else === null ? null : this.renderSegment(operation.else);
    if (
      condition === null ||
      thenSegment === null ||
      (operation.else !== null && elseSegment === null)
    ) {
      return null;
    }
    const id = this.declareId('branchId');
    const prep = [
      this.assignId(id),
      ...this.rootNames(this.captureNames(condition, operation.condition)),
      ...this.rootSegments([thenSegment, ...(elseSegment === null ? [] : [elseSegment])]),
    ];
    this.imports.add(QwikWord.RenderSsrBranch);
    this.imports.add(QwikWord.CreateSsrRecord);
    this.imports.add(QwikWord.CreateSsrNodeId);
    const value = this.step(
      `${QwikWord.RenderSsrBranch}(${this.generatedNames.ctx}, ${id}, ${this.qrlReference(condition, operation.condition)}, ${this.qrlReference(thenSegment)}, ${elseSegment === null ? 'undefined' : this.qrlReference(elseSegment)}${
        operation.idBase === null
          ? operation.root
            ? ", '', true"
            : ''
          : `, ${operation.idBase}${operation.root ? ', true' : ''}`
      })`,
      prep,
      'branch'
    );
    return [
      `${QwikWord.CreateSsrRecord}('<!b=', ${QwikWord.CreateSsrNodeId}(${id}), '>')`,
      value,
      literal('<!/b>'),
    ];
  }

  private suspense(operation: SsrSuspenseOperation): SsrPart[] | null {
    if (operation.inOrder !== null) {
      return this.operations(operation.inOrder);
    }
    const content = this.renderSegment(operation.content);
    if (content === null) {
      return null;
    }
    const fallback = operation.fallback === null ? null : this.suspenseQrl(operation.fallback);
    if (operation.fallback !== null && fallback === null) {
      return null;
    }
    const delayPrep = operation.delay === null ? [] : this.inlineValuePrep(operation.delay);
    if (delayPrep === null) {
      return null;
    }
    const id = this.declareId('suspenseId');
    const value = this.step(
      `${QwikWord.CreateSsrSuspense}(${this.generatedNames.ctx}, ${id}, ${this.qrlReference(content)}, ${fallback?.value ?? 'undefined'}, ${operation.delay === null ? '0' : this.expression(operation.delay)})`,
      [this.assignId(id), ...this.rootSegment(content), ...(fallback?.prep ?? []), ...delayPrep],
      'suspense'
    );
    this.imports.add(QwikWord.CreateSsrSuspense);
    return [value];
  }

  private suspenseQrl(
    value: ValuePlan
  ): { readonly value: string; readonly prep: readonly string[] } | null {
    if (value.kind === 'segment') {
      const segment = this.segment(value.segment);
      return segment === null
        ? null
        : {
            value: this.qrlReference(segment, value.segment),
            prep: this.rootNames(this.captureNames(segment, value.segment)),
          };
    }
    const prep = this.inlineValuePrep(value);
    return prep === null ? null : { value: this.expression(value), prep };
  }

  private slot(operation: SsrSlotOperation): SsrPart[] | null {
    const fallback = operation.fallback === null ? null : this.renderSegment(operation.fallback);
    if (operation.fallback !== null && fallback === null) {
      return null;
    }
    const prep = fallback === null ? [] : this.rootSegment(fallback);
    this.imports.add(QwikWord.RenderSsrSlot);
    this.imports.add(QwikWord.GetActiveInvokeContextOrNull);
    return [
      this.step(
        `${QwikWord.RenderSsrSlot}(${this.generatedNames.ctx}, ${JSON.stringify(operation.name)}, ${
          fallback === null ? 'undefined' : this.qrlReference(fallback)
        }, ${QwikWord.GetActiveInvokeContextOrNull}()${
          operation.idBase === null ? '' : `, ${operation.idBase}`
        })`,
        prep,
        'slot'
      ),
    ];
  }

  private collection(operation: SsrCollectionOperation): SsrPart[] | null {
    const key = operation.key === null ? null : this.segment(operation.key);
    const row = operation.row.kind === 'segment' ? this.renderSegment(operation.row.render) : null;
    if (
      (operation.row.kind === 'segment' && row === null) ||
      (operation.key !== null && key === null)
    ) {
      return null;
    }
    const id = operation.source.kind === 'direct-array' ? null : this.declareId('collectionId');
    let value: string;
    if (operation.source.kind === 'direct-reactive') {
      if (id === null) {
        return null;
      }
      const source = this.source.slice(
        operation.source.expression[0],
        operation.source.expression[1]
      );
      const prep = [
        this.assignId(id),
        ...this.rootNames([source]),
        ...(key === null ? [] : this.rootNames(this.captureNames(key, operation.key!))),
        ...this.rootSegment(row!),
      ];
      this.imports.add(QwikWord.RenderSsrCollection);
      value = this.step(
        `${QwikWord.RenderSsrCollection}(${this.generatedNames.ctx}, ${id}, ${source}, ${
          key === null ? 'undefined' : this.qrlReference(key, operation.key!)
        }, ${this.qrlReference(row!)}, ${operation.usesIndexSignal}, ${
          operation.idBase === null ? "''" : operation.idBase
        }, ${operation.usesRowId}, ${operation.rowShape})`,
        prep,
        'collectionResult'
      );
    } else if (operation.source.kind === 'direct-array') {
      const source = this.source.slice(
        operation.source.expression[0],
        operation.source.expression[1]
      );
      if (operation.row.kind !== 'inline') {
        return null;
      }
      const rowReference = this.inlineCollectionRow(operation.row);
      if (rowReference === null) {
        return null;
      }
      this.imports.add(QwikWord.RenderSsrCollection);
      const expression = `${QwikWord.RenderSsrCollection}(${this.generatedNames.ctx}, undefined, ${source}, undefined, ${rowReference}, false, ${operation.idBase === null ? "''" : operation.idBase}, ${
        operation.usesRowId
      }, ${operation.rowShape})`;
      value =
        !operation.row.async && operation.row.target.render.synchronous && this.synchronousBlock
          ? expression
          : this.step(expression, [], 'collectionResult');
    } else {
      if (id === null) {
        return null;
      }
      const source = this.segment(operation.source.segment);
      if (source === null) {
        return null;
      }
      const collection = this.name('collection');
      const prep = [
        this.assignId(id),
        ...this.rootNames(this.captureNames(source, operation.source.segment)),
        ...(key === null || operation.key === null
          ? []
          : this.rootNames(this.captureNames(key, operation.key))),
        ...this.rootSegment(row!),
        `const ${collection} = ${QwikWord.WrapArray}(${this.qrlReference(
          source,
          operation.source.segment
        )}${operation.source.keepSource ? ', true' : ''});`,
        `if (!Array.isArray(${collection})) ${this.generatedNames.ctx}.addRoot(${collection});`,
      ];
      this.imports.add(QwikWord.WrapArray);
      this.imports.add(QwikWord.RenderSsrCollection);
      value = this.step(
        `${QwikWord.RenderSsrCollection}(${this.generatedNames.ctx}, ${id}, ${collection}, ${
          key === null || operation.key === null
            ? 'undefined'
            : this.qrlReference(key, operation.key)
        }, ${this.qrlReference(row!)}, ${operation.usesIndexSignal}${
          operation.idBase === null ? ", ''" : `, ${operation.idBase}`
        }, ${operation.usesRowId}, ${operation.rowShape})`,
        prep,
        'collectionResult'
      );
    }
    if (id === null) {
      return [value];
    }
    this.imports.add(QwikWord.CreateSsrRecord);
    this.imports.add(QwikWord.CreateSsrNodeId);
    return [
      `${QwikWord.CreateSsrRecord}('<!f=', ${QwikWord.CreateSsrNodeId}(${id}), '>')`,
      value,
      literal('<!/f>'),
    ];
  }

  private inlineCollectionRow(
    row: Extract<SsrCollectionOperation['row'], { kind: 'inline' }>
  ): string | null {
    const setup = emitSetup(
      row.target,
      this.source,
      this.segments,
      this.qrlImports,
      this.localImplementationSource,
      false,
      this.generatedNames
    );
    if (setup === null) {
      return null;
    }
    const render = new SsrEmitter(
      this.source,
      this.segments,
      [],
      this.qrlImports,
      this.localImplementationSource,
      this.generatedNames
    ).emit(row.target.render, {
      surroundingRangeId: row.target.surroundingRangeId,
      rootAttribute: row.target.rowRoot ? QwikAttributes.Row : null,
      rowMarkerId: row.target.rowMarker ? 'rowId' : null,
      slotMarkerId: row.target.slotMarker ? 'rangeId' : null,
      contextBoundary: false,
      structuredRoot: !row.target.render.staticRoot,
    });
    if (render === null) {
      return null;
    }
    for (const name of setup.imports) {
      this.imports.add(name);
    }
    for (const name of render.imports) {
      this.imports.add(name);
    }
    const parameters = row.parameterRanges
      .slice(0, row.usedParameterCount)
      .map((range) => this.source.slice(range[0], range[1]));
    const runtimeParameters = [...row.target.runtimeParameters];
    if (row.target.trailingRuntimeParameters.length > 0) {
      while (runtimeParameters.length < 3) {
        runtimeParameters.push(
          runtimeParameters.length === 0
            ? this.generatedNames.ctx
            : runtimeParameters.length === 1
              ? '__rangeId'
              : '__rowId'
        );
      }
      const names = new Set(parameters);
      while (parameters.length < 2) {
        let name = parameters.length === 0 ? '__qwikItem' : '__qwikIndex';
        while (names.has(name)) {
          name += '_';
        }
        names.add(name);
        parameters.push(name);
      }
    }
    const signature = [
      ...runtimeParameters,
      ...parameters,
      ...row.target.trailingRuntimeParameters,
    ];
    const body = [...setup.statements, ...render.statements, `return ${render.value};`]
      .map((statement) => `  ${statement}`)
      .join('\n');
    this.statements.push(
      `${row.async ? 'async ' : ''}function ${row.symbolName}(${signature.join(
        ', '
      )}) {\n${body}\n}`
    );
    return row.symbolName;
  }

  private componentProps(
    props: readonly OrderedPropPlan[],
    propsSource: SegmentReferencePlan | null
  ): { readonly value: string; readonly prep: readonly string[] } | null {
    if (propsSource !== null) {
      const segment = this.segment(propsSource);
      if (segment === null) {
        return null;
      }
      const captures = this.captureNames(segment, propsSource);
      this.imports.add(QwikWord.CreatePropsProxy);
      this.imports.add(QwikHooks.UseComputedQrl);
      return {
        value: `${QwikWord.CreatePropsProxy}(${QwikHooks.UseComputedQrl}(${this.qrlReference(
          segment,
          propsSource
        )}))`,
        prep: this.rootNames(captures),
      };
    }
    const sources: string[] = [];
    const reactive: string[] = [];
    const prep: string[] = [];
    let entries: string[] = [];
    const flush = () => {
      if (entries.length > 0) {
        sources.push(`{ ${entries.join(', ')} }`);
        entries = [];
      }
    };
    for (const prop of props) {
      switch (prop.kind) {
        case 'static':
          entries.push(`${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`);
          break;
        case 'dynamic': {
          if (prop.value.kind === 'segment') {
            const segment = this.segment(prop.value.segment);
            if (segment === null) {
              return null;
            }
            // The QRL rides in the sources map so resume can rebuild this getter; a plain getter
            // would serialize as a snapshot.
            const qrlName = this.name(QwikGenWord.PropQrl);
            prep.push(
              ...this.rootNames(this.captureNames(segment, prop.value.segment)),
              `const ${qrlName} = ${this.qrlReference(segment, prop.value.segment)};`
            );
            this.imports.add(QwikWord.ReadExpression);
            entries.push(
              `get ${JSON.stringify(prop.name)}() { return ${QwikWord.ReadExpression}(${qrlName}); }`
            );
            reactive.push(`${JSON.stringify(prop.name)}: ${qrlName}`);
            break;
          }
          if (prop.value.kind === 'source') {
            // Reading through the source keeps the prop live after resume; a getter closure would
            // serialize as a snapshot.
            const source = this.source.slice(prop.value.source[0], prop.value.source[1]);
            this.imports.add(QwikWord.ReadTrackedSourceValue);
            entries.push(
              `get ${JSON.stringify(prop.name)}() { return ${QwikWord.ReadTrackedSourceValue}(${source}); }`
            );
            reactive.push(`${JSON.stringify(prop.name)}: ${source}`);
            prep.push(...this.rootNames([source]));
            break;
          }
          const boundaryPrep = this.inlineValuePrep(prop.value);
          if (boundaryPrep === null) {
            return null;
          }
          prep.push(...boundaryPrep);
          entries.push(
            `get ${JSON.stringify(prop.name)}() { return ${this.expression(prop.value)}; }`
          );
          break;
        }
        case 'event': {
          if (prop.value.kind === 'segment') {
            const segment = this.segment(prop.value.segment);
            if (segment === null) {
              return null;
            }
            entries.push(
              `${JSON.stringify(prop.name)}: ${this.qrlReference(segment, prop.value.segment)}`
            );
          } else {
            const boundaryPrep = this.inlineValuePrep(prop.value);
            if (boundaryPrep === null) {
              return null;
            }
            prep.push(...boundaryPrep);
            entries.push(`${JSON.stringify(prop.name)}: ${this.expression(prop.value)}`);
          }
          break;
        }
        case 'spread':
          {
            const boundaryPrep = this.inlineValuePrep(prop.value);
            if (boundaryPrep === null) {
              return null;
            }
            prep.push(...boundaryPrep);
          }
          flush();
          sources.push(this.expression(prop.value));
          break;
        case 'inner-html':
          if (isValuePlan(prop.value)) {
            const boundaryPrep = this.inlineValuePrep(prop.value);
            if (boundaryPrep === null) {
              return null;
            }
            prep.push(...boundaryPrep);
          }
          entries.push(
            `${JSON.stringify('innerHTML')}: ${isValuePlan(prop.value) ? this.expression(prop.value) : JSON.stringify(prop.value)}`
          );
          break;
      }
    }
    flush();
    if (sources.length === 0) {
      return { value: '{}', prep };
    }
    let value: string;
    if (sources.length === 1) {
      value = sources[0];
    } else {
      this.imports.add(QwikWord.MergeProps);
      value = `${QwikWord.MergeProps}(${sources.join(', ')})`;
    }
    if (reactive.length > 0) {
      this.imports.add(QwikWord.Props);
      value = `${QwikWord.Props}(${value}, { ${reactive.join(', ')} })`;
    }
    return { value, prep };
  }

  private textValue(value: ValuePlan, target: string, prep: readonly SsrPrep[]): string | null {
    if (value.kind === 'segment') {
      const segment = this.segment(value.segment);
      if (segment === null) {
        return null;
      }
      const captures = this.captureNames(segment, value.segment);
      this.imports.add(QwikWord.RenderSsrTextExpression);
      return this.step(
        `${QwikWord.RenderSsrTextExpression}(${target}, [${captures.join(', ')}], ${qrlName(segment)})`,
        [...prep, ...this.rootNames(captures)],
        'text'
      );
    }
    const expression = this.expression(value);
    return this.step(
      `((value) => (value == null ? '' : String(value)) || ' ')(${expression})`,
      prep,
      'text'
    );
  }

  private attrValue(
    value: ValuePlan,
    name: string,
    targetId: string,
    styleScope: SsrStyleScope
  ): string | null {
    const target = this.elementTarget(targetId);
    if (value.kind === 'source') {
      const source = this.source.slice(value.source[0], value.source[1]);
      this.imports.add(QwikWord.RenderSsrAttr);
      return this.step(
        `${QwikWord.RenderSsrAttr}(${target}, ${JSON.stringify(name)}, ${source}${styleScopeArgument(
          styleScope,
          ', undefined, '
        )})`,
        [this.assignId(targetId), ...this.rootNames([source])],
        'attr'
      );
    }
    if (value.kind === 'segment') {
      const segment = this.segment(value.segment);
      if (segment === null) {
        return null;
      }
      const captures = this.captureNames(segment, value.segment);
      this.imports.add(QwikWord.RenderSsrAttrExpression);
      return this.step(
        `${QwikWord.RenderSsrAttrExpression}(${target}, ${JSON.stringify(name)}, [${captures.join(', ')}], ${qrlName(segment)}${styleScopeArgument(
          styleScope,
          ', undefined, '
        )})`,
        [this.assignId(targetId), ...this.rootNames(captures)],
        'attr'
      );
    }
    return this.step(this.expression(value), [this.assignId(targetId)], 'attr');
  }

  private propsValue(value: ValuePlan, targetId: string, styleScope: SsrStyleScope): string | null {
    if (value.kind === 'segment') {
      return this.propsSegmentValue(value.segment, targetId, styleScope, true);
    }
    this.imports.add('renderDomPropsToString');
    return this.step(
      `renderDomPropsToString(${this.expression(value)}, ${this.generatedNames.ctx}.eventAttr, ${
        styleScope.staticId === null && styleScope.runtimeName === null
          ? 'undefined'
          : scopeExpression(styleScope, null)
      })`,
      [this.assignId(targetId)],
      'props',
      (name) =>
        `${name}.ref !== undefined && ${this.generatedNames.ctx}.setRef(${name}.ref, ${targetId})`
    );
  }

  private propsSegmentValue(
    reference: SegmentReferencePlan,
    targetId: string,
    styleScope: SsrStyleScope,
    includeRef = false
  ): string | null {
    const segment = this.segment(reference);
    if (segment === null) {
      return null;
    }
    const captures = this.captureNames(segment, reference);
    this.imports.add(QwikWord.RenderSsrProps);
    const styleArgs = styleScopeArgument(styleScope, ', undefined, ');
    return this.step(
      `${QwikWord.RenderSsrProps}(${this.elementTarget(targetId)}, [${captures.join(', ')}], ${qrlName(
        segment
      )}, ${this.generatedNames.ctx}.eventAttr${styleArgs})`,
      [this.assignId(targetId), ...this.rootNames(captures)],
      'props',
      includeRef
        ? (name) =>
            `${name}.ref !== undefined && ${this.generatedNames.ctx}.setRef(${name}.ref, ${targetId})`
        : undefined
    );
  }

  private eventValue(
    handlers: readonly SsrEventHandlerPlan[],
    eventName: string,
    targetId: string | null
  ): string | null {
    const dynamicIndex = this.dynamicEventHandlerIndex(handlers);
    if (dynamicIndex !== -1) {
      if (targetId === null) {
        return null;
      }
      const dynamic = handlers[dynamicIndex] as Extract<SsrEventHandlerPlan, { kind: 'value' }>;
      if (dynamic.value.kind !== 'segment') {
        return null;
      }
      const segment = this.segment(dynamic.value.segment);
      if (segment === null) {
        return null;
      }
      const captures = this.captureNames(segment, dynamic.value.segment);
      const before = handlers
        .slice(0, dynamicIndex)
        .map((handler) => this.eventHandlerValue(handler));
      const after = handlers
        .slice(dynamicIndex + 1)
        .map((handler) => this.eventHandlerValue(handler));
      if (before.some((value) => value === null) || after.some((value) => value === null)) {
        return null;
      }
      this.imports.add(QwikWord.RenderSsrEvent);
      return this.step(
        `${QwikWord.RenderSsrEvent}(${this.elementTarget(targetId)}, ${JSON.stringify(
          eventName
        )}, [${captures.join(', ')}], ${qrlName(segment)}, ${
          this.generatedNames.ctx
        }.eventAttr, [${before.join(', ')}], [${after.join(', ')}])`,
        [this.assignId(targetId), ...this.rootNames(captures)],
        'event'
      );
    }
    const values: string[] = [];
    for (const handler of handlers) {
      const value = this.eventHandlerValue(handler);
      if (value === null) {
        return null;
      }
      values.push(value);
    }
    const value = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
    return `${this.generatedNames.ctx}.eventAttr(${JSON.stringify(eventName)}, ${value})`;
  }

  private dynamicEventHandlerIndex(handlers: readonly SsrEventHandlerPlan[]): number {
    return handlers.findIndex(
      (handler) =>
        handler.kind === 'value' &&
        handler.value.kind === 'segment' &&
        this.segment(handler.value.segment)?.kind === 'expression'
    );
  }

  private eventHandlerValue(handler: SsrEventHandlerPlan): string | null {
    if (handler.kind === 'bind') {
      this.imports.add(QwikWord.InlinedQrl);
      const fn =
        handler.name === 'checked' ? QwikWord.BindCheckedHandler : QwikWord.BindValueHandler;
      this.imports.add(fn);
      return `${QwikWord.InlinedQrl}(${fn}, ${JSON.stringify(fn)}, [${this.source.slice(
        handler.signal[0],
        handler.signal[1]
      )}])`;
    }
    const value = handler.value;
    if (value.kind !== 'segment') {
      return this.expression(value);
    }
    const segment = this.segment(value.segment);
    return segment === null ? null : this.qrlReference(segment, value.segment);
  }

  private rawValue(value: ValuePlan, prep: readonly SsrPrep[], prefix: string): string | null {
    if (value.kind !== 'segment') {
      return this.step(this.expression(value), prep, prefix);
    }
    const segment = this.segment(value.segment);
    if (segment === null) {
      return null;
    }
    const captures = this.captureNames(segment, value.segment);
    return this.step(
      `${segment.symbolName}(${captures.join(', ')})`,
      segment.initialOnly ? prep : [...prep, ...this.rootNames(captures)],
      prefix
    );
  }

  private expression(value: ValuePlan): string {
    let expression = this.source.slice(value.expression[0], value.expression[1]);
    if (
      value.kind === 'expression' &&
      (value.boundaries.length > 0 || value.embeddedRenders.length > 0)
    ) {
      const replacements: Array<{ range: SourceRange; value: string }> = [];
      for (const reference of value.boundaries) {
        const segment = this.segment(reference);
        if (segment === null) {
          return expression;
        }
        if (segment.qrl === null) {
          if (segment.kind !== 'event') {
            return expression;
          }
          replacements.push({
            range: segment.functionRange,
            value: this.qrlReference(segment, reference),
          });
          continue;
        }
        const boundary = segment.qrl;
        if (boundary.kind === 'explicit') {
          replacements.push({ range: segment.range, value: this.qrlReference(segment, reference) });
        } else if (boundary.kind === 'sync') {
          const firstArg = segment.argumentRanges[0];
          if (firstArg === null || firstArg === undefined) {
            return expression;
          }
          const callee = getNamedTargetImport(boundary.source, '_qrlSync', [], this.qrlImports);
          const target = this.source.slice(firstArg[0], firstArg[1]);
          replacements.push({
            range: segment.range,
            value: `${callee}(${target})`,
          });
        } else if (segment.calleeRange !== null) {
          const callee = getTargetCallee(
            segment,
            'ssr',
            this.qrlImports,
            this.localImplementationSource
          );
          if (callee === null) {
            return expression;
          }
          replacements.push(
            { range: segment.calleeRange, value: callee },
            { range: segment.functionRange, value: this.qrlReference(segment, reference) }
          );
        }
      }
      for (const render of value.embeddedRenders) {
        const replacement = this.emitEmbeddedExpression(render);
        if (replacement !== null) {
          replacements.push({ range: render.range, value: replacement });
        }
      }
      expression = applyReplacements(this.source, value.expression, replacements);
      if (value.embeddedRenders.length > 0) {
        this.imports.add(QwikWord.GetActiveInvokeContext);
        this.imports.add('invoke');
        expression = `(() => { const ${this.generatedNames.invokeCtx} = ${QwikWord.GetActiveInvokeContext}(); return (${expression}); })()`;
      }
    }
    return value.kind === 'render-value' ? `${expression}()` : expression;
  }

  private emitEmbeddedExpression(render: RenderFunctionPlan): string | null {
    const embedded = this.embeddedRenders.get(rangeKey(render.range));
    if (embedded === undefined) {
      return null;
    }
    const setup = emitSetup(
      embedded.target,
      this.source,
      this.segments,
      this.qrlImports,
      this.localImplementationSource,
      false,
      this.generatedNames
    );
    if (setup === null) {
      return null;
    }
    const emitted = new SsrEmitter(
      this.source,
      this.segments,
      [],
      this.qrlImports,
      this.localImplementationSource,
      this.generatedNames
    ).emit(embedded.target.render, {
      surroundingRangeId: null,
      rootAttribute: null,
      rowMarkerId: null,
      slotMarkerId: null,
      contextBoundary: false,
      structuredRoot: true,
    });
    if (emitted === null) {
      return null;
    }
    setup.imports.forEach((name) => this.imports.add(name));
    emitted.imports.forEach((name) => this.imports.add(name));
    const body = [...setup.statements, ...emitted.statements, `return ${emitted.value};`]
      .map((statement) => `  ${statement}`)
      .join('\n');
    return `invoke(${this.generatedNames.invokeCtx}, () => (${embedded.async ? 'async ' : ''}() => {\n${body}\n})())`;
  }

  private inlineValuePrep(value: ValuePlan): string[] | null {
    if (value.kind !== 'expression') {
      return [];
    }
    const segments: SegmentPlan[] = [];
    for (const reference of value.boundaries) {
      const segment = this.segment(reference);
      if (segment === null) {
        return null;
      }
      if (segment.kind !== 'event') {
        segments.push(segment);
      }
    }
    return this.rootSegments(segments);
  }

  private segment(reference: SegmentReferencePlan): SegmentPlan | null {
    return this.segments.get(reference.segmentId) ?? null;
  }

  private captureNames(segment: SegmentPlan, reference?: SegmentReferencePlan): string[] {
    return captureNames(segment, reference, this.generatedNames);
  }

  private qrlReference(segment: SegmentPlan, reference?: SegmentReferencePlan): string {
    return qrlReference(segment, reference, this.generatedNames);
  }

  private renderSegment(render: { readonly segmentId: string | null }): SegmentPlan | null {
    return render.segmentId === null ? null : (this.segments.get(render.segmentId) ?? null);
  }

  private rootSegment(segment: SegmentPlan): string[] {
    return this.rootNames(this.captureNames(segment));
  }

  private rootSegments(segments: readonly SegmentPlan[]): string[] {
    return this.rootNames(segments.flatMap((segment) => this.captureNames(segment)));
  }

  private rootNames(names: readonly string[]): string[] {
    const statements: string[] = [];
    for (const name of names) {
      if (!this.addedRoots.has(name)) {
        this.addedRoots.add(name);
        statements.push(`${this.generatedNames.ctx}.addRoot(${name});`);
      }
    }
    return statements;
  }

  private step(
    expression: string,
    prep: readonly SsrPrep[] = [],
    prefix = 'value',
    after?: (name: string) => string
  ): string {
    const name = this.name(prefix);
    const eager = this.steps.length === 0;
    const statements = prep.flatMap((statement) => {
      if (typeof statement === 'string') {
        return statement;
      }
      if (eager) {
        this.eagerIds.add(statement.name);
      }
      return this.eagerIds.has(statement.name)
        ? []
        : [`${statement.name} ??= ${this.generatedNames.ctx}.nextId();`];
    });
    this.steps.push({
      name,
      value: eager ? name : `${name}()`,
      expression,
      statements,
      after: after?.(name) ?? null,
      eager,
    });
    return name;
  }

  private targetName(id: number): string {
    let name = this.targetNames.get(id);
    if (name === undefined) {
      name = this.declareId('id');
      this.targetNames.set(id, name);
    }
    return name;
  }

  private elementTarget(targetId: string): string {
    this.imports.add(QwikWord.CreateSsrElementTarget);
    const shared = this.sharedElementTargets.get(targetId);
    return shared === undefined
      ? `${QwikWord.CreateSsrElementTarget}(${targetId})`
      : `(${shared} ??= ${QwikWord.CreateSsrElementTarget}(${targetId}))`;
  }

  private declareId(prefix: string): string {
    const name = this.name(prefix);
    this.declaredIds.push(name);
    return name;
  }

  private assignId(name: string): { readonly name: string } {
    return { name };
  }

  private name(prefix: string): string {
    return `${prefix}${this.nextName++}`;
  }

  private record(parts: readonly SsrPart[], elementTag: string | null = null): SsrPart {
    const compacted =
      elementTag !== null
        ? [...this.compact(parts.slice(0, -1)), parts[parts.length - 1]]
        : this.compact(parts);
    if (compacted.length === 1 && typeof compacted[0] !== 'string') {
      return compacted[0];
    }
    const helper = elementTag === null ? QwikWord.CreateSsrRecord : QwikWord.CreateSsrElementRecord;
    this.imports.add(helper);
    const values = compacted
      .map((part) => (typeof part === 'string' ? part : JSON.stringify(part.literal)))
      .join(', ');
    return `${helper}(${elementTag === null ? '' : `${JSON.stringify(elementTag)}, `}${values})`;
  }

  private output(parts: readonly SsrPart[]): string {
    const compacted = this.compact(parts).map((part) =>
      typeof part === 'string' ? part : JSON.stringify(part.literal)
    );
    return compacted.length === 0
      ? "''"
      : compacted.length === 1
        ? compacted[0]
        : `[${compacted.join(', ')}]`;
  }

  private compact(parts: readonly SsrPart[]): SsrPart[] {
    const compacted: SsrPart[] = [];
    for (const part of parts) {
      const previous = compacted[compacted.length - 1];
      if (typeof part !== 'string' && previous !== undefined && typeof previous !== 'string') {
        compacted[compacted.length - 1] = literal(previous.literal + part.literal);
      } else {
        compacted.push(part);
      }
    }
    return compacted;
  }
}

function literal(value: string): SsrPart {
  return { literal: value };
}

function styleScopeArgument(scope: SsrStyleScope, prefix: string): string {
  return scope.staticId === null && scope.runtimeName === null
    ? ''
    : `${prefix}${scopeExpression(scope, null)}`;
}

function scopeExpression(scope: SsrStyleScope, className: string | null): string {
  const staticId = scope.staticId;
  const fallback = [staticId, className]
    .filter((value) => value !== null && value !== '')
    .join(' ');
  const runtime = scope.runtimeName;
  if (runtime === null) {
    return JSON.stringify(fallback);
  }
  if (staticId === null && (className === null || className === '')) {
    return `(${runtime} ?? '')`;
  }
  return `${runtime} ? ${
    staticId === null ? '' : `${JSON.stringify(`${staticId} `)} + `
  }${runtime}${className === null || className === '' ? '' : ` + ${JSON.stringify(` ${className}`)}`} : ${JSON.stringify(fallback)}`;
}

function captureNames(
  segment: Pick<SegmentPlan, 'captures' | 'render'>,
  reference: SegmentReferencePlan | undefined,
  generatedNames: GeneratedNames
): string[] {
  const captureIds =
    reference === undefined ? null : new Set<BindingId>(reference.captureBindingIds);
  const componentPropIds =
    reference === undefined ? null : new Set<BindingId>(reference.componentPropBindingIds);
  const hasComponentProps = segment.captures.some(
    (capture) =>
      capture.access === 'component-prop' &&
      (componentPropIds === null || componentPropIds.has(capture.bindingId))
  );
  return [
    ...(hasComponentProps ? [generatedNames.props] : []),
    ...segment.captures.flatMap((capture) =>
      capture.access !== 'component-prop' &&
      (captureIds === null || captureIds.has(capture.bindingId))
        ? [capture.name]
        : []
    ),
    ...(segment.render?.runtimeStyleScopeName === null ||
    segment.render?.runtimeStyleScopeName === undefined
      ? []
      : [segment.render.runtimeStyleScopeName]),
  ];
}

function qrlName(segment: SegmentPlan): string {
  return `q_${segment.symbolName}`;
}

function qrlReference(
  segment: SegmentPlan,
  reference?: SegmentReferencePlan,
  generatedNames = DEFAULT_GENERATED_NAMES
): string {
  const captures = captureNames(segment, reference, generatedNames);
  return captures.length === 0
    ? qrlName(segment)
    : `${qrlName(segment)}.w([${captures.join(', ')}])`;
}

function isValuePlan(value: unknown): value is ValuePlan {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function isInitialOnlyValue(value: ValuePlan): boolean {
  return value.kind === 'expression' && value.initialOnly;
}

function rangeKey(range: SourceRange): string {
  return `${range[0]}:${range[1]}`;
}

function getInputImportPath(inputPath: string, explicitExtensions: boolean): string {
  const slash = Math.max(inputPath.lastIndexOf('/'), inputPath.lastIndexOf('\\'));
  const name = (slash === -1 ? inputPath : inputPath.slice(slash + 1)).replace(
    /\.[cm]?[jt]sx?$/,
    ''
  );
  return `./${name}${explicitExtensions ? '.js' : ''}`;
}
