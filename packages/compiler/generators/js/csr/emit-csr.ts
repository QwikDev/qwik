import type { SourceRange } from '../../../src/types';
import {
  emitComponentFunction,
  emitComponentParamSetup,
  emitComponentRangeReplacement,
} from '../../../src/emit-component';
import type { EmittedComponentCode, EmittedModule } from '../../../src/emitted-module';
import {
  appendCsrQrlReplacements,
  applyReplacements,
  emitCapturedQrlReference,
  emitFunctionReference as emitQrlFunctionReference,
  emitModuleStyleBoundary,
  isModuleStyleBoundary,
  TargetImportResolver,
} from '../../../src/emit-qrl';
import { emitFunctionRenders } from '../../../src/emit-function';
import { getSegmentImportPath, hoistLazyQrlReference } from '../shared/emit-segment';
import { shouldEmitSegmentModule } from '../../../src/segment-plan';
import {
  planCsr,
  planCsrRenderFunction,
  planCsrSegmentRender,
  type CsrComponentCardinalityResolver,
  type CsrCollectionRowPlan,
  type CsrOperationPlan,
  type CsrDirectComponentPlan,
  type CsrEventHandlerPlan,
  type CsrPlan,
  type CsrPropPlan,
  type CsrRefPlan,
  type CsrRefStep,
  type CsrRootPlan,
  type CsrSegmentReferencePlan,
  type CsrValuePlan,
} from './plan-csr';
import type {
  BindingId,
  ComponentDefinition,
  ComponentOutput,
  FunctionRenderPlan,
  InlineComponentReferencePlan,
  RenderFunctionPlan,
  SegmentPlan,
} from '../../../src/plan-types';
import {
  DEFAULT_GENERATED_NAMES,
  QWIK_IMPORT,
  QwikGenWord,
  QwikHooks,
  QwikWord,
  type GeneratedNames,
} from '../../../src/words';

export interface CsrRender {
  readonly hoists: string[];
  readonly statements: string[];
  readonly value: string;
  readonly directSegmentIds: readonly string[];
  readonly async: boolean;
  readonly needsId: boolean;
  readonly idBase: string;
  readonly runtimeParameters?: readonly string[];
  readonly trailingRuntimeParameters?: readonly string[];
  readonly parameterBindingIds?: readonly BindingId[];
}

interface CsrEmitContext {
  readonly source: string;
  readonly inputPath: string;
  readonly explicitExtensions: boolean;
  readonly imports: Set<string>;
  readonly refNames: ReadonlyMap<number, string>;
  readonly operationNames: Map<number, string | readonly string[]>;
  readonly rootOperationIds: ReadonlySet<number>;
  readonly hoists: string[];
  readonly lazySegmentIds: Set<string>;
  readonly inlineDirectSegmentIds: Set<string>;
  readonly segments: ReadonlyMap<string, SegmentPlan>;
  readonly qrlImports: TargetImportResolver;
  readonly localImplementationSource: string | null;
  readonly runtimeStyleScopeName: string | null;
  readonly generatedNames: GeneratedNames;
  readonly next: (prefix: string) => string;
  /** `<Reveal>` group variables already declared for the current render function. */
  readonly revealGroups: Map<number, string>;
  /** Initial runs whose pending-ness chains into the render's return via maybeThen. */
  readonly pendingChains: string[];
}

interface CsrOperationEmission {
  readonly declarations: string[];
  readonly statements: string[];
}

interface CsrDomBatch {
  readonly effect: string;
  readonly update: string;
  readonly operations: string[];
}

const REF_HELPERS: Record<Exclude<CsrRefStep, 'content'>, QwikWord> = {
  firstChild: QwikWord.FirstChild,
  nextSibling: QwikWord.NextSibling,
};

export function emitCsrModule(
  outputs: readonly ComponentOutput[],
  segments: readonly SegmentPlan[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  localImplementationSource: string | null,
  qrlImports: TargetImportResolver,
  componentCardinality: CsrComponentCardinalityResolver,
  generatedNames: GeneratedNames,
  functions: readonly FunctionRenderPlan[],
  moduleRoots: readonly SegmentPlan[],
  inlineComponents: readonly InlineComponentReferencePlan[],
  libMode = false
): EmittedModule | null {
  const hoists: string[] = [];
  const components: EmittedComponentCode[] = [];
  const imports = new Set<string>();
  const directSegmentIds = new Set<string>();
  const replacements: Array<{ range: SourceRange; value: string }> = [];
  for (const segment of moduleRoots) {
    if (isModuleStyleBoundary(segment)) {
      const replacement = emitModuleStyleBoundary(segment, source, qrlImports);
      if (replacement === null) {
        return null;
      }
      replacements.push({ range: segment.range, value: replacement });
      continue;
    }
    // explicit $() module values keep their v2 qrl identity: lazy chunk, no eager import
    const isExplicitQrlValue = segment.stripped !== true && segment.qrl?.kind === 'explicit';
    if (segment.stripped !== true && !isExplicitQrlValue) {
      directSegmentIds.add(segment.id);
    }
    const reference = isExplicitQrlValue
      ? hoistLazyQrlReference(
          segment,
          segment.captures.map((capture) => capture.name),
          inputPath,
          explicitExtensions,
          imports,
          hoists
        )
      : emitQrlFunctionReference(segment, imports);
    if (
      !appendCsrQrlReplacements(
        segment,
        reference,
        qrlImports,
        localImplementationSource,
        replacements,
        imports
      )
    ) {
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
      emitCsrFunctionRender(
        symbolName,
        render,
        code,
        names,
        allSegments,
        path,
        extensions,
        componentCardinality,
        generated
      ),
    generatedNames
  );
  if (emittedFunctions === null) {
    return null;
  }
  hoists.push(...emittedFunctions.hoists);
  replacements.push(...emittedFunctions.replacements);
  emittedFunctions.directSegmentIds.forEach((id) => directSegmentIds.add(id));
  for (const component of inlineComponents) {
    imports.add(QwikWord.WithCaptures);
    replacements.push({
      range: component.replacementRange,
      value: `${QwikWord.WithCaptures}(${component.symbolName}, [${component.captureNames.join(', ')}])`,
    });
  }
  for (const output of outputs) {
    const captureNames = output.result.captures.map((capture) => capture.name);
    if (captureNames.length > 0) {
      imports.add(QwikWord.Captures);
    }
    const plan = planCsr(output.result, source, componentCardinality, generatedNames);
    if (plan === null) {
      return null;
    }
    const name = output.component.localName ?? output.component.exportName;
    const render = emitCsrPlan(
      name,
      plan,
      source,
      inputPath,
      explicitExtensions,
      imports,
      qrlImports,
      localImplementationSource,
      generatedNames
    );
    if (render === null) {
      return null;
    }
    for (const segmentId of render.directSegmentIds) {
      directSegmentIds.add(segmentId);
    }
    hoists.push(...render.hoists);
    components.push({
      identity: output.component.identity,
      moduleCode: emitCsrComponent(output.component, render, source, generatedNames, captureNames),
      rangeCode: emitCsrComponentRange(
        output.component,
        render,
        source,
        generatedNames,
        captureNames
      ),
    });
  }
  const seenSegments = new Set<string>();
  const segmentImports = segments.flatMap((segment) => {
    if (
      seenSegments.has(segment.id) ||
      !directSegmentIds.has(segment.id) ||
      segment.stripped === true
    ) {
      return [];
    }
    seenSegments.add(segment.id);
    return [
      `import { ${segment.symbolName} } from ${JSON.stringify(
        getSegmentImportPath(inputPath, segment, explicitExtensions)
      )};`,
    ];
  });
  if (libMode) {
    // libraries resume in a consumer app: every segment must ship as an exporting chunk the
    // bundler keeps, so symbol resolution can import it. The bare qrl is the import edge.
    imports.add(QwikWord.QrlWithChunk);
    for (const segment of segments) {
      // even a segment that already has a `q_` hoist needs this: that one is pure, so a consumer
      // app drops it along with the import edge, and the chunk the server references is never built
      if (!shouldEmitSegmentModule(segment, 'csr')) {
        continue;
      }
      const path = getSegmentImportPath(inputPath, segment, explicitExtensions);
      hoists.push(
        `${QwikWord.QrlWithChunk}(${JSON.stringify(path)}, () => import(${JSON.stringify(
          path
        )}), ${JSON.stringify(segment.symbolName)});`
      );
    }
  }
  return {
    imports: [...imports],
    localImports: qrlImports
      .declarations({ source: QWIK_IMPORT, names: imports })
      .concat(segmentImports),
    hoists,
    components,
    replacements,
  };
}

function emitCsrComponent(
  component: ComponentDefinition,
  render: CsrRender,
  source: string,
  generatedNames: GeneratedNames,
  captureNames: readonly string[]
): string {
  return emitComponentFunction(
    component,
    render.statements,
    render.value,
    source,
    render.async,
    generatedNames,
    render.needsId ? render.idBase : null,
    captureNames
  );
}

function emitCsrComponentRange(
  component: ComponentDefinition,
  render: CsrRender,
  source: string,
  generatedNames: GeneratedNames,
  captureNames: readonly string[]
): string {
  return emitComponentRangeReplacement(
    component,
    render.statements,
    render.value,
    source,
    render.async,
    generatedNames,
    render.needsId ? render.idBase : null,
    captureNames
  );
}

export function emitCsrPlan(
  name: string,
  plan: CsrPlan,
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  imports: Set<string>,
  qrlImports: TargetImportResolver = new TargetImportResolver(),
  localImplementationSource: string | null = null,
  generatedNames: GeneratedNames = DEFAULT_GENERATED_NAMES,
  optimizeCollectionRow = false
): CsrRender | null {
  const next = createNameAllocator();
  const templateName = `${sanitizeName(name)}_${next(QwikGenWord.Template)}`;
  const fragmentName = next(QwikGenWord.Fragment);
  const setup = emitCsrSetup(
    plan,
    source,
    inputPath,
    explicitExtensions,
    imports,
    qrlImports,
    localImplementationSource,
    generatedNames
  );
  if (setup === null) {
    return null;
  }
  const statements: string[] = [];
  if (plan.output !== null) {
    const context: CsrEmitContext = {
      source,
      inputPath,
      explicitExtensions,
      imports,
      generatedNames,
      refNames: new Map(),
      operationNames: new Map(),
      rootOperationIds: new Set(),
      hoists: [],
      lazySegmentIds: new Set(),
      inlineDirectSegmentIds: new Set(),
      segments: new Map(plan.segments.map((segment) => [segment.id, segment])),
      qrlImports,
      localImplementationSource,
      runtimeStyleScopeName: plan.runtimeStyleScopeName,
      next,
      revealGroups: new Map(),
      pendingChains: [],
    };
    if (plan.output.kind === 'component') {
      const component = emitDirectComponent(plan.output, context, statements);
      return finalizeCsrRender(
        plan,
        setup,
        imports,
        statements,
        component,
        context.hoists,
        context.inlineDirectSegmentIds
      );
    }
    return finalizeCsrRender(
      plan,
      setup,
      imports,
      statements,
      emitValue(plan.output, context),
      context.hoists,
      context.inlineDirectSegmentIds
    );
  }
  const refNames = new Map<number, string>();
  const emittedRefs: { name: string; path: readonly CsrRefStep[] }[] = [];
  const usedRefs = getUsedRefs(plan);
  const directElementRef = optimizeCollectionRow ? getDirectElementRef(plan) : null;
  if (directElementRef === null) {
    statements.push(`const ${fragmentName} = ${templateName}(${generatedNames.ctx}.document);`);
  } else {
    const elementName = next(QwikGenWord.Element);
    refNames.set(directElementRef.id, elementName);
    emittedRefs.push({ name: elementName, path: directElementRef.path });
    statements.push(`const ${elementName} = ${templateName}(${generatedNames.ctx}.document);`);
  }
  const usedRefPaths = new Set(
    plan.refs.filter((ref) => usedRefs.has(ref.id)).map((ref) => ref.path.join('/'))
  );
  const sharedPrefixes = optimizeCollectionRow
    ? getSharedRefPrefixes(plan, usedRefs)
    : new Set<string>();
  for (const ref of plan.refs) {
    if (!usedRefs.has(ref.id)) {
      continue;
    }
    if (ref.id === directElementRef?.id) {
      continue;
    }
    emitSharedRefPrefixes(
      fragmentName,
      ref.path,
      sharedPrefixes,
      usedRefPaths,
      emittedRefs,
      imports,
      statements,
      next
    );
    const prefix =
      ref.kind === 'element'
        ? QwikGenWord.Element
        : ref.kind === 'text'
          ? QwikGenWord.Text
          : ref.kind === 'range-start'
            ? 'start'
            : ref.kind === 'range-end'
              ? 'end'
              : 'marker';
    const refName = next(prefix);
    refNames.set(ref.id, refName);
    const { path, steps } = emitShortestRefPath(fragmentName, ref.path, emittedRefs);
    for (const step of steps) {
      if (step !== 'content') {
        imports.add(REF_HELPERS[step]);
      }
    }
    statements.push(`const ${refName} = ${path};`);
    emittedRefs.push({ name: refName, path: ref.path });
  }

  const context: CsrEmitContext = {
    source,
    inputPath,
    explicitExtensions,
    imports,
    generatedNames,
    refNames,
    operationNames: new Map(),
    rootOperationIds: new Set(
      plan.roots.flatMap((root) => (root.kind === 'operation' ? [root.operation] : []))
    ),
    hoists: [],
    lazySegmentIds: new Set(),
    inlineDirectSegmentIds: new Set(),
    segments: new Map(plan.segments.map((segment) => [segment.id, segment])),
    qrlImports,
    localImplementationSource,
    runtimeStyleScopeName: plan.runtimeStyleScopeName,
    next,
    revealGroups: new Map(),
    pendingChains: [],
  };
  const batchKeys = getDomEffectBatchKeys(plan.operations);
  const batches = new Map<string, CsrDomBatch>();
  for (const operation of plan.operations) {
    const batchKey = getDomEffectBatchKey(operation);
    const batch =
      batchKey !== null && batchKeys.has(batchKey)
        ? getCsrBatch(batchKey, batches, next)
        : undefined;
    const emitted = emitCsrOperation(operation, context, batch);
    if (emitted === null) {
      return null;
    }
    statements.push(...emitted.declarations);
    statements.push(...emitted.statements);
  }
  if (batches.size > 0) {
    imports.add(QwikWord.CreateDomBatchEffect);
    for (const batch of batches.values()) {
      statements.push(
        `function ${batch.update}() { ${batch.operations.join('; ')}; }`,
        `const ${batch.effect} = ${QwikWord.CreateDomBatchEffect}(${batch.update}, ${context.generatedNames.ctx}.scheduler);`
      );
    }
  }

  const templateFactory =
    directElementRef === null ? QwikWord.CreateTemplate : QwikWord.CreateElementTemplate;
  imports.add(templateFactory);
  let value = emitRoots(plan.roots, context.operationNames, refNames);
  if (context.pendingChains.length > 0) {
    imports.add(QwikWord.MaybeThen);
    // pending initial runs settle before the value evaluates; sync runs stay synchronous
    value = context.pendingChains.reduceRight(
      (acc, chain) => `${QwikWord.MaybeThen}(${chain}, () => ${acc})`,
      value
    );
  }
  return finalizeCsrRender(
    plan,
    setup,
    imports,
    statements,
    value,
    [
      ...context.hoists,
      `const ${templateName} = ${templateFactory}(${JSON.stringify(plan.template)});`,
    ],
    context.inlineDirectSegmentIds
  );
}

function finalizeCsrRender(
  plan: CsrPlan,
  setup: { statements: string[]; hoists: string[] },
  imports: Set<string>,
  renderStatements: string[],
  value: string,
  hoists: string[] = [],
  inlineDirectSegmentIds: ReadonlySet<string> = new Set()
): CsrRender {
  let statements = [...setup.statements, ...renderStatements];
  if (plan.waitForTasks) {
    imports.add(QwikWord.GetActiveInvokeContext);
    imports.add(QwikWord.MaybeThen);
    imports.add('invoke');
    statements = [
      `const ${QwikGenWord.InvokeContext} = ${QwikWord.GetActiveInvokeContext}();`,
      ...setup.statements,
    ];
    value = `${QwikWord.MaybeThen}(${QwikGenWord.InvokeContext}.initialTaskPromise, () => ${emitCsrInvokeRender(
      renderStatements,
      value
    )})`;
  }
  return {
    hoists: [...setup.hoists, ...hoists],
    statements,
    value,
    directSegmentIds: [...new Set([...plan.directSegmentIds, ...inlineDirectSegmentIds])],
    async: plan.async,
    needsId: plan.needsId,
    idBase: plan.idBase,
  };
}

function emitCsrInvokeRender(statements: readonly string[], value: string): string {
  const body = [...statements, `return ${value};`].map((statement) => `  ${statement}`).join('\n');
  return `invoke(${QwikGenWord.InvokeContext}, () => {\n${body}\n})`;
}

function emitCsrFunctionRender(
  symbolName: string,
  render: RenderFunctionPlan,
  source: string,
  imports: Set<string>,
  segments: readonly SegmentPlan[],
  inputPath: string,
  explicitExtensions: boolean,
  componentCardinality: CsrComponentCardinalityResolver,
  generatedNames: GeneratedNames
): CsrRender | null {
  const planned = planCsrRenderFunction(
    render,
    segments,
    source,
    componentCardinality,
    generatedNames
  );
  return planned === null
    ? null
    : emitCsrPlan(
        symbolName,
        planned,
        source,
        inputPath,
        explicitExtensions,
        imports,
        undefined,
        null,
        generatedNames
      );
}

export function emitCsrSegmentRender(
  segment: SegmentPlan,
  source: string,
  imports: Set<string>,
  segments: readonly SegmentPlan[] = [segment],
  inputPath = '',
  explicitExtensions = false,
  componentCardinality?: CsrComponentCardinalityResolver,
  generatedNames = DEFAULT_GENERATED_NAMES
): CsrRender | null {
  const target = planCsrSegmentRender(
    segment,
    segments,
    source,
    componentCardinality,
    generatedNames
  );
  if (target === null) {
    return null;
  }
  const emitted = emitCsrPlan(
    segment.symbolName,
    target.plan,
    source,
    inputPath,
    explicitExtensions,
    imports,
    undefined,
    null,
    generatedNames,
    segment.kind === 'collectionRender' || segment.kind === 'forRender'
  );
  if (emitted === null) {
    return null;
  }
  return {
    ...emitted,
    runtimeParameters: target.runtimeParameters,
    trailingRuntimeParameters: target.trailingRuntimeParameters,
    parameterBindingIds: target.parameterBindingIds,
  };
}

function getDomEffectBatchKeys(operations: readonly CsrOperationPlan[]): Set<string> {
  const seen = new Set<string>();
  const batches = new Set<string>();
  for (const operation of operations) {
    const key = getDomEffectBatchKey(operation);
    if (key === null) {
      continue;
    }
    if (seen.has(key)) {
      batches.add(key);
    }
    seen.add(key);
  }
  return batches;
}

function getDomEffectBatchKey(operation: CsrOperationPlan): string | null {
  if (operation.kind !== 'text' && operation.kind !== 'attribute') {
    return null;
  }
  if (operation.value.kind === 'source') {
    return `source:${operation.value.source}`;
  }
  if (operation.value.kind === 'segment') {
    return `captures:${[...operation.value.reference.captures].sort().join(',')}`;
  }
  return null;
}

function getCsrBatch(
  key: string,
  batches: Map<string, CsrDomBatch>,
  next: (prefix: string) => string
): CsrDomBatch {
  let batch = batches.get(key);
  if (batch === undefined) {
    batch = { effect: next(QwikGenWord.Effect), update: next('batch'), operations: [] };
    batches.set(key, batch);
  }
  return batch;
}

function emitCsrOperation(
  operation: CsrOperationPlan,
  context: CsrEmitContext,
  batch?: CsrDomBatch
): CsrOperationEmission | null {
  const { imports, next, refNames, operationNames } = context;
  switch (operation.kind) {
    case 'text': {
      const target = refNames.get(operation.target);
      if (target === undefined) {
        return null;
      }
      const text = operation.existing ? target : next(QwikGenWord.Text);
      operationNames.set(operation.id, text);
      const statements = operation.existing ? [] : [`${target}.replaceWith(${text});`];
      if (operation.value.kind === 'source') {
        if (batch === undefined) {
          const effect = next(QwikGenWord.Effect);
          imports.add(QwikWord.CreateTextNodeEffect);
          statements.push(
            `const ${effect} = ${QwikWord.CreateTextNodeEffect}(${text}, ${operation.value.source}, ${context.generatedNames.ctx}.scheduler);`,
            `${context.generatedNames.ctx}.scheduler.notify(${effect});`
          );
          return {
            declarations: operation.existing
              ? []
              : [`const ${text} = ${context.generatedNames.ctx}.document.createTextNode('');`],
            statements,
          };
        } else {
          imports.add(QwikWord.PatchTextValue);
          imports.add(QwikWord.ReadTrackedSourceValue);
          batch.operations.push(
            `${QwikWord.PatchTextValue}(${text}, ${QwikWord.ReadTrackedSourceValue}(${operation.value.source}))`
          );
        }
      } else if (operation.value.kind === 'segment') {
        if (batch === undefined) {
          const effect = next(QwikGenWord.Effect);
          imports.add(QwikWord.CreateTextExpressionEffect);
          statements.push(
            `const ${effect} = ${QwikWord.CreateTextExpressionEffect}(${text}, [${operation.value.reference.captures.join(
              ', '
            )}], ${operation.value.reference.symbolName}, ${context.generatedNames.ctx}.scheduler);`,
            `${context.generatedNames.ctx}.scheduler.notify(${effect});`
          );
          return {
            declarations: operation.existing
              ? []
              : [`const ${text} = ${context.generatedNames.ctx}.document.createTextNode('');`],
            statements,
          };
        } else {
          imports.add(QwikWord.PatchTextValue);
          batch.operations.push(
            `${QwikWord.PatchTextValue}(${text}, ${operation.value.reference.symbolName}(${operation.value.reference.captures.join(
              ', '
            )}))`
          );
        }
      } else {
        imports.add(QwikWord.PatchTextValue);
        statements.push(`${QwikWord.PatchTextValue}(${text}, ${operation.value.expression});`);
      }
      return {
        declarations: operation.existing
          ? []
          : [`const ${text} = ${context.generatedNames.ctx}.document.createTextNode('');`],
        statements,
      };
    }
    case 'content': {
      const range = getRangeNames(operation.range, refNames);
      if (range === null) {
        return null;
      }
      const value = next('content');
      const isRoot = context.rootOperationIds.has(operation.id);
      if (operation.cardinality === 'unknown') {
        // the value's shape resolves at runtime — closure, promise, empty, or text
        imports.add(QwikWord.CreateDynamicContent);
        imports.add(QwikWord.MaybeThen);
        if (isRoot) {
          operationNames.set(operation.id, `Array.from(${range.start}.parentNode.childNodes)`);
        }
        const mount = `${QwikWord.MaybeThen}(${QwikWord.CreateDynamicContent}(${emitValue(
          operation.value,
          context
        )}, ${context.generatedNames.ctx}), (${value}) => { for (const node of ${value}) ${range.end}.parentNode.insertBefore(node, ${range.end}); })`;
        if (operation.chained === true) {
          context.pendingChains.push(mount);
          return { declarations: [], statements: [] };
        }
        return {
          declarations: [],
          statements: [`${context.generatedNames.ctx}.scheduler.waitFor(${mount});`],
        };
      }
      let rootValue: string;
      let mount: string;
      if (operation.cardinality === 'one') {
        rootValue = `[${range.start}, ${value}, ${range.end}]`;
        mount = `${range.end}.parentNode.insertBefore(${value}, ${range.end});`;
      } else {
        rootValue = `[${range.start}, ...${value}, ${range.end}]`;
        mount = `for (const node of ${value}) ${range.end}.parentNode.insertBefore(node, ${range.end});`;
      }
      if (isRoot && operation.value.returnMode === 'sync') {
        operationNames.set(operation.id, rootValue);
      }
      if (operation.value.returnMode === 'maybe-promise') {
        imports.add(QwikWord.MaybeThen);
        if (isRoot) {
          operationNames.set(operation.id, `Array.from(${range.start}.parentNode.childNodes)`);
        }
      }
      return {
        declarations: [],
        statements:
          operation.value.returnMode === 'sync'
            ? [`const ${value} = ${emitValue(operation.value, context)};`, mount]
            : [
                `${context.generatedNames.ctx}.scheduler.waitFor(${QwikWord.MaybeThen}(${emitValue(
                  operation.value,
                  context
                )}, (${value}) => { ${mount} }));`,
              ],
      };
    }
    case 'content-effect': {
      const range = getRangeNames(operation.range, refNames);
      if (range === null) {
        return null;
      }
      const content = next('content');
      const isRoot = context.rootOperationIds.has(operation.id);
      imports.add(QwikWord.CreateContentBlock);
      // a chained root commits before the value evaluates: the span holds the nodes too
      operationNames.set(
        operation.id,
        operation.chained === true && isRoot
          ? `Array.from(${range.start}.parentNode.childNodes)`
          : [range.start, range.end]
      );
      if (operation.chained === true) {
        context.pendingChains.push(`${content}.run()`);
      }
      return {
        declarations: [
          `const ${content} = ${QwikWord.CreateContentBlock}(${context.generatedNames.ctx}, ${range.start}, ${range.end}, [${operation.segment.captures.join(
            ', '
          )}], ${operation.segment.symbolName}${isRoot ? ', true' : ''});`,
        ],
        statements:
          operation.chained === true
            ? []
            : [`${context.generatedNames.ctx}.scheduler.notify(${content});`],
      };
    }
    case 'runtime-style': {
      const target = refNames.get(operation.target);
      const scope = context.runtimeStyleScopeName;
      if (target === undefined || scope === null) {
        return null;
      }
      const value = operation.staticClass;
      return {
        declarations: [],
        statements: [
          value === null || value === ''
            ? `if (${scope}) ${target}.className = ${scope};`
            : `${target}.className = ${scope} ? ${scope} + ${JSON.stringify(` ${value}`)} : ${JSON.stringify(value)};`,
        ],
      };
    }
    case 'ref': {
      const target = refNames.get(operation.target);
      if (target === undefined) {
        return null;
      }
      return {
        declarations: [],
        statements: [emitRefStatement(operation.value, operation.mode, target, context)],
      };
    }
    case 'attribute': {
      const target = refNames.get(operation.target);
      if (target === undefined) {
        return null;
      }
      if (
        operation.value.kind === 'expression' &&
        operation.value.compilerString &&
        operation.styleScopedId === null &&
        !operation.runtimeStyleScope
      ) {
        return {
          declarations: [],
          statements: [
            `${target}.setAttribute(${JSON.stringify(operation.name)}, ${emitValue(operation.value)});`,
          ],
        };
      }
      if (operation.value.kind === 'source') {
        if (batch !== undefined) {
          imports.add(QwikWord.PatchAttrValue);
          imports.add(QwikWord.ReadTrackedSourceValue);
          batch.operations.push(
            `${QwikWord.PatchAttrValue}(${target}, ${JSON.stringify(operation.name)}, ${QwikWord.ReadTrackedSourceValue}(${operation.value.source})${styleScopeArgument(
              operation.styleScopedId,
              operation.runtimeStyleScope,
              context
            )})`
          );
          return { declarations: [], statements: [] };
        }
        const effect = next(QwikGenWord.Effect);
        imports.add(QwikWord.CreateAttrEffect);
        return {
          declarations: [],
          statements: [
            `const ${effect} = ${QwikWord.CreateAttrEffect}(${target}, ${JSON.stringify(
              operation.name
            )}, ${operation.value.source}, ${context.generatedNames.ctx}.scheduler${styleScopeArgument(
              operation.styleScopedId,
              operation.runtimeStyleScope,
              context
            )});`,
            `${context.generatedNames.ctx}.scheduler.notify(${effect});`,
          ],
        };
      }
      if (operation.value.kind === 'segment') {
        if (batch !== undefined) {
          imports.add(QwikWord.PatchAttrValue);
          batch.operations.push(
            `${QwikWord.PatchAttrValue}(${target}, ${JSON.stringify(operation.name)}, ${
              operation.value.reference.symbolName
            }(${operation.value.reference.captures.join(', ')})${styleScopeArgument(
              operation.styleScopedId,
              operation.runtimeStyleScope,
              context,
              ')'
            )}`
          );
          return { declarations: [], statements: [] };
        }
        const effect = next(QwikGenWord.Effect);
        imports.add(QwikWord.CreateAttrExpressionEffect);
        return {
          declarations: [],
          statements: [
            `const ${effect} = ${QwikWord.CreateAttrExpressionEffect}(${target}, ${JSON.stringify(
              operation.name
            )}, [${operation.value.reference.captures.join(', ')}], ${
              operation.value.reference.symbolName
            }, ${context.generatedNames.ctx}.scheduler${styleScopeArgument(
              operation.styleScopedId,
              operation.runtimeStyleScope,
              context
            )});`,
            `${context.generatedNames.ctx}.scheduler.notify(${effect});`,
          ],
        };
      }
      imports.add(QwikWord.PatchAttrValue);
      return {
        declarations: [],
        statements: [
          `${QwikWord.PatchAttrValue}(${target}, ${JSON.stringify(operation.name)}, ${
            operation.value.expression
          }${styleScopeArgument(operation.styleScopedId, operation.runtimeStyleScope, context)});`,
        ],
      };
    }
    case 'element-props': {
      const target = refNames.get(operation.target);
      if (target === undefined) {
        return null;
      }
      if (operation.segment !== null) {
        const effect = next(QwikGenWord.Effect);
        const stableBoundaries = operation.segment.stableBoundaries.map((boundary) =>
          emitFunctionReference(boundary, imports)
        );
        imports.add(QwikWord.CreatePropsEffect);
        return {
          declarations: [],
          statements: [
            `const ${effect} = ${QwikWord.CreatePropsEffect}(${target}, [${[
              ...operation.segment.captures,
              ...stableBoundaries,
            ].join(
              ', '
            )}], ${operation.segment.symbolName}, ${context.generatedNames.ctx}.scheduler${styleScopeArgument(
              operation.styleScopedId,
              operation.runtimeStyleScope,
              context
            )});`,
            `${context.generatedNames.ctx}.scheduler.waitFor(${effect}.run());`,
          ],
        };
      }
      return {
        declarations: [],
        statements: emitElementPropsStatements(
          target,
          operation.props,
          imports,
          next,
          operation.styleScopedId,
          operation.runtimeStyleScope ? context.runtimeStyleScopeName : null,
          context
        ),
      };
    }
    case 'event': {
      const target = refNames.get(operation.target);
      if (target === undefined) {
        return null;
      }
      const dynamicIndex = operation.handlers.findIndex(
        (handler) =>
          handler.kind === 'value' &&
          handler.value.kind === 'segment' &&
          context.segments.get(handler.value.reference.segmentId)?.kind === 'expression'
      );
      if (dynamicIndex !== -1) {
        const dynamic = operation.handlers[dynamicIndex] as Extract<
          CsrEventHandlerPlan,
          { kind: 'value' }
        >;
        if (dynamic.value.kind !== 'segment') {
          return null;
        }
        const effect = next(QwikGenWord.Effect);
        const before = operation.handlers
          .slice(0, dynamicIndex)
          .map((handler) => emitEventHandler(handler, context));
        const after = operation.handlers
          .slice(dynamicIndex + 1)
          .map((handler) => emitEventHandler(handler, context));
        imports.add(QwikWord.CreateEventEffect);
        return {
          declarations: [],
          statements: [
            `const ${effect} = ${QwikWord.CreateEventEffect}(${target}, ${JSON.stringify(
              operation.name
            )}, [${dynamic.value.reference.captures.join(', ')}], ${
              dynamic.value.reference.symbolName
            }, ${context.generatedNames.ctx}.scheduler, [${before.join(', ')}], [${after.join(
              ', '
            )}]);`,
            `${context.generatedNames.ctx}.scheduler.waitFor(${effect}.run());`,
          ],
        };
      }
      imports.add(QwikWord.SetEvent);
      const only = operation.handlers.length === 1 ? operation.handlers[0] : null;
      if (only?.kind === 'value' && only.value.kind === 'segment') {
        const captures =
          only.value.reference.captures.length === 0
            ? ''
            : `, [${only.value.reference.captures.join(', ')}]`;
        return {
          declarations: [],
          statements: [
            `${QwikWord.SetEvent}(${target}, ${JSON.stringify(operation.name)}, ${
              only.value.reference.symbolName
            }${captures});`,
          ],
        };
      }
      if (only?.kind === 'bind') {
        return {
          declarations: [],
          statements: [
            `${QwikWord.SetEvent}(${target}, ${JSON.stringify(operation.name)}, ${emitEventHandler(
              only,
              context
            )});`,
          ],
        };
      }
      if (only?.kind === 'value') {
        const event = next('event');
        return {
          declarations: [],
          statements: [
            `const ${event} = ${emitEventValue(only.value, context)};`,
            `if (${event}) ${QwikWord.SetEvent}(${target}, ${JSON.stringify(
              operation.name
            )}, ${event});`,
          ],
        };
      }
      const handlers = operation.handlers.map((handler) => emitEventHandler(handler, context));
      if (handlers.length === 0) {
        return { declarations: [], statements: [] };
      }
      return {
        declarations: [],
        statements: [
          `${QwikWord.SetEvent}(${target}, ${JSON.stringify(operation.name)}, [${handlers.join(
            ', '
          )}]);`,
        ],
      };
    }
    case 'component': {
      const range = getRangeNames(operation.range, refNames);
      if (range === null) {
        return null;
      }
      const statements: string[] = [];
      const slotScope = emitSlotScope(operation.slots, context, statements);
      const component = next('component');
      const isRoot = context.rootOperationIds.has(operation.id);
      const roots = isRoot ? next('roots') : null;
      imports.add(QwikWord.CreateComponent);
      let mount: string;
      let mounted: string;
      if (operation.cardinality === 'one') {
        mount = `${range.end}.parentNode.insertBefore(${component}, ${range.end});`;
        mounted = `[${component}]`;
      } else {
        const nodes = operation.cardinality === 'many' ? component : next('nodes');
        if (operation.cardinality === 'unknown') {
          imports.add(QwikWord.ToNodes);
        }
        mount = `${
          operation.cardinality === 'unknown'
            ? `const ${nodes} = ${QwikWord.ToNodes}(${component}); `
            : ''
        }for (const node of ${nodes}) ${range.end}.parentNode.insertBefore(node, ${range.end});`;
        mounted = nodes;
      }
      const options = slotScope === null ? '' : `, { slotScope: ${slotScope} }`;
      const call = `${QwikWord.CreateComponent}(${emitComponentProps(
        operation.props,
        context,
        operation.propsSource
      )}, (props) => ${emitComponentChildCall(operation, context)}${options})`;
      if (operation.returnMode === 'sync') {
        if (roots !== null) {
          operationNames.set(operation.id, mounted);
        }
        return {
          declarations: statements,
          statements: [
            `const ${component} = ${call};`,
            mount,
            `${range.start}.remove();`,
            `${range.end}.remove();`,
          ],
        };
      }
      imports.add(QwikWord.MaybeThen);
      if (roots !== null) {
        operationNames.set(operation.id, roots);
      }
      return {
        declarations:
          roots === null
            ? statements
            : [...statements, `let ${roots} = [${range.start}, ${range.end}];`],
        statements: [
          `${context.generatedNames.ctx}.scheduler.waitFor(${QwikWord.MaybeThen}(${call}, (${component}) => { ${mount}${
            roots === null ? '' : ` ${roots} = ${mounted};`
          } ${range.start}.remove(); ${range.end}.remove(); }));`,
        ],
      };
    }
    case 'branch': {
      const range = getRangeNames(operation.range, refNames);
      if (range === null) {
        return null;
      }
      const branch = next('branch');
      const isRoot = context.rootOperationIds.has(operation.id);
      imports.add(QwikWord.BranchRange);
      imports.add(QwikWord.CreateBranch);
      operationNames.set(operation.id, [range.start, range.end]);
      return {
        declarations: [
          `const ${branch} = ${QwikWord.CreateBranch}(${context.generatedNames.ctx}, new ${QwikWord.BranchRange}(${context.generatedNames.ctx}.document, ${range.start}, ${range.end}), ${emitPlannedFunctionReference(
            operation.condition,
            context
          )}, ${emitPlannedFunctionReference(operation.then, context)}, ${
            operation.else === null
              ? 'undefined'
              : emitPlannedFunctionReference(operation.else, context)
          }${
            operation.idBase === null
              ? isRoot
                ? ", '', true"
                : ''
              : `, ${operation.idBase}${isRoot ? ', true' : ''}`
          });`,
        ],
        statements: [`${context.generatedNames.ctx}.scheduler.notify(${branch});`],
      };
    }
    case 'suspense': {
      const range = getRangeNames(operation.range, refNames);
      if (range === null) {
        return null;
      }
      imports.add(QwikWord.BranchRange);
      imports.add(QwikWord.CreateSuspense);
      operationNames.set(operation.id, [range.start, range.end]);
      const fallback =
        operation.fallback === null
          ? 'undefined'
          : operation.fallback.kind === 'segment'
            ? emitPlannedFunctionReference(operation.fallback.reference, context)
            : emitValue(operation.fallback, context);
      const declarations: string[] = [];
      let revealArgs = '';
      if (operation.reveal !== null) {
        const [groupId, order, collapsed, index, count] = operation.reveal;
        let groupVar = context.revealGroups.get(groupId);
        if (groupVar === undefined) {
          groupVar = `reveal_${groupId}`;
          context.revealGroups.set(groupId, groupVar);
          imports.add(QwikWord.CreateRevealGroup);
          declarations.push(
            `const ${groupVar} = ${QwikWord.CreateRevealGroup}(${JSON.stringify(order)}, ${collapsed}, ${count});`
          );
        }
        revealArgs = `, ${groupVar}, ${index}`;
      }
      return {
        declarations,
        statements: [
          `${QwikWord.CreateSuspense}(${context.generatedNames.ctx}, new ${QwikWord.BranchRange}(${context.generatedNames.ctx}.document, ${range.start}, ${range.end}), ${emitPlannedFunctionReference(operation.content, context)}, ${fallback}, ${operation.delay === null ? '0' : emitValue(operation.delay, context)}${revealArgs});`,
        ],
      };
    }
    case 'slot': {
      const range = getRangeNames(operation.range, refNames);
      if (range === null) {
        return null;
      }
      const slot = next('slot');
      const isRoot = context.rootOperationIds.has(operation.id);
      imports.add(QwikWord.CreateSlot);
      imports.add(QwikWord.MaybeThen);
      if (isRoot) {
        operationNames.set(operation.id, `Array.from(${range.start}.parentNode.childNodes)`);
      }
      return {
        declarations: [],
        statements: [
          `${context.generatedNames.ctx}.scheduler.waitFor(${QwikWord.MaybeThen}(${QwikWord.CreateSlot}(${
            operation.nameSource ?? JSON.stringify(operation.name)
          }, ${
            operation.fallback === null
              ? 'undefined'
              : emitPlannedFunctionReference(operation.fallback, context)
          }${operation.idBase === null ? '' : `, ${operation.idBase}`}), (${slot}) => { for (const node of ${slot}) ${
            range.end
          }.parentNode.insertBefore(node, ${range.end}); }));`,
        ],
      };
    }
    case 'dynamic-slot': {
      const range = getRangeNames(operation.range, refNames);
      if (range === null) {
        return null;
      }
      const content = next('content');
      imports.add(QwikWord.CreateContentBlock);
      operationNames.set(operation.id, [range.start, range.end]);
      return {
        declarations: [
          // the render returns nodes, so it takes the container rather than plain captures
          `const ${content} = ${QwikWord.CreateContentBlock}(${context.generatedNames.ctx}, ${range.start}, ${range.end}, [], ${emitPlannedFunctionReference(
            operation.render,
            context
          )}, false, true);`,
        ],
        statements: [`${context.generatedNames.ctx}.scheduler.notify(${content});`],
      };
    }
    case 'collection': {
      const range = getRangeNames(operation.range, refNames);
      if (range === null) {
        return null;
      }
      if (operation.source.kind === 'direct-reactive') {
        if (operation.row.kind !== 'segment') {
          return null;
        }
        operationNames.set(operation.id, [range.start, range.end]);
        imports.add(QwikWord.CreateCollection);
        const call = `${QwikWord.CreateCollection}(${context.generatedNames.ctx}, ${range.start}, ${range.end}, ${
          operation.source.expression
        }, ${
          operation.key === null ? 'null' : emitPlannedFunctionReference(operation.key, context)
        }, ${emitPlannedFunctionReference(operation.row.reference, context)}, ${
          operation.usesIndexSignal
        }, ${
          operation.idBase === null ? "''" : operation.idBase
        }, ${emitRowShape(operation.rowShape)})`;
        return {
          declarations: [],
          statements: [`${context.generatedNames.ctx}.scheduler.waitFor(${call});`],
        };
      }
      if (operation.source.kind === 'direct-array') {
        if (operation.row.kind !== 'inline') {
          return null;
        }
        const isRoot = context.rootOperationIds.has(operation.id);
        imports.add(QwikWord.CreateCollection);
        const row = emitInlineCollectionRow(operation.row, context);
        if (row === null) {
          return null;
        }
        const call = `${QwikWord.CreateCollection}(${context.generatedNames.ctx}, ${range.start}, ${range.end}, ${
          operation.source.expression
        }, null, ${operation.row.symbolName}, false, ${
          operation.idBase === null ? "''" : operation.idBase
        }, ${emitRowShape(operation.rowShape)}, ${operation.transient})`;
        if (isRoot) {
          operationNames.set(operation.id, `Array.from(${range.start}.parentNode.childNodes)`);
        }
        return {
          declarations: [row],
          statements: [
            operation.row.render.returnMode === 'sync'
              ? `${call};`
              : `${context.generatedNames.ctx}.scheduler.waitFor(${call});`,
          ],
        };
      }
      const isRoot = context.rootOperationIds.has(operation.id);
      const collectionSource = next('collection');
      imports.add(QwikWord.WrapArray);
      imports.add(QwikWord.CreateCollection);
      const sourceQrl = emitPlannedFunctionReference(operation.source.segment, context);
      if (operation.row.kind !== 'segment') {
        return null;
      }
      const call = `${QwikWord.CreateCollection}(${context.generatedNames.ctx}, ${range.start}, ${range.end}, ${collectionSource}, ${
        operation.key === null ? 'null' : emitPlannedFunctionReference(operation.key, context)
      }, ${emitPlannedFunctionReference(operation.row.reference, context)}, ${
        operation.usesIndexSignal
      }${
        operation.idBase === null ? ", ''" : `, ${operation.idBase}`
      }, ${emitRowShape(operation.rowShape)})`;
      if (isRoot) {
        operationNames.set(operation.id, `Array.from(${range.start}.parentNode.childNodes)`);
      }
      return {
        declarations: [
          `const ${collectionSource} = ${QwikWord.WrapArray}(${sourceQrl}${
            operation.source.keepSource ? ', true' : ''
          });`,
        ],
        statements: [`${context.generatedNames.ctx}.scheduler.waitFor(${call});`],
      };
    }
  }
}

function emitInlineCollectionRow(
  row: Extract<CsrCollectionRowPlan, { kind: 'inline' }>,
  context: CsrEmitContext
): string | null {
  const render = emitCsrPlan(
    row.symbolName,
    row.render,
    context.source,
    context.inputPath,
    context.explicitExtensions,
    context.imports,
    context.qrlImports,
    context.localImplementationSource,
    context.generatedNames,
    true
  );
  if (render === null) {
    return null;
  }
  context.hoists.push(...render.hoists);
  const parameters = row.parameterRanges
    .slice(0, row.usedParameterCount)
    .map((range) => context.source.slice(range[0], range[1]));
  if (row.render.needsId) {
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
    ...(row.render.needsContext || parameters.length > 0 || row.render.needsId
      ? [context.generatedNames.ctx]
      : []),
    ...parameters,
    ...(row.render.needsId ? ['_id'] : []),
  ];
  const body = [...render.statements, `return ${render.value};`]
    .map((statement) => `  ${statement}`)
    .join('\n');
  return `${row.async ? 'async ' : ''}function ${row.symbolName}(${signature.join(
    ', '
  )}) {\n${body}\n}`;
}

function emitRowShape(shape: import('./plan-csr').CsrOutputShape): number {
  return shape === 'element' ? 0 : shape === 'node' ? 1 : shape === 'many' ? 2 : 3;
}

function emitDirectComponent(
  component: CsrDirectComponentPlan,
  context: CsrEmitContext,
  statements: string[]
): string {
  const slotScope = emitSlotScope(component.slots, context, statements);
  context.imports.add(QwikWord.CreateComponent);
  return `${QwikWord.CreateComponent}(${emitComponentProps(
    component.props,
    context,
    component.propsSource
  )}, (props) => ${emitComponentChildCall(component, context)}${
    slotScope === null ? '' : `, { slotScope: ${slotScope} }`
  })`;
}

/** A plain local tag defers the element-or-component decision to the runtime. */
function emitComponentChildCall(
  component: { tag: string; unresolvedTag?: true; idBase: string | null },
  context: CsrEmitContext
): string {
  const args = `props, ${context.generatedNames.ctx}${
    component.idBase === null ? '' : `, ${component.idBase}`
  }`;
  if (component.unresolvedTag !== true) {
    return `${component.tag}(${args})`;
  }
  context.imports.add(QwikWord.CreateDynamicTag);
  return `${QwikWord.CreateDynamicTag}(${component.tag}, ${args})`;
}

function emitCsrSetup(
  plan: CsrPlan,
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  imports: Set<string>,
  qrlImports: TargetImportResolver,
  localImplementationSource: string | null,
  generatedNames: GeneratedNames
): { statements: string[]; hoists: string[] } | null {
  const segmentById = new Map(plan.segments.map((segment) => [segment.id, segment]));
  const statements: string[] = [];
  const hoists: string[] = [];
  // lifted local components mark after all setup: captures may be declared below the function
  const pendingComponentMarks: string[] = [];
  for (const setup of plan.setup) {
    if (setup.kind === 'render-value') {
      const render = emitCsrPlan(
        setup.name,
        setup.render,
        source,
        inputPath,
        explicitExtensions,
        imports,
        qrlImports,
        localImplementationSource,
        generatedNames
      );
      if (render === null) {
        return null;
      }
      hoists.push(...render.hoists);
      const body = [...render.statements, `return ${render.value};`]
        .map((statement) => `  ${statement}`)
        .join('\n');
      statements.push(`const ${setup.name} = ${render.async ? 'async ' : ''}() => {\n${body}\n};`);
      continue;
    }
    if (setup.kind === 'local-component') {
      const render = emitCsrPlan(
        setup.name,
        setup.render,
        source,
        inputPath,
        explicitExtensions,
        imports,
        qrlImports,
        localImplementationSource,
        generatedNames
      );
      if (render === null) {
        return null;
      }
      hoists.push(...render.hoists);
      const param = setup.parameter?.param ?? null;
      const propsName = param?.name ?? generatedNames.props;
      const paramSetup = emitComponentParamSetup(param, propsName, source);
      const body = [
        ...(paramSetup === null ? [] : [paramSetup]),
        ...render.statements,
        `return ${render.value};`,
      ]
        .map((statement) => `  ${statement}`)
        .join('\n');
      statements.push(`function ${setup.name}(${propsName}, ${generatedNames.ctx}) {\n${body}\n}`);
      {
        const liftedSegment = segmentById.get(setup.segment);
        if (liftedSegment === undefined) {
          return null;
        }
        const path = getSegmentImportPath(inputPath, liftedSegment, explicitExtensions);
        imports.add(QwikWord.QrlWithChunk);
        imports.add(QwikWord.MarkComponent);
        hoists.push(
          `const q_${liftedSegment.symbolName} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
            path
          )}, () => import(${JSON.stringify(path)}), ${JSON.stringify(liftedSegment.symbolName)});`
        );
        pendingComponentMarks.push(
          `${QwikWord.MarkComponent}(${setup.name}, ${emitCapturedQrlReference(
            liftedSegment.symbolName,
            liftedSegment.captures.map((capture) => capture.name)
          )});`
        );
      }
      continue;
    }
    if (setup.kind === 'style') {
      const helper = setup.scoped ? QwikHooks.UseStylesScoped : QwikHooks.UseStyles;
      imports.add(helper);
      const call = `${helper}(${source.slice(
        setup.argumentRange[0],
        setup.argumentRange[1]
      )}, ${JSON.stringify(setup.styleId)})`;
      statements.push(
        applyReplacements(source, setup.range, [
          {
            range: setup.callRange,
            value: setup.resultUsed
              ? `({ ${setup.scoped ? 'scopeId' : 'styleId'}: ${call} })`
              : call,
          },
        ]).trim()
      );
      continue;
    }
    if (setup.segmentIds.length === 0 && setup.useIds.length === 1 && setup.useIds[0].standalone) {
      continue;
    }
    const replacements: Array<{ range: SourceRange; value: string }> = [];
    for (const useId of setup.useIds) {
      replacements.push({ range: useId.range, value: `(_id + 'u${useId.ordinal}')` });
    }
    for (const jsxValue of setup.jsxValues ?? []) {
      // the literal compiled to a hoisted closure; the statement keeps its handle
      replacements.push({ range: jsxValue.range, value: jsxValue.name });
    }
    for (const temp of setup.destructureTemps ?? []) {
      // pin the call-init container so member reads have a base to resolve through
      replacements.push(
        {
          range: [temp.statementStart, temp.statementStart],
          value: `const ${temp.name} = ${source.slice(temp.initRange[0], temp.initRange[1])};\n  `,
        },
        { range: temp.initRange, value: temp.name }
      );
    }
    for (const segmentId of setup.segmentIds) {
      const segment = segmentById.get(segmentId);
      if (segment === undefined) {
        return null;
      }
      // explicit $() values escape into user space and keep their v2 qrl identity
      const reference =
        segment.stripped !== true && segment.qrl?.kind === 'explicit'
          ? hoistLazyQrlReference(
              segment,
              segment.captures.map((capture) => capture.name),
              inputPath,
              explicitExtensions,
              imports,
              hoists
            )
          : emitQrlFunctionReference(segment, imports);
      if (
        !appendCsrQrlReplacements(
          segment,
          reference,
          qrlImports,
          localImplementationSource,
          replacements,
          imports
        )
      ) {
        return null;
      }
    }
    statements.push(applyReplacements(source, setup.range, replacements).trim());
  }
  statements.push(...pendingComponentMarks);
  if (plan.initializeRuntimeStyleScope) {
    const name = plan.runtimeStyleScopeName;
    if (name === null) {
      return null;
    }
    imports.add('getActiveInvokeContext');
    statements.push(`const ${name} = getActiveInvokeContext().styleScopes?.join(' ');`);
  }
  return { statements, hoists };
}

function emitSlotScope(
  slots: Extract<CsrOperationPlan, { kind: 'component' }>['slots'],
  context: CsrEmitContext,
  statements: string[]
): string | null {
  if (slots.length === 0) {
    return null;
  }
  const scope = context.next('slotScope');
  context.imports.add(QwikWord.CreateSlotScope);
  context.imports.add(QwikWord.RegisterProjection);
  statements.push(`const ${scope} = ${QwikWord.CreateSlotScope}();`);
  for (const slot of slots) {
    statements.push(
      `${QwikWord.RegisterProjection}(${scope}, ${JSON.stringify(
        slot.name
      )}, ${emitPlannedFunctionReference(slot.render, context)}${
        slot.idBase === null ? '' : `, undefined, ${slot.idBase}`
      });`
    );
  }
  return scope;
}

function emitElementPropsStatements(
  target: string,
  props: readonly CsrPropPlan[],
  imports: Set<string>,
  next: (prefix: string) => string,
  styleScopedId: string | null,
  runtimeStyleScopeName: string | null,
  context: CsrEmitContext
): string[] {
  const scope = styleScopeExpression(styleScopedId, runtimeStyleScopeName);
  const statements: string[] = [];
  for (const prop of props) {
    switch (prop.kind) {
      case 'static': {
        imports.add(QwikWord.ApplyDomProps);
        statements.push(
          `${QwikWord.ApplyDomProps}(${target}, { ${JSON.stringify(prop.name)}: ${JSON.stringify(
            prop.value
          )} }${scope === null ? '' : `, null, ${scope}`});`
        );
        break;
      }
      case 'dynamic': {
        if (prop.value.kind === 'segment') {
          const effect = next(QwikGenWord.Effect);
          imports.add(QwikWord.CreateAttrExpressionEffect);
          statements.push(
            `const ${effect} = ${QwikWord.CreateAttrExpressionEffect}(${target}, ${JSON.stringify(
              prop.name
            )}, [${prop.value.reference.captures.join(', ')}], ${
              prop.value.reference.symbolName
            }, ${context.generatedNames.ctx}.scheduler${scope === null ? '' : `, ${scope}`});`,
            `${context.generatedNames.ctx}.scheduler.waitFor(${effect}.run());`
          );
        } else {
          imports.add(QwikWord.PatchAttrValue);
          statements.push(
            `${QwikWord.PatchAttrValue}(${target}, ${JSON.stringify(prop.name)}, ${
              prop.value.expression
            }${scope === null ? '' : `, ${scope}`});`
          );
        }
        break;
      }
      case 'spread': {
        if (prop.value.kind === 'segment') {
          const effect = next(QwikGenWord.Effect);
          imports.add(QwikWord.CreatePropsEffect);
          statements.push(
            `const ${effect} = ${QwikWord.CreatePropsEffect}(${target}, [${prop.value.reference.captures.join(
              ', '
            )}], ${prop.value.reference.symbolName}, ${context.generatedNames.ctx}.scheduler${
              scope === null ? '' : `, ${scope}`
            });`,
            `${context.generatedNames.ctx}.scheduler.waitFor(${effect}.run());`
          );
        } else {
          imports.add(QwikWord.ApplyDomProps);
          statements.push(
            `${QwikWord.ApplyDomProps}(${target}, ${prop.value.expression}${
              scope === null ? '' : `, null, ${scope}`
            });`
          );
        }
        break;
      }
      case 'event': {
        imports.add(QwikWord.ApplyDomProps);
        statements.push(
          `${QwikWord.ApplyDomProps}(${target}, { ${JSON.stringify(prop.name)}: ${emitEventValues(
            prop.values,
            context
          )} });`
        );
        break;
      }
      case 'inner-html': {
        imports.add(QwikWord.ApplyDomProps);
        statements.push(
          `${QwikWord.ApplyDomProps}(${target}, { ${JSON.stringify(
            'dangerouslySetInnerHTML'
          )}: ${isCsrValue(prop.value) ? emitValue(prop.value) : JSON.stringify(prop.value)} });`
        );
        break;
      }
    }
  }
  return statements;
}

function emitRefStatement(
  value: CsrValuePlan,
  mode: 'signal' | 'function' | 'unknown',
  target: string,
  context: CsrEmitContext
): string {
  const expression = emitValue(value, context);
  if (mode === 'signal') {
    return `${expression}.value = ${target};`;
  }
  if (mode === 'function') {
    return `${expression}(${target});`;
  }
  context.imports.add(QwikWord.SetRef);
  return `${QwikWord.SetRef}(${expression}, ${target});`;
}

function styleScopeArgument(
  styleScopedId: string | null,
  runtime: boolean,
  context: CsrEmitContext,
  closing = ''
): string {
  const expression = styleScopeExpression(
    styleScopedId,
    runtime ? context.runtimeStyleScopeName : null
  );
  return expression === null ? closing : `, ${expression}${closing}`;
}

function styleScopeExpression(
  styleScopedId: string | null,
  runtimeStyleScopeName: string | null
): string | null {
  if (runtimeStyleScopeName === null) {
    return styleScopedId === null ? null : JSON.stringify(styleScopedId);
  }
  return styleScopedId === null
    ? runtimeStyleScopeName
    : `${runtimeStyleScopeName} ? ${JSON.stringify(`${styleScopedId} `)} + ${runtimeStyleScopeName} : ${JSON.stringify(styleScopedId)}`;
}

function emitComponentProps(
  props: readonly CsrPropPlan[],
  context: CsrEmitContext,
  propsSource: CsrSegmentReferencePlan | null = null
): string {
  if (propsSource !== null) {
    context.imports.add(QwikWord.CreatePropsProxy);
    context.imports.add(QwikHooks.UseComputed);
    return `${QwikWord.CreatePropsProxy}(${QwikHooks.UseComputed}(${emitPlannedFunctionReference(
      propsSource,
      context
    )}))`;
  }
  const sources: string[] = [];
  const reactive: string[] = [];
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
      case 'dynamic':
        if (prop.value.kind === 'source') {
          // Reading through the source keeps the prop live after resume; a getter closure would
          // serialize as a snapshot.
          context.imports.add(QwikWord.ReadTrackedSourceValue);
          entries.push(
            `get ${JSON.stringify(prop.name)}() { return ${QwikWord.ReadTrackedSourceValue}(${prop.value.source}); }`
          );
          reactive.push(`${JSON.stringify(prop.name)}: ${prop.value.source}`);
          break;
        }
        entries.push(
          `get ${JSON.stringify(prop.name)}() { return ${emitValue(prop.value, context)}; }`
        );
        break;
      case 'event':
        entries.push(`${JSON.stringify(prop.name)}: ${emitEventValues(prop.values, context)}`);
        break;
      case 'inner-html':
        entries.push(
          `${JSON.stringify('dangerouslySetInnerHTML')}: ${
            isCsrValue(prop.value) ? emitValue(prop.value, context) : JSON.stringify(prop.value)
          }`
        );
        break;
      case 'spread':
        flush();
        sources.push(emitValue(prop.value, context));
        break;
    }
  }
  flush();
  if (sources.length === 0) {
    return '{}';
  }
  let merged: string;
  if (sources.length === 1) {
    merged = sources[0];
  } else {
    context.imports.add(QwikWord.MergeProps);
    merged = `${QwikWord.MergeProps}(${sources.join(', ')})`;
  }
  if (reactive.length === 0) {
    return merged;
  }
  context.imports.add(QwikWord.Props);
  return `${QwikWord.Props}(${merged}, { ${reactive.join(', ')} })`;
}

function emitValue(value: CsrValuePlan, context?: CsrEmitContext): string {
  if (value.kind === 'segment') {
    return `${value.reference.symbolName}(${value.reference.captures.join(', ')})`;
  }
  if (
    value.kind !== 'expression' ||
    value.range === null ||
    (value.boundaries.length === 0 && value.embeddedRenders.length === 0) ||
    context === undefined
  ) {
    return `(${value.expression})`;
  }
  const replacements: Array<{ range: SourceRange; value: string }> = [];
  for (const boundary of value.boundaries) {
    const segment = context.segments.get(boundary.segmentId);
    if (segment === undefined) {
      return `(${value.expression})`;
    }
    const reference = emitPlannedFunctionReference(boundary, context);
    if (
      !appendCsrQrlReplacements(
        segment,
        reference,
        context.qrlImports,
        context.localImplementationSource,
        replacements,
        context.imports
      )
    ) {
      return `(${value.expression})`;
    }
  }
  for (const embedded of value.embeddedRenders) {
    const emitted = emitCsrPlan(
      `inline_${embedded.range[0]}_${embedded.range[1]}`,
      embedded.plan,
      context.source,
      context.inputPath,
      context.explicitExtensions,
      context.imports,
      context.qrlImports,
      context.localImplementationSource,
      context.generatedNames
    );
    if (emitted === null) {
      return `(${value.expression})`;
    }
    context.hoists.push(...emitted.hoists);
    emitted.directSegmentIds.forEach((id) => context.inlineDirectSegmentIds.add(id));
    const body = [...emitted.statements, `return ${emitted.value};`]
      .map((statement) => `  ${statement}`)
      .join('\n');
    replacements.push({
      range: embedded.range,
      // a thunk, so consumers see a compiled closure instead of raw nodes
      value: `() => invoke(${context.generatedNames.invokeCtx}, () => (${embedded.async ? 'async ' : ''}() => {\n${body}\n})())`,
    });
  }
  const expression = applyReplacements(context.source, value.range, replacements);
  if (value.embeddedRenders.length === 0) {
    return `(${expression})`;
  }
  context.imports.add(QwikWord.GetActiveInvokeContext);
  context.imports.add('invoke');
  return `(() => { const ${context.generatedNames.invokeCtx} = ${QwikWord.GetActiveInvokeContext}(); return (${expression}); })()`;
}

function emitEventValue(value: CsrValuePlan, context: CsrEmitContext): string {
  return value.kind === 'segment'
    ? emitPlannedFunctionReference(value.reference, context)
    : emitValue(value, context);
}

function emitEventValues(values: readonly CsrValuePlan[], context: CsrEmitContext): string {
  return values.length === 1
    ? emitEventValue(values[0], context)
    : `[${values.map((value) => emitEventValue(value, context)).join(', ')}]`;
}

function emitEventHandler(handler: CsrEventHandlerPlan, context: CsrEmitContext): string {
  if (handler.kind === 'value') {
    return emitEventValue(handler.value, context);
  }
  context.imports.add(QwikWord.InlinedQrl);
  const fn = handler.name === 'checked' ? QwikWord.BindCheckedHandler : QwikWord.BindValueHandler;
  context.imports.add(fn);
  return `${QwikWord.InlinedQrl}(${fn}, ${JSON.stringify(fn)}, [${handler.signal}])`;
}

function emitFunctionReference(reference: CsrSegmentReferencePlan, imports: Set<string>): string {
  if (reference.captures.length === 0) {
    return reference.symbolName;
  }
  imports.add(QwikWord.WithCaptures);
  return `${QwikWord.WithCaptures}(${reference.symbolName}, [${reference.captures.join(', ')}])`;
}

function emitPlannedFunctionReference(
  reference: CsrSegmentReferencePlan,
  context: CsrEmitContext
): string {
  if (reference.delivery === 'direct') {
    return emitFunctionReference(reference, context.imports);
  }
  if (!context.lazySegmentIds.has(reference.segmentId)) {
    context.lazySegmentIds.add(reference.segmentId);
    const path = getSegmentImportPath(context.inputPath, reference, context.explicitExtensions);
    context.imports.add(QwikWord.QrlWithChunk);
    context.hoists.push(
      `const q_${reference.symbolName} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
        path
      )}, () => import(${JSON.stringify(path)}), ${JSON.stringify(reference.symbolName)});`
    );
  }
  return emitCapturedQrlReference(reference.symbolName, reference.captures);
}

function emitRefPath(root: string, path: readonly CsrRefStep[]): string {
  return path.reduce(
    (code, step) => (step === 'content' ? `${code}.content` : `${REF_HELPERS[step]}(${code})`),
    root
  );
}

function emitShortestRefPath(
  root: string,
  path: readonly CsrRefStep[],
  refs: readonly { name: string; path: readonly CsrRefStep[] }[]
): { path: string; steps: readonly CsrRefStep[] } {
  let shortest = emitRefPath(root, path);
  let shortestSteps = path;
  for (const ref of refs) {
    if (startsWithPath(path, ref.path)) {
      const remainingPath = path.slice(ref.path.length);
      const code = emitRefPath(ref.name, remainingPath);
      if (code.length < shortest.length) {
        shortest = code;
        shortestSteps = remainingPath;
      }
    }
  }
  return { path: shortest, steps: shortestSteps };
}

function startsWithPath(path: readonly CsrRefStep[], prefix: readonly CsrRefStep[]): boolean {
  return prefix.every((step, index) => path[index] === step);
}

function getDirectElementRef(plan: CsrPlan): CsrRefPlan | null {
  if (plan.outputShape !== 'element' || plan.roots.length !== 1) {
    return null;
  }
  const root = plan.roots[0];
  if (root.kind !== 'ref') {
    return null;
  }
  const ref = plan.refs.find((candidate) => candidate.id === root.ref);
  return ref?.kind === 'element' && ref.path.length === 1 && ref.path[0] === 'firstChild'
    ? ref
    : null;
}

function getSharedRefPrefixes(plan: CsrPlan, usedRefs: ReadonlySet<number>): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const ref of plan.refs) {
    if (!usedRefs.has(ref.id)) {
      continue;
    }
    for (let length = 1; length < ref.path.length; length++) {
      const key = ref.path.slice(0, length).join('/');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return new Set([...counts].flatMap(([key, count]) => (count > 1 ? [key] : [])));
}

function emitSharedRefPrefixes(
  root: string,
  path: readonly CsrRefStep[],
  sharedPrefixes: ReadonlySet<string>,
  usedRefPaths: ReadonlySet<string>,
  emittedRefs: { name: string; path: readonly CsrRefStep[] }[],
  imports: Set<string>,
  statements: string[],
  next: (prefix: string) => string
): void {
  for (let length = 1; length < path.length; length++) {
    const prefixPath = path.slice(0, length);
    const key = prefixPath.join('/');
    if (
      !sharedPrefixes.has(key) ||
      usedRefPaths.has(key) ||
      emittedRefs.some((ref) => startsWithPath(prefixPath, ref.path) && ref.path.length === length)
    ) {
      continue;
    }
    const { path: emittedPath, steps } = emitShortestRefPath(root, prefixPath, emittedRefs);
    for (const step of steps) {
      if (step !== 'content') {
        imports.add(REF_HELPERS[step]);
      }
    }
    const name = next(QwikGenWord.Element);
    statements.push(`const ${name} = ${emittedPath};`);
    emittedRefs.push({ name, path: prefixPath });
  }
}

function getUsedRefs(plan: CsrPlan): Set<number> {
  const refs = new Set(plan.roots.flatMap((root) => (root.kind === 'ref' ? [root.ref] : [])));
  for (const operation of plan.operations) {
    if ('target' in operation && typeof operation.target === 'number') {
      refs.add(operation.target);
    } else if ('range' in operation) {
      refs.add(operation.range.start);
      refs.add(operation.range.end);
    }
  }
  return refs;
}

function emitRoots(
  roots: readonly CsrRootPlan[],
  operationNames: ReadonlyMap<number, string | readonly string[]>,
  refNames: ReadonlyMap<number, string>
): string {
  const values = roots.flatMap((root) => {
    const value = root.kind === 'ref' ? refNames.get(root.ref) : operationNames.get(root.operation);
    return value === undefined
      ? []
      : typeof value === 'string'
        ? [{ name: value, spread: root.cardinality === 'many' }]
        : value.map((name) => ({ name, spread: false }));
  });
  if (values.length === 0) {
    return '[]';
  }
  if (values.length === 1) {
    return values[0].name;
  }
  return `[${values.map((value) => (value.spread ? `...${value.name}` : value.name)).join(', ')}]`;
}

function getRangeNames(
  range: { readonly start: number; readonly end: number },
  refs: ReadonlyMap<number, string>
): { start: string; end: string } | null {
  const start = refs.get(range.start);
  const end = refs.get(range.end);
  return start === undefined || end === undefined ? null : { start, end };
}

function isCsrValue(value: unknown): value is CsrValuePlan {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    ((value as { kind: string }).kind === 'segment' ||
      (value as { kind: string }).kind === 'expression')
  );
}

function createNameAllocator() {
  const indexes = new Map<string, number>();
  return (prefix: string) => {
    const index = indexes.get(prefix) ?? 0;
    indexes.set(prefix, index + 1);
    return `${prefix}${index}`;
  };
}

function sanitizeName(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}
