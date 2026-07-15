import type { SourceRange } from './types';
import { emitComponentFunction, emitComponentRangeReplacement } from './emit-component';
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
import { getSegmentImportPath, shouldResolveSsrSegment } from './emit-segment';
import { escapeAttr, escapeText, serializeAttrValue } from './html-utils';
import {
  planSsr,
  planSsrSegmentRender,
  type SsrBranchOperation,
  type SsrCollectionOperation,
  type SsrComponentOperation,
  type SsrContentOperation,
  type SsrDynamicOperation,
  type SsrElementOperation,
  type SsrEventHandlerPlan,
  type SsrOperation,
  type SsrPlan,
  type SsrPropOperation,
  type SsrRenderBlockPlan,
  type SsrSlotOperation,
  type SsrComponentReturnModeResolver,
} from './plan-ssr';
import type {
  BindingId,
  OrderedPropPlan,
  ComponentDefinition,
  ComponentOutput,
  SegmentPlan,
  SegmentReferencePlan,
  ValuePlan,
} from './plan-types';
import { QwikAttributes, QwikHooks, QwikWord } from './words';

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

export function emitSsrModule(
  outputs: readonly ComponentOutput[],
  segments: readonly SegmentPlan[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  localImplementationSource: string | null,
  qrlImports: TargetImportResolver,
  componentPropsName: string,
  componentReturnMode: SsrComponentReturnModeResolver,
  moduleRoots: readonly SegmentPlan[]
): EmittedModule | null {
  const imports = new Set<string>();
  const components: EmittedComponentCode[] = [];
  const directSegmentIds = new Set<string>();
  const replacements: Array<{ range: SourceRange; value: string }> = [];

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

  for (const output of outputs) {
    const planned = planSsr(output.result, componentReturnMode);
    if (planned === null) {
      return null;
    }
    planned.directSegmentIds.forEach((id) => directSegmentIds.add(id));
    const componentSegments = new Map(
      output.result.segments.map((segment) => [segment.id, segment])
    );
    const render = emitComponentRender(
      planned,
      source,
      componentSegments,
      qrlImports,
      localImplementationSource,
      componentPropsName
    );
    if (render === null) {
      return null;
    }
    for (const name of render.imports) {
      imports.add(name);
    }
    components.push({
      bindingId: output.component.bindingId,
      moduleCode: emitComponent(
        output.component,
        render,
        source,
        false,
        componentPropsName,
        planned.needsId ? planned.idBase : null
      ),
      rangeCode: emitComponent(
        output.component,
        render,
        source,
        true,
        componentPropsName,
        planned.needsId ? planned.idBase : null
      ),
    });
  }

  const hoists: string[] = [];
  const localImports: string[] = [];
  const emittedSegmentIds = new Set<string>();
  for (const segment of segments) {
    if (
      emittedSegmentIds.has(segment.id) ||
      segment.qrl?.kind === 'sync' ||
      isModuleStyleBoundary(segment) ||
      (segment.parentId !== null && !directSegmentIds.has(segment.id))
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
    localImports: qrlImports.declarations().concat(localImports),
    hoists,
    components,
    replacements,
  };
}

export function emitSsrSegmentRender(
  segment: SegmentPlan,
  source: string,
  imports: Set<string>,
  segments: readonly SegmentPlan[] = [segment],
  inputPath = '',
  explicitExtensions = false,
  componentPropsName = 'props',
  componentReturnMode?: SsrComponentReturnModeResolver
): {
  hoists: string[];
  statements: string[];
  value: string;
  runtimeParameters?: readonly string[];
  trailingRuntimeParameters?: readonly string[];
  parameterBindingIds?: readonly number[];
} | null {
  const renderFunction = segment.render;
  if (renderFunction === null) {
    return segment.kind === 'branchRender' ? { hoists: [], statements: [], value: "''" } : null;
  }
  const planned = planSsrSegmentRender(segment, segments, componentReturnMode);
  if (planned === null) {
    return null;
  }
  const segmentById = new Map(segments.map((candidate) => [candidate.id, candidate]));
  const qrlImports = new TargetImportResolver();
  const setup = emitSetup(
    planned,
    source,
    segmentById,
    qrlImports,
    getInputImportPath(inputPath, explicitExtensions)
  );
  if (setup === null) {
    return null;
  }
  const emitted = new SsrEmitter(
    source,
    segmentById,
    captureNames(segment, undefined, componentPropsName),
    qrlImports,
    getInputImportPath(inputPath, explicitExtensions),
    componentPropsName
  ).emit(planned.render, {
    surroundingRangeId: planned.surroundingRangeId,
    rootAttribute: planned.rowRoot ? QwikAttributes.Row : null,
    rowMarkerId: planned.rowMarker ? 'rowId' : null,
    slotMarkerId: planned.slotMarker ? 'rangeId' : null,
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
    hoists: qrlImports.declarations(),
    statements: [...setup.statements, ...emitted.statements],
    value: emitted.value,
    runtimeParameters: planned.runtimeParameters,
    trailingRuntimeParameters: planned.trailingRuntimeParameters,
    parameterBindingIds: planned.parameterBindingIds,
  };
}

function emitComponentRender(
  plan: SsrPlan,
  source: string,
  segments: ReadonlyMap<string, SegmentPlan>,
  qrlImports: TargetImportResolver,
  localImplementationSource: string | null,
  componentPropsName: string
): (SsrRender & { readonly setup: SsrSetup }) | null {
  const setup = emitSetup(
    plan,
    source,
    segments,
    qrlImports,
    localImplementationSource,
    plan.flushTasks
  );
  if (setup === null) {
    return null;
  }
  const render = new SsrEmitter(
    source,
    segments,
    [],
    qrlImports,
    localImplementationSource,
    componentPropsName
  ).emit(plan.render, {
    surroundingRangeId: null,
    rootAttribute: null,
    rowMarkerId: null,
    slotMarkerId: null,
    contextBoundary: plan.providesContext,
    structuredRoot: !plan.render.staticRoot,
  });
  if (render === null) {
    return null;
  }
  const runtimeScopeName = plan.runtimeStyleScopeName;
  const runtimeScopeStatement =
    runtimeScopeName === null
      ? []
      : [
          `const ${runtimeScopeName} = ${QwikWord.GetActiveInvokeContext}().styleScopes?.join(' ');`,
        ];
  return {
    imports: [
      ...setup.imports,
      ...render.imports,
      ...(runtimeScopeName === null ? [] : [QwikWord.GetActiveInvokeContext]),
    ],
    setup,
    statements: [...runtimeScopeStatement, ...render.statements],
    value: render.value,
  };
}

function emitComponent(
  component: ComponentDefinition,
  render: SsrRender & { readonly setup: SsrSetup },
  source: string,
  range: boolean,
  componentPropsName: string,
  idBase: string | null
): string {
  const emit = range ? emitComponentRangeReplacement : emitComponentFunction;
  if (!render.setup.flushTasks) {
    return emit(
      component,
      [...render.setup.statements, ...render.statements],
      render.value,
      source,
      false,
      componentPropsName,
      idBase
    );
  }
  return emit(
    component,
    render.setup.statements,
    `${QwikWord.MaybeThen}(ctx.scheduler.flush(), () => ${emitInvokeRender(
      render.statements,
      render.value
    )})`,
    source,
    false,
    componentPropsName,
    idBase
  );
}

function emitSetup(
  plan: Pick<SsrPlan, 'setup'>,
  source: string,
  segments: ReadonlyMap<string, SegmentPlan>,
  qrlImports: TargetImportResolver,
  localImplementationSource: string | null,
  flushTasks = false
): SsrSetup | null {
  const imports = new Set<string>();
  const statements: string[] = [];

  if (flushTasks) {
    imports.add(QwikWord.GetActiveInvokeContextOrNull);
    imports.add(QwikWord.MaybeThen);
    imports.add('invoke');
    statements.push(`const invokeCtx = ${QwikWord.GetActiveInvokeContextOrNull}();`);
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
    const operationSegments = operation.segmentIds.flatMap((id) => {
      const segment = segments.get(id);
      return segment === undefined ? [] : [segment];
    });
    if (
      operationSegments.length === 0 &&
      operation.useIds.length === 1 &&
      operation.useIds[0].standalone
    ) {
      continue;
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
    if (statement !== '' && statement !== 'undefined;') {
      statements.push(statement);
    }
  }

  return { imports: [...imports], statements, flushTasks };
}

function emitInvokeRender(statements: readonly string[], value: string): string {
  const body = [...statements, `return ${value};`].map((statement) => `  ${statement}`).join('\n');
  return `invoke(invokeCtx, () => {\n${body}\n})`;
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

  constructor(
    private readonly source: string,
    private readonly segments: ReadonlyMap<string, SegmentPlan>,
    rootedCaptures: readonly string[] = [],
    private readonly qrlImports = new TargetImportResolver(),
    private readonly localImplementationSource: string | null = null,
    private readonly componentPropsName = 'props'
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
      parts.unshift(`${QwikWord.CreateSsrRecord}('<!c=', ctx.contextScopeRef(), '>')`);
      parts.push(literal('<!/c>'));
    }
    let output = this.output(parts);
    const soleStep =
      this.steps.length === 1 && output === this.steps[0].name && this.steps[0].after === null;
    if (soleStep) {
      this.statements.push(...this.steps[0].statements);
      output = this.steps[0].expression;
    } else if (this.steps.length > 0) {
      const invokeContext = this.steps.length > 1 ? this.name('invokeCtx') : null;
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
          this.eagerIds.has(name) ? `const ${name} = ctx.nextId();` : `let ${name};`
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
      const expression = `ctx.setRef(${this.expression(prop.value)}, ${target})`;
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
      const emitted = this.eventValue(prop.handlers, prop.eventName);
      return emitted === null ? null : { parts: [emitted], innerHTML: null };
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
      `${QwikWord.RenderSsrContent}(ctx, ${id}, [${captures.join(', ')}], ${qrlName(segment)}${operation.root ? ', true' : ''})`,
      [this.assignId(id), ...this.rootNames(captures)],
      'content'
    );
    this.imports.add(QwikWord.RenderSsrContent);
    this.imports.add(QwikWord.CreateSsrRecord);
    this.imports.add(QwikWord.CreateSsrNodeId);
    return [
      `${QwikWord.CreateSsrRecord}('<!d=', ${QwikWord.CreateSsrNodeId}(${id}), '>')`,
      value,
      literal('<!/d>'),
    ];
  }

  private component(operation: SsrComponentOperation): SsrPart[] | null {
    const prep: string[] = [];
    let options = '';
    if (operation.slots.length > 0) {
      const scope = this.name('slotScope');
      prep.push(`const ${scope} = ${QwikWord.CreateSlotScope}();`, `ctx.addRoot(${scope});`);
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
    const props = this.componentProps(operation.props);
    if (props === null) {
      return null;
    }
    prep.push(...props.prep);
    this.imports.add(QwikWord.CreateComponent);
    const tag = this.source.slice(operation.tagRange[0], operation.tagRange[1]);
    const expression = `${QwikWord.CreateComponent}(${props.value}, (props) => ${tag}(props, ctx${
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
      `${QwikWord.RenderSsrBranch}(ctx, ${id}, ${this.qrlReference(condition, operation.condition)}, ${this.qrlReference(thenSegment)}, ${elseSegment === null ? 'undefined' : this.qrlReference(elseSegment)}${
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
        `${QwikWord.RenderSsrSlot}(ctx, ${JSON.stringify(operation.name)}, ${
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
      if (operation.key === null || key === null || id === null) {
        return null;
      }
      const source = this.source.slice(
        operation.source.expression[0],
        operation.source.expression[1]
      );
      const prep = [
        this.assignId(id),
        ...this.rootNames([source]),
        ...this.rootNames(this.captureNames(key, operation.key)),
        ...this.rootSegment(row!),
      ];
      this.imports.add(QwikWord.RenderSsrCollection);
      value = this.step(
        `${QwikWord.RenderSsrCollection}(ctx, ${id}, ${source}, ${this.qrlReference(
          key,
          operation.key
        )}, ${this.qrlReference(row!)}, ${operation.usesIndexSignal}, ${
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
      const expression = `${QwikWord.RenderSsrCollection}(ctx, undefined, ${source}, undefined, ${rowReference}, false, ${operation.idBase === null ? "''" : operation.idBase}, ${
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
        `if (!Array.isArray(${collection})) ctx.addRoot(${collection});`,
      ];
      this.imports.add(QwikWord.WrapArray);
      this.imports.add(QwikWord.RenderSsrCollection);
      value = this.step(
        `${QwikWord.RenderSsrCollection}(ctx, ${id}, ${collection}, ${
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
      this.localImplementationSource
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
      this.componentPropsName
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
            ? 'ctx'
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
    props: readonly OrderedPropPlan[]
  ): { readonly value: string; readonly prep: readonly string[] } | null {
    const sources: string[] = [];
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
        case 'dynamic':
          {
            const boundaryPrep = this.inlineValuePrep(prop.value);
            if (boundaryPrep === null) {
              return null;
            }
            prep.push(...boundaryPrep);
          }
          entries.push(
            `get ${JSON.stringify(prop.name)}() { return ${this.expression(prop.value)}; }`
          );
          break;
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
    if (sources.length === 1) {
      return { value: sources[0], prep };
    }
    this.imports.add(QwikWord.MergeProps);
    return { value: `${QwikWord.MergeProps}(${sources.join(', ')})`, prep };
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
      `renderDomPropsToString(${this.expression(value)}, ctx.eventAttr, ${
        styleScope.staticId === null && styleScope.runtimeName === null
          ? 'undefined'
          : scopeExpression(styleScope, null)
      })`,
      [this.assignId(targetId)],
      'props',
      (name) => `${name}.ref !== undefined && ctx.setRef(${name}.ref, ${targetId})`
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
      )}, ctx.eventAttr${styleArgs})`,
      [this.assignId(targetId), ...this.rootNames(captures)],
      'props',
      includeRef
        ? (name) => `${name}.ref !== undefined && ctx.setRef(${name}.ref, ${targetId})`
        : undefined
    );
  }

  private eventValue(handlers: readonly SsrEventHandlerPlan[], eventName: string): string | null {
    const values: string[] = [];
    for (const handler of handlers) {
      if (handler.kind === 'bind') {
        this.imports.add(QwikWord.InlinedQrl);
        const fn =
          handler.name === 'checked' ? QwikWord.BindCheckedHandler : QwikWord.BindValueHandler;
        this.imports.add(fn);
        values.push(
          `${QwikWord.InlinedQrl}(${fn}, ${JSON.stringify(fn)}, [${this.source.slice(
            handler.signal[0],
            handler.signal[1]
          )}])`
        );
        continue;
      }
      const value = handler.value;
      if (value.kind === 'segment') {
        const segment = this.segment(value.segment);
        if (segment === null) {
          return null;
        }
        values.push(this.qrlReference(segment, value.segment));
      } else {
        values.push(this.expression(value));
      }
    }
    const value = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
    return `ctx.eventAttr(${JSON.stringify(eventName)}, ${value})`;
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
      [...prep, ...this.rootNames(captures)],
      prefix
    );
  }

  private expression(value: ValuePlan): string {
    let expression = this.source.slice(value.expression[0], value.expression[1]);
    if (value.kind === 'expression' && value.boundaries.length > 0) {
      const replacements: Array<{ range: SourceRange; value: string }> = [];
      for (const reference of value.boundaries) {
        const segment = this.segment(reference);
        if (segment === null || segment.qrl === null) {
          return expression;
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
      expression = applyReplacements(this.source, value.expression, replacements);
    }
    return value.kind === 'render-value' ? `${expression}()` : expression;
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
    return captureNames(segment, reference, this.componentPropsName);
  }

  private qrlReference(segment: SegmentPlan, reference?: SegmentReferencePlan): string {
    return qrlReference(segment, reference, this.componentPropsName);
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
        statements.push(`ctx.addRoot(${name});`);
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
      return this.eagerIds.has(statement.name) ? [] : [`${statement.name} ??= ctx.nextId();`];
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
  segment: SegmentPlan,
  reference: SegmentReferencePlan | undefined,
  componentPropsName: string
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
    ...(hasComponentProps ? [componentPropsName] : []),
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
  componentPropsName = 'props'
): string {
  const captures = captureNames(segment, reference, componentPropsName);
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

function getInputImportPath(inputPath: string, explicitExtensions: boolean): string {
  const slash = Math.max(inputPath.lastIndexOf('/'), inputPath.lastIndexOf('\\'));
  const name = (slash === -1 ? inputPath : inputPath.slice(slash + 1)).replace(
    /\.[cm]?[jt]sx?$/,
    ''
  );
  return `./${name}${explicitExtensions ? '.js' : ''}`;
}
