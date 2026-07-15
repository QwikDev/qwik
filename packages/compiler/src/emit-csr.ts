import type { SourceRange } from './types';
import { emitComponentFunction, emitComponentRangeReplacement } from './emit-component';
import type { EmittedComponentCode, EmittedModule } from './emitted-module';
import {
  appendCsrQrlReplacements,
  applyReplacements,
  emitCapturedQrlReference,
  emitFunctionReference as emitQrlFunctionReference,
  emitModuleStyleBoundary,
  isModuleStyleBoundary,
  TargetImportResolver,
} from './emit-qrl';
import { getSegmentImportPath } from './emit-segment';
import {
  planCsr,
  planCsrRenderFunction,
  type CsrComponentCardinalityResolver,
  type CsrCollectionRowPlan,
  type CsrOperationPlan,
  type CsrDirectComponentPlan,
  type CsrEventHandlerPlan,
  type CsrPlan,
  type CsrPropPlan,
  type CsrRefStep,
  type CsrRootPlan,
  type CsrSegmentReferencePlan,
  type CsrValuePlan,
} from './plan-csr';
import type { BindingId, ComponentDefinition, ComponentOutput, SegmentPlan } from './plan-types';
import { QwikGenWord, QwikHooks, QwikWord } from './words';

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
  readonly segments: ReadonlyMap<string, SegmentPlan>;
  readonly qrlImports: TargetImportResolver;
  readonly localImplementationSource: string | null;
  readonly runtimeStyleScopeName: string | null;
  readonly next: (prefix: string) => string;
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

const REF_HELPERS: Record<CsrRefStep, QwikWord> = {
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
  componentPropsName: string,
  moduleRoots: readonly SegmentPlan[]
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
    directSegmentIds.add(segment.id);
    if (
      !appendCsrQrlReplacements(
        segment,
        emitQrlFunctionReference(segment, imports),
        qrlImports,
        localImplementationSource,
        replacements
      )
    ) {
      return null;
    }
  }
  for (const output of outputs) {
    const plan = planCsr(output.result, source, componentCardinality, componentPropsName);
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
      localImplementationSource
    );
    if (render === null) {
      return null;
    }
    for (const segmentId of render.directSegmentIds) {
      directSegmentIds.add(segmentId);
    }
    hoists.push(...render.hoists);
    components.push({
      bindingId: output.component.bindingId,
      moduleCode: emitCsrComponent(output.component, render, source, componentPropsName),
      rangeCode: emitCsrComponentRange(output.component, render, source, componentPropsName),
    });
  }
  const seenSegments = new Set<string>();
  const segmentImports = segments.flatMap((segment) => {
    if (seenSegments.has(segment.id) || !directSegmentIds.has(segment.id)) {
      return [];
    }
    seenSegments.add(segment.id);
    return [
      `import { ${segment.symbolName} } from ${JSON.stringify(
        getSegmentImportPath(inputPath, segment, explicitExtensions)
      )};`,
    ];
  });
  return {
    imports: [...imports],
    localImports: qrlImports.declarations().concat(segmentImports),
    hoists,
    components,
    replacements,
  };
}

function emitCsrComponent(
  component: ComponentDefinition,
  render: CsrRender,
  source: string,
  componentPropsName: string
): string {
  return emitComponentFunction(
    component,
    render.statements,
    render.value,
    source,
    render.async,
    componentPropsName,
    render.needsId ? render.idBase : null
  );
}

function emitCsrComponentRange(
  component: ComponentDefinition,
  render: CsrRender,
  source: string,
  componentPropsName: string
): string {
  return emitComponentRangeReplacement(
    component,
    render.statements,
    render.value,
    source,
    render.async,
    componentPropsName,
    render.needsId ? render.idBase : null
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
  localImplementationSource: string | null = null
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
    localImplementationSource
  );
  if (setup === null) {
    return null;
  }
  const statements = setup.statements;
  if (plan.output !== null) {
    if (plan.output.kind === 'component') {
      const context: CsrEmitContext = {
        source,
        inputPath,
        explicitExtensions,
        imports,
        refNames: new Map(),
        operationNames: new Map(),
        rootOperationIds: new Set(),
        hoists: [],
        lazySegmentIds: new Set(),
        segments: new Map(plan.segments.map((segment) => [segment.id, segment])),
        qrlImports,
        localImplementationSource,
        runtimeStyleScopeName: plan.runtimeStyleScopeName,
        next,
      };
      const component = emitDirectComponent(plan.output, context, statements);
      return {
        hoists: [...setup.hoists, ...context.hoists],
        statements,
        value: component,
        directSegmentIds: plan.directSegmentIds,
        async: plan.async,
        needsId: plan.needsId,
        idBase: plan.idBase,
      };
    }
    return {
      hoists: setup.hoists,
      statements,
      value: emitValue(plan.output),
      directSegmentIds: plan.directSegmentIds,
      async: plan.async,
      needsId: plan.needsId,
      idBase: plan.idBase,
    };
  }
  statements.push(`const ${fragmentName} = ${templateName}(ctx.document);`);

  const refNames = new Map<number, string>();
  const emittedRefs: { name: string; path: readonly CsrRefStep[] }[] = [];
  const usedRefs = getUsedRefs(plan);
  for (const ref of plan.refs) {
    if (!usedRefs.has(ref.id)) {
      continue;
    }
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
      imports.add(REF_HELPERS[step]);
    }
    statements.push(`const ${refName} = ${path};`);
    emittedRefs.push({ name: refName, path: ref.path });
  }

  const context: CsrEmitContext = {
    source,
    inputPath,
    explicitExtensions,
    imports,
    refNames,
    operationNames: new Map(),
    rootOperationIds: new Set(
      plan.roots.flatMap((root) => (root.kind === 'operation' ? [root.operation] : []))
    ),
    hoists: [],
    lazySegmentIds: new Set(),
    segments: new Map(plan.segments.map((segment) => [segment.id, segment])),
    qrlImports,
    localImplementationSource,
    runtimeStyleScopeName: plan.runtimeStyleScopeName,
    next,
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
        `const ${batch.effect} = ${QwikWord.CreateDomBatchEffect}(${batch.update}, ctx.scheduler);`
      );
    }
  }

  imports.add(QwikWord.CreateTemplate);
  const value = emitRoots(plan.roots, context.operationNames, refNames);
  return {
    hoists: [
      ...setup.hoists,
      ...context.hoists,
      `const ${templateName} = ${QwikWord.CreateTemplate}(${JSON.stringify(plan.template)});`,
    ],
    statements,
    value,
    directSegmentIds: plan.directSegmentIds,
    async: plan.async,
    needsId: plan.needsId,
    idBase: plan.idBase,
  };
}

export function emitCsrSegmentRender(
  segment: SegmentPlan,
  source: string,
  imports: Set<string>,
  segments: readonly SegmentPlan[] = [segment],
  inputPath = '',
  explicitExtensions = false,
  componentCardinality?: CsrComponentCardinalityResolver,
  componentPropsName = 'props'
): CsrRender | null {
  if (segment.render === null) {
    return null;
  }
  const plan = planCsrRenderFunction(
    segment.render,
    segments,
    source,
    componentCardinality,
    componentPropsName
  );
  if (plan === null) {
    return null;
  }
  const emitted = emitCsrPlan(
    segment.symbolName,
    plan,
    source,
    inputPath,
    explicitExtensions,
    imports
  );
  if (emitted === null) {
    return null;
  }
  const parameterBindingIds = segment.usedParameterBindingIds;
  return {
    ...emitted,
    runtimeParameters: plan.needsContext || parameterBindingIds.length > 0 ? ['ctx'] : [],
    trailingRuntimeParameters: plan.needsId ? ['_id'] : [],
    parameterBindingIds,
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
            `const ${effect} = ${QwikWord.CreateTextNodeEffect}(${text}, ${operation.value.source}, ctx.scheduler);`,
            `ctx.scheduler.notify(${effect});`
          );
          return {
            declarations: operation.existing
              ? []
              : [`const ${text} = ctx.document.createTextNode('');`],
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
            )}], ${operation.value.reference.symbolName}, ctx.scheduler);`,
            `ctx.scheduler.notify(${effect});`
          );
          return {
            declarations: operation.existing
              ? []
              : [`const ${text} = ctx.document.createTextNode('');`],
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
          : [`const ${text} = ctx.document.createTextNode('');`],
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
      let rootValue: string;
      let mount: string;
      if (operation.cardinality === 'one') {
        rootValue = `[${range.start}, ${value}, ${range.end}]`;
        mount = `${range.end}.parentNode.insertBefore(${value}, ${range.end});`;
      } else {
        const nodes =
          operation.cardinality === 'many'
            ? value
            : (() => {
                imports.add(QwikWord.ToNodes);
                return next('nodes');
              })();
        rootValue = `[${range.start}, ...${nodes}, ${range.end}]`;
        mount = `${
          operation.cardinality === 'unknown'
            ? `const ${nodes} = ${QwikWord.ToNodes}(${value}); `
            : ''
        }for (const node of ${nodes}) ${range.end}.parentNode.insertBefore(node, ${range.end});`;
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
            ? [`const ${value} = ${emitValue(operation.value)};`, mount]
            : [
                `ctx.scheduler.waitFor(${QwikWord.MaybeThen}(${emitValue(
                  operation.value
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
      operationNames.set(operation.id, [range.start, range.end]);
      return {
        declarations: [
          `const ${content} = ${QwikWord.CreateContentBlock}(ctx, ${range.start}, ${range.end}, [${operation.segment.captures.join(
            ', '
          )}], ${operation.segment.symbolName}${isRoot ? ', true' : ''});`,
        ],
        statements: [`ctx.scheduler.notify(${content});`],
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
            )}, ${operation.value.source}, ctx.scheduler${styleScopeArgument(
              operation.styleScopedId,
              operation.runtimeStyleScope,
              context
            )});`,
            `ctx.scheduler.notify(${effect});`,
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
            }, ctx.scheduler${styleScopeArgument(
              operation.styleScopedId,
              operation.runtimeStyleScope,
              context
            )});`,
            `ctx.scheduler.notify(${effect});`,
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
            ].join(', ')}], ${operation.segment.symbolName}, ctx.scheduler${styleScopeArgument(
              operation.styleScopedId,
              operation.runtimeStyleScope,
              context
            )});`,
            `ctx.scheduler.waitFor(${effect}.run());`,
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
          operation.runtimeStyleScope ? context.runtimeStyleScopeName : null
        ),
      };
    }
    case 'event': {
      const target = refNames.get(operation.target);
      if (target === undefined) {
        return null;
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
              imports
            )});`,
          ],
        };
      }
      if (only?.kind === 'value') {
        const event = next('event');
        return {
          declarations: [],
          statements: [
            `const ${event} = ${only.value.expression};`,
            `if (${event}) ${QwikWord.SetEvent}(${target}, ${JSON.stringify(
              operation.name
            )}, ${event});`,
          ],
        };
      }
      const handlers = operation.handlers.map((handler) => emitEventHandler(handler, imports));
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
        context
      )}, (props) => ${operation.tag}(props, ctx${
        operation.idBase === null ? '' : `, ${operation.idBase}`
      })${options})`;
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
          `ctx.scheduler.waitFor(${QwikWord.MaybeThen}(${call}, (${component}) => { ${mount}${
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
          `const ${branch} = ${QwikWord.CreateBranch}(ctx, new ${QwikWord.BranchRange}(ctx.document, ${range.start}, ${range.end}), ${emitPlannedFunctionReference(
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
        statements: [`ctx.scheduler.notify(${branch});`],
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
          `ctx.scheduler.waitFor(${QwikWord.MaybeThen}(${QwikWord.CreateSlot}(${JSON.stringify(
            operation.name
          )}, ${
            operation.fallback === null
              ? 'undefined'
              : emitPlannedFunctionReference(operation.fallback, context)
          }${operation.idBase === null ? '' : `, ${operation.idBase}`}), (${slot}) => { for (const node of ${slot}) ${
            range.end
          }.parentNode.insertBefore(node, ${range.end}); }));`,
        ],
      };
    }
    case 'collection': {
      const range = getRangeNames(operation.range, refNames);
      if (range === null) {
        return null;
      }
      if (operation.source.kind === 'direct-reactive') {
        if (operation.key === null || operation.row.kind !== 'segment') {
          return null;
        }
        operationNames.set(operation.id, [range.start, range.end]);
        imports.add(QwikWord.CreateCollection);
        const call = `${QwikWord.CreateCollection}(ctx, ${range.start}, ${range.end}, ${
          operation.source.expression
        }, ${emitPlannedFunctionReference(
          operation.key,
          context
        )}, ${emitPlannedFunctionReference(operation.row.reference, context)}, ${
          operation.usesIndexSignal
        }, ${
          operation.idBase === null ? "''" : operation.idBase
        }, ${emitRowShape(operation.rowShape)})`;
        return {
          declarations: [],
          statements: [`ctx.scheduler.waitFor(${call});`],
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
        const call = `${QwikWord.CreateCollection}(ctx, ${range.start}, ${range.end}, ${
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
              : `ctx.scheduler.waitFor(${call});`,
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
      const call = `${QwikWord.CreateCollection}(ctx, ${range.start}, ${range.end}, ${collectionSource}, ${
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
        statements: [`ctx.scheduler.waitFor(${call});`],
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
    context.localImplementationSource
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
    ...(row.render.needsContext || parameters.length > 0 || row.render.needsId ? ['ctx'] : []),
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
  return `${QwikWord.CreateComponent}(${emitComponentProps(component.props, context)}, (props) => ${
    component.tag
  }(props, ctx${component.idBase === null ? '' : `, ${component.idBase}`})${
    slotScope === null ? '' : `, { slotScope: ${slotScope} }`
  })`;
}

function emitCsrSetup(
  plan: CsrPlan,
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  imports: Set<string>,
  qrlImports: TargetImportResolver,
  localImplementationSource: string | null
): { statements: string[]; hoists: string[] } | null {
  const segmentById = new Map(plan.segments.map((segment) => [segment.id, segment]));
  const statements: string[] = [];
  const hoists: string[] = [];
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
        localImplementationSource
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
    for (const segmentId of setup.segmentIds) {
      const segment = segmentById.get(segmentId);
      if (segment === undefined) {
        return null;
      }
      const reference = emitQrlFunctionReference(segment, imports);
      if (
        !appendCsrQrlReplacements(
          segment,
          reference,
          qrlImports,
          localImplementationSource,
          replacements
        )
      ) {
        return null;
      }
    }
    statements.push(applyReplacements(source, setup.range, replacements).trim());
  }
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
  runtimeStyleScopeName: string | null
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
            }, ctx.scheduler${scope === null ? '' : `, ${scope}`});`,
            `ctx.scheduler.waitFor(${effect}.run());`
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
            )}], ${prop.value.reference.symbolName}, ctx.scheduler${
              scope === null ? '' : `, ${scope}`
            });`,
            `ctx.scheduler.waitFor(${effect}.run());`
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
          `${QwikWord.ApplyDomProps}(${target}, { ${JSON.stringify(prop.name)}: ${emitEventValue(
            prop.value,
            imports
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

function emitComponentProps(props: readonly CsrPropPlan[], context: CsrEmitContext): string {
  const sources: string[] = [];
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
        entries.push(
          `get ${JSON.stringify(prop.name)}() { return ${emitValue(prop.value, context)}; }`
        );
        break;
      case 'event':
        entries.push(
          `${JSON.stringify(prop.name)}: ${emitEventValue(prop.value, context.imports)}`
        );
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
  if (sources.length === 1) {
    return sources[0];
  }
  context.imports.add(QwikWord.MergeProps);
  return `${QwikWord.MergeProps}(${sources.join(', ')})`;
}

function emitValue(value: CsrValuePlan, context?: CsrEmitContext): string {
  if (value.kind === 'segment') {
    return `${value.reference.symbolName}(${value.reference.captures.join(', ')})`;
  }
  if (
    value.kind !== 'expression' ||
    value.range === null ||
    value.boundaries.length === 0 ||
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
    const reference = emitFunctionReference(boundary, context.imports);
    if (
      !appendCsrQrlReplacements(
        segment,
        reference,
        context.qrlImports,
        context.localImplementationSource,
        replacements
      )
    ) {
      return `(${value.expression})`;
    }
  }
  return `(${applyReplacements(context.source, value.range, replacements)})`;
}

function emitEventValue(value: CsrValuePlan, imports: Set<string>): string {
  return value.kind === 'segment'
    ? emitFunctionReference(value.reference, imports)
    : `(${value.expression})`;
}

function emitEventHandler(handler: CsrEventHandlerPlan, imports: Set<string>): string {
  if (handler.kind === 'value') {
    return emitEventValue(handler.value, imports);
  }
  imports.add(QwikWord.InlinedQrl);
  const fn = handler.name === 'checked' ? QwikWord.BindCheckedHandler : QwikWord.BindValueHandler;
  imports.add(fn);
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
  return path.reduce((code, step) => `${REF_HELPERS[step]}(${code})`, root);
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
