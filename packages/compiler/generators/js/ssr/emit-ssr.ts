import type { SourceRange } from '../../../src/types';
import { emitComponentFunction, emitComponentRangeReplacement } from '../../../src/emit-component';
import type { EmittedComponentCode, EmittedModule } from '../../../src/emitted-module';
import {
  applyReplacements,
  emitCapturedQrlReference,
  emitModuleStyleBoundary,
  getNamedTargetImport,
  getTargetCallee,
  isModuleStyleBoundary,
  TargetImportResolver,
} from '../../../src/emit-qrl';
import { emitFunctionRenders } from '../../../src/emit-function';
import { emitSsrOpPlan } from '../../../src/emit-plan-ssr';
import type { JsStatementRewriter } from '../../../src/emit-plan-ssr';
import { emitJsProductionRender, emitJsSegmentBlock, lastUngeneratableDetail } from './emit-js';
import { getSegmentImportPath, type EmittedSegmentRender } from '../shared/emit-segment';
import {
  hasRawSsrModuleRootImplementation,
  shouldResolveSsrSegment,
} from '../../../src/segment-plan';
import {
  planSsr,
  planSsrRenderFunction,
  planSsrSegmentRender,
  type SsrComponentReturnModeResolver,
} from '../../../src/plan-ssr';
import type {
  BindingId,
  ComponentDefinition,
  ComponentOutput,
  FunctionRenderPlan,
  InlineComponentReferencePlan,
  RenderFunctionPlan,
  SegmentPlan,
  SegmentReferencePlan,
} from '../../../src/plan-types';
import {
  DEFAULT_GENERATED_NAMES,
  QWIK_IMPORT,
  QwikAttributes,
  QwikGenWord,
  QwikHooks,
  QwikWord,
  type GeneratedNames,
} from '../../../src/words';

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

/** Aliased so the emitted import never collides with an origin `isServer` import. */
const LIB_IS_SERVER = 'qwikBuildIsServer';

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
      // mirrors the module's own `.s()` hoist eligibility
      resolved: !isModuleStyleBoundary(segment) && shouldResolveSsrSegment(segment),
      qrl:
        segment.qrl === null
          ? null
          : {
              kind: segment.qrl.kind,
              ...(segment.qrl.kind === 'implicit' ? { role: segment.qrl.role } : {}),
            },
      ...(segment.qrl?.kind === 'sync' && segment.argumentRanges[0] != null
        ? { syncSource: source.slice(segment.argumentRanges[0]![0], segment.argumentRanges[0]![1]) }
        : {}),
      ...(segment.render?.runtimeStyleScopeName == null ? {} : { styleScope: true as const }),
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
  } = { core: new Set(), taken: new Set() },
  inlineSegmentCode: ReadonlyMap<string, string> = new Map(),
  inlineQwikImportNames: ReadonlySet<string> = new Set(),
  libMode = false
): EmittedModule | null {
  const imports = new Set<string>();
  inlineQwikImportNames.forEach((name) => imports.add(name));
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
        // the key addresses the container's sync-function table
        value: `${callee}(${value}, ${JSON.stringify(segment.symbolName)})`,
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
        componentReturnMode,
        planData
      ),
    generatedNames
  );
  if (emittedFunctions === null) {
    return null;
  }
  emittedFunctions.directSegmentIds.forEach((id) => directSegmentIds.add(id));
  const localImports: string[] = [];
  const pushBuildImport = () => {
    const buildImport = `import { isServer as ${LIB_IS_SERVER} } from '@qwik.dev/core/build';`;
    if (!localImports.includes(buildImport)) {
      localImports.push(buildImport);
    }
  };
  for (const component of inlineComponents) {
    imports.add(QwikWord.ComponentQrl);
    const qrl = `q_${component.symbolName}`;
    if (libMode) {
      imports.add(QwikWord.QrlWithChunk);
      imports.add(QwikWord.InlinedQrl);
      pushBuildImport();
      hoists.push(
        `const ${qrl} = ${LIB_IS_SERVER}\n  ? /*#__PURE__*/ ${QwikWord.InlinedQrl}(${component.symbolName}, ${JSON.stringify(component.symbolName)})\n  : /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
          component.importPath
        )}, () => import(${JSON.stringify(component.importPath)}), ${JSON.stringify(
          component.symbolName
        )});`
      );
    } else {
      imports.add(QwikWord.NoopQrl);
      hoists.push(
        `const ${qrl} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(component.symbolName)});`,
        `${qrl}.s(${component.symbolName});`
      );
    }
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
  const emittedSegmentIds = new Set<string>();
  for (const segment of segments) {
    if (
      emittedSegmentIds.has(segment.id) ||
      segment.qrl?.kind === 'sync' ||
      isModuleStyleBoundary(segment)
    ) {
      continue;
    }
    emittedSegmentIds.add(segment.id);
    const qrl = qrlName(segment);
    if (libMode) {
      // library qrls carry their chunk for client laziness, but the server is never lazy:
      // when the implementation is in-module, a build-time env split resolves it eagerly on
      // the server while client builds fold to the lazy chunk and drop the implementation
      const path = getSegmentImportPath(inputPath, segment, explicitExtensions);
      imports.add(QwikWord.QrlWithChunk);
      const lazyExpression = `/*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
        path
      )}, () => import(${JSON.stringify(path)}), ${JSON.stringify(segment.symbolName)})`;
      const inline = inlineSegmentCode.get(segment.id);
      const implementation = segment.implementationInOrigin
        ? `export const ${segment.symbolName} = ${source.slice(
            segment.functionRange[0],
            segment.functionRange[1]
          )};`
        : hasRawSsrModuleRootImplementation(segment, segments)
          ? `const ${segment.symbolName} = ${source.slice(
              segment.functionRange[0],
              segment.functionRange[1]
            )};`
          : inline;
      if (implementation === undefined) {
        // no in-module implementation (events, local components, ...): lazy carrier only
        hoists.push(`const ${qrl} = ${lazyExpression};`);
        continue;
      }
      imports.add(QwikWord.InlinedQrl);
      pushBuildImport();
      const bodyLines: string[] = [];
      for (const line of implementation.split('\n')) {
        if (line.startsWith('import ')) {
          if (!localImports.includes(line)) {
            localImports.push(line);
          }
        } else {
          bodyLines.push(line);
        }
      }
      hoists.push(
        `${bodyLines.join('\n').trim()}\nconst ${qrl} = ${LIB_IS_SERVER}\n  ? /*#__PURE__*/ ${QwikWord.InlinedQrl}(${segment.symbolName}, ${JSON.stringify(segment.symbolName)})\n  : ${lazyExpression};`
      );
      continue;
    }
    // v2-parity: server qrls are chunkless; serialization maps symbol → client chunk via the
    // manifest, so the module adds no static chunk imports and the server graph stays sparse
    const declaration = `const ${qrl} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(
      segment.symbolName
    )});`;
    imports.add(QwikWord.NoopQrl);
    const inline = inlineSegmentCode.get(segment.id);
    if (segment.implementationInOrigin || hasRawSsrModuleRootImplementation(segment, segments)) {
      // the body stays in this module: the closure only runs after module evaluation, so
      // module bindings declared below are safe to reference, and captures stay in scope
      const implementation = `${segment.implementationInOrigin ? 'export ' : ''}const ${
        segment.symbolName
      } = ${source.slice(segment.functionRange[0], segment.functionRange[1])};`;
      hoists.push(`${implementation}\n${declaration}\n${qrl}.s(${segment.symbolName});`);
    } else if (inline !== undefined) {
      // blob import lines dedupe module-wide: duplicate bindings are illegal in one module
      const bodyLines: string[] = [];
      for (const line of inline.split('\n')) {
        if (line.startsWith('import ')) {
          if (!localImports.includes(line)) {
            localImports.push(line);
          }
        } else {
          bodyLines.push(line);
        }
      }
      hoists.push(
        `${bodyLines.join('\n').trim()}\n${declaration}\n${qrl}.s(${segment.symbolName});`
      );
    } else {
      hoists.push(declaration);
    }
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
  wireBlock?: import('../../../src/emit-plan-ssr').WireBlockMatch,
  planData: SsrPlanData = EMPTY_PLAN_DATA
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
      segment.kind === 'expression' ||
      segment.kind === 'localComponent') &&
    wireBlock?.render.ops !== undefined &&
    // an owned root range needs a declared id the generator does not allocate yet
    (wireBlock.render.ssr.needsRootRange !== true || planned.surroundingRangeId !== null)
  ) {
    const generated = emitJsSegmentBlock(
      wireBlock.render as never,
      chunkSegmentMetas(segments, source, inputPath, explicitExtensions, segment.id),
      planData.defs as never,
      planData.contexts,
      planData.pluginFns as never,
      { props: generatedNames.props, ctx: generatedNames.ctx, invokeCtx: generatedNames.invokeCtx },
      // component-prop captures ride the props param, not the `_captures` prelude
      segment.captures
        .filter((capture) => capture.access !== 'component-prop')
        .map((capture) => ({ binding: capture.bindingId, name: capture.name })),
      // row params bind by their source names, matching the emitted head
      (planned.parameterBindingIds ?? []).map((binding, index) => ({
        binding,
        name: source.slice(segment.paramRanges[index][0], segment.paramRanges[index][1]),
      })),
      planData.moduleBindingName,
      planData.bindingName,
      planData.importLocalName,
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
      wireBlock.providesContext === true,
      planned.surroundingRangeId
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
  const detail = lastUngeneratableDetail();
  ungeneratedReason = `segment "${segment.symbolName}" uses a construct the compiler cannot lower yet${
    detail === '' ? '' : ` (${detail})`
  }`;
  return null;
}

/** Segment metadata for chunk generation: `resolved` mirrors the chunk's own `.s()` hoists. */
function chunkSegmentMetas(
  segments: readonly SegmentPlan[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  parentId: string | null
) {
  return segments.map((candidate) => ({
    id: candidate.id,
    symbolName: candidate.symbolName,
    chunk: getSegmentImportPath(inputPath, candidate, explicitExtensions),
    kind: candidate.kind,
    resolved:
      candidate.parentId === parentId &&
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
    ...(candidate.qrl?.kind === 'sync' && candidate.argumentRanges[0] != null
      ? {
          syncSource: source.slice(
            candidate.argumentRanges[0]![0],
            candidate.argumentRanges[0]![1]
          ),
        }
      : {}),
    captures: candidate.captures.map((capture) => ({
      binding: capture.bindingId,
      name: capture.name,
      source: capture.source,
      access: capture.access,
    })),
  }));
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
  componentReturnMode: SsrComponentReturnModeResolver,
  planData: SsrPlanData = EMPTY_PLAN_DATA
): EmittedSegmentRender | null {
  const planned = planSsrRenderFunction(render, segments, componentReturnMode);
  if (planned === null) {
    return null;
  }
  const block = emitSsrOpPlan(
    null,
    segments,
    componentReturnMode,
    source,
    planData.bindingName,
    undefined,
    undefined,
    render
  );
  if (block === null) {
    ungeneratedReason = 'a module-level JSX function has no SSR plan';
    return null;
  }
  const generated = emitJsSegmentBlock(
    block as never,
    chunkSegmentMetas(segments, source, inputPath, explicitExtensions, null),
    planData.defs as never,
    planData.contexts,
    planData.pluginFns as never,
    { props: generatedNames.props, ctx: generatedNames.ctx, invokeCtx: generatedNames.invokeCtx },
    [],
    [],
    planData.moduleBindingName,
    planData.bindingName,
    planData.importLocalName
  );
  if (generated === null) {
    const detail = lastUngeneratableDetail();
    ungeneratedReason = `a module-level JSX function uses a construct the compiler cannot lower yet${
      detail === '' ? '' : ` (${detail})`
    }`;
    return null;
  }
  for (const name of generated.imports) {
    imports.add(name);
  }
  return {
    hoists: [...generated.chunkImports, ...generated.hoists],
    statements: generated.statements,
    value: generated.value,
    directSegmentIds: planned.directSegmentIds,
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
        // the key addresses the container's sync-function table
        value: `${callee}(${value}, ${JSON.stringify(segment.symbolName)})`,
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

function emitInvokeRender(statements: readonly string[], value: string): string {
  const body = [...statements, `return ${value};`].map((statement) => `  ${statement}`).join('\n');
  return `invoke(${QwikGenWord.InvokeContext}, () => {\n${body}\n})`;
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
