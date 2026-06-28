import type {
  ComponentPropRecord,
  ComponentRecord,
  BranchNode,
  DynamicTextNode,
  ElementNode,
  ForNode,
  ImportRecord,
  PropRecord,
  QrlSegmentOutput,
  RenderNode,
  SegmentRecord,
  SlotNode,
} from '../types';
import { QwikSymbol } from '../words';
import {
  emitComponentParamSetup,
  emitComponentSetup,
  emitImports,
  emitObjectGetterName,
  emitSsrQrlPrelude,
  escapeAttr,
  escapeText,
  flattenElementChildren,
  getDomEffectBatchStats,
  getDomPropsBatchKey,
  getDynamicBindingBatchKey,
  hasDynamicBinding,
  hasSlot,
  isDomEffectBatched,
  rewriteLoopCaptures,
  serializeAttrValue,
  shouldResolveSsrQrl,
} from './emit-utils';
import {
  emitQrlReference,
  hasTaskSetupSegment,
  isCreateTaskSegment,
  isCreateVisibleTaskSegment,
  isNestedInImplicitDollarSegment,
  isRangeInside,
} from './implicit-dollar';

type HtmlPart = string | { code: string };

interface SsrEmitterOptions {
  domEffectBatchCounts?: ReadonlyMap<string, number>;
  rootRangeTarget?: string;
  rootElementAttr?: string;
  loopCaptures?: readonly { name: string; source: string }[];
  visibleTasks?: VisibleTaskCarrier[];
}

interface VisibleTaskCarrier {
  qrlSegment: QrlSegmentOutput;
  eventName: 'q-e:qvisible' | 'q-d:qinit' | 'q-d:qidle';
}

export function emitSsrModule(
  components: ComponentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string,
  imports: ImportRecord[],
  modulePrelude = ''
) {
  const prelude = emitPrelude(qrlSegments, imports);
  return `${prelude}${modulePrelude}${components
    .map((component) => emitSsrComponent(component, qrlSegments, segments, sourceCode))
    .join('\n')}\n`;
}

function emitPrelude(qrlSegments: Map<string, QrlSegmentOutput>, imports: ImportRecord[]) {
  const lines = emitImports(imports);
  for (const qrlSegment of qrlSegments.values()) {
    if (shouldResolveSsrQrl(qrlSegment)) {
      lines.push(
        `import { ${qrlSegment.symbolName} } from ${JSON.stringify(qrlSegment.importPath)};`
      );
    }
  }
  return `${lines.length > 0 ? `${lines.join('\n')}\n\n` : ''}${emitSsrQrlPrelude(qrlSegments)}`;
}

function emitSsrComponent(
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string
) {
  const emitter = new SsrEmitter(qrlSegments, sourceCode, {
    domEffectBatchCounts: getDomEffectBatchStats(component.root, qrlSegments).counts,
    visibleTasks: collectVisibleTaskCarriers(component, segments, qrlSegments, sourceCode),
  });
  const slotInvokeContextId = hasSlot(component.root) ? emitter.ensureSlotInvokeContextId() : null;
  const html = emitter.emitHtmlExpression(component.root!);
  const setupAwaits = hasTaskSetupSegment(component, segments, isCreateTaskSegment);
  const isAsync = setupAwaits;
  const setup = emitComponentSetup(
    component,
    qrlSegments,
    segments,
    sourceCode,
    'ssr',
    hasDynamicBinding(component.root) || component.providesContext
  );
  const paramSetup = emitComponentParamSetup(component, sourceCode);
  const returnExpression = component.providesContext
    ? emitter.emitReturnExpression(`'<!c=' + contextScopeId + '>' + ${html} + '<!/c>'`)
    : emitter.emitReturnExpression(html);
  const statements = [
    slotInvokeContextId === null
      ? ''
      : `const ${slotInvokeContextId} = ${QwikSymbol.GetActiveInvokeContextOrNull}();`,
    emitter.toString(),
  ]
    .filter(Boolean)
    .join('\n');
  const renderBodyParts = component.providesContext
    ? [
        'const contextScopeId = ctx.contextScopeId();',
        statements,
        `return ${returnExpression};`,
      ].filter(Boolean)
    : [statements, `return ${returnExpression};`].filter(Boolean);
  const renderBody = renderBodyParts.join('\n');
  const bodyParts = setupAwaits
    ? [
        `const invokeCtx = ${QwikSymbol.GetActiveInvokeContextOrNull}();`,
        paramSetup,
        setup,
        `return ${QwikSymbol.Invoke}(invokeCtx, ${
          /\bawait\b/.test(renderBody) ? 'async ' : ''
        }() => {\n${renderBody
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')}\n});`,
      ].filter(Boolean)
    : [paramSetup, setup, ...renderBodyParts].filter(Boolean);
  const body = bodyParts.join('\n');
  const ctxParam =
    emitter.usesCtx || component.providesContext || setup.includes('ctx.') ? 'ctx' : '_ctx';
  const propsParam = getComponentPropsParam(component);
  if (component.declarationKind === 'function') {
    return `export ${isAsync ? 'async ' : ''}function ${component.exportName}(${propsParam}, ${ctxParam}) {\n${body}\n}`;
  }
  if (component.declarationKind === 'const') {
    return bodyParts.length > 1
      ? `export const ${component.exportName} = ${isAsync ? 'async ' : ''}(${propsParam}, ${ctxParam}) => {\n${body}\n};`
      : `export const ${component.exportName} = ${isAsync ? 'async ' : ''}(${propsParam}, ${ctxParam}) => ${returnExpression};`;
  }
  if (component.declarationKind === 'defaultFunction') {
    const name = component.localName ? ` ${component.localName}` : '';
    return `export default ${isAsync ? 'async ' : ''}function${name}(${propsParam}, ${ctxParam}) {\n${body}\n}`;
  }
  return bodyParts.length > 1
    ? `export default ${isAsync ? 'async ' : ''}(${propsParam}, ${ctxParam}) => {\n${body}\n};`
    : `export default ${isAsync ? 'async ' : ''}(${propsParam}, ${ctxParam}) => ${returnExpression};`;
}

function getComponentPropsParam(component: ComponentRecord): string {
  return component.params[0]?.name ?? '_props';
}

function collectVisibleTaskCarriers(
  component: ComponentRecord,
  segments: readonly SegmentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  sourceCode: string
): VisibleTaskCarrier[] {
  const carriers: VisibleTaskCarrier[] = [];
  for (const segment of segments) {
    if (
      !isCreateVisibleTaskSegment(segment) ||
      !component.setupRanges.some((range) => isRangeInside(segment.range, range)) ||
      isNestedInImplicitDollarSegment(segment, segments)
    ) {
      continue;
    }
    const qrlSegment = qrlSegments.get(segment.id);
    if (qrlSegment) {
      carriers.push({
        qrlSegment,
        eventName: getVisibleTaskEventName(segment, sourceCode),
      });
    }
  }
  return carriers;
}

function getVisibleTaskEventName(
  segment: SegmentRecord,
  sourceCode: string
): VisibleTaskCarrier['eventName'] {
  const optionsRange = segment.argumentRanges[1];
  if (optionsRange) {
    const options = sourceCode.slice(optionsRange[0], optionsRange[1]);
    if (/\bstrategy\s*:\s*['"]document-ready['"]/.test(options)) {
      return 'q-d:qinit';
    }
    if (/\bstrategy\s*:\s*['"]document-idle['"]/.test(options)) {
      return 'q-d:qidle';
    }
  }
  return 'q-e:qvisible';
}

export class SsrEmitter {
  private counter = 0;
  private readonly lines: string[] = [];
  private readonly roots = new Set<string>();
  private readonly ssrBatches = new Map<string, string>();
  private readonly valueOrPromiseIds: string[] = [];
  private slotInvokeContextId: string | null = null;
  usesCtx = false;

  constructor(
    private qrlSegments: Map<string, QrlSegmentOutput>,
    private sourceCode: string,
    private options: SsrEmitterOptions = {}
  ) {}

  emitHtmlExpression(node: RenderNode) {
    return partsToExpression(this.emitHtmlParts(node));
  }

  emitReturnExpression(expression: string): string {
    const ids = this.valueOrPromiseIds;
    if (ids.length === 0) {
      return expression;
    }
    if (ids.length === 1) {
      const id = ids[0];
      return `${QwikSymbol.MaybeThen}(${id}, (${id}) => ${expression})`;
    }
    return `${QwikSymbol.MaybeThen}(${QwikSymbol.PromiseAll}([${ids.join(', ')}]), ([${ids.join(
      ', '
    )}]) => ${expression})`;
  }

  private emitHtmlParts(node: RenderNode): HtmlPart[] {
    if (node.kind === 'text') {
      return [escapeText(node.value)];
    }
    if (node.kind === 'children') {
      return [{ code: `(${node.propsName}.children ?? '')` }];
    }
    if (node.kind === 'slot') {
      return this.emitSlotParts(node);
    }
    if (node.kind === 'fragment') {
      return this.emitFragmentParts(node.children);
    }
    if (node.kind === 'component') {
      return this.emitComponentParts(node);
    }
    if (node.kind === 'branch') {
      return this.emitBranchParts(node);
    }
    if (node.kind === 'for') {
      return this.emitForParts(node);
    }
    if (node.kind === 'element') {
      return this.emitElementParts(node);
    }
    if (node.kind === 'dynamicText') {
      throw new Error('Dynamic text outside an element is not supported for SSR resume yet.');
    }
    throw new Error('Unsupported render node.');
  }

  private emitFragmentParts(children: readonly RenderNode[]): HtmlPart[] {
    if (!this.options.rootRangeTarget || !hasRootRangeTextTarget(children)) {
      return children.flatMap((child) => this.emitHtmlParts(child));
    }
    return this.emitRootRangeTextParts(flattenElementChildren(children));
  }

  private emitRootRangeTextParts(children: readonly RenderNode[]): HtmlPart[] {
    const parts: HtmlPart[] = [];
    let markerIndex = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.kind !== 'dynamicText') {
        parts.push(...this.emitHtmlParts(child));
        continue;
      }
      parts.push(
        '<!t>',
        ...this.emitDynamicTextParts(
          child,
          `${QwikSymbol.CreateSsrRangeTextTarget}(${this.options.rootRangeTarget}, ${markerIndex})`
        )
      );
      markerIndex++;
      if (needsTextBoundary(children[i + 1])) {
        parts.push('<!/t>');
      }
    }
    return parts;
  }

  private emitComponentParts(node: Extract<RenderNode, { kind: 'component' }>): HtmlPart[] {
    this.usesCtx = true;
    const componentId = this.next('component');
    const slotScope = this.emitComponentSlotScope(node);
    this.line(
      `const ${componentId} = ${QwikSymbol.CreateComponent}(${this.emitComponentProps(
        node.props
      )}, (props) => ${node.name}(props, ctx)${
        slotScope === null ? '' : `, { slotScope: ${slotScope} }`
      });`
    );
    return [
      {
        code: this.trackValueOrPromise(componentId),
      },
    ];
  }

  private emitComponentProps(props: ComponentPropRecord[]): string {
    if (!props.some((prop) => prop.kind === 'spread')) {
      const propEntries = props.map((prop) => this.emitComponentPropEntry(prop));
      return propEntries.length === 0 ? '{}' : `{ ${propEntries.join(', ')} }`;
    }

    const sources: string[] = [];
    let currentEntries: string[] = [];
    const flushEntries = () => {
      if (currentEntries.length > 0) {
        sources.push(`{ ${currentEntries.join(', ')} }`);
        currentEntries = [];
      }
    };

    for (const prop of props) {
      if (prop.kind === 'spread') {
        flushEntries();
        sources.push(`(${this.emitSourceExpression(prop.expressionRange)})`);
      } else {
        currentEntries.push(this.emitComponentPropEntry(prop));
      }
    }
    flushEntries();
    return sources.length === 0 ? '{}' : `${QwikSymbol.MergeProps}(${sources.join(', ')})`;
  }

  private emitComponentSlotScope(node: Extract<RenderNode, { kind: 'component' }>): string | null {
    if (node.slots.length === 0) {
      return null;
    }
    const id = this.next('slotScope');
    this.line(`const ${id} = ${QwikSymbol.CreateSlotScope}();`);
    this.line(`ctx.addRoot(${id});`);
    for (const slot of node.slots) {
      const qrlSegment = this.requireQrlSegment(slot.segmentId);
      this.emitCaptureRoots(qrlSegment);
      this.line(
        `${QwikSymbol.RegisterProjection}(${id}, ${JSON.stringify(slot.name)}, ${emitQrlReference(
          qrlSegment
        )});`
      );
    }
    return id;
  }

  private emitSlotParts(node: SlotNode): HtmlPart[] {
    this.usesCtx = true;
    const id = this.next('slot');
    const invokeContextId = this.ensureSlotInvokeContextId();
    let fallback = 'undefined';
    if (node.fallbackSegmentId !== null) {
      const qrlSegment = this.requireQrlSegment(node.fallbackSegmentId);
      this.emitCaptureRoots(qrlSegment);
      fallback = emitQrlReference(qrlSegment);
    }
    this.line(
      `const ${id} = ${QwikSymbol.RenderSsrSlot}(ctx, ${JSON.stringify(
        node.name
      )}, ${fallback}, ${invokeContextId});`
    );
    return [{ code: this.trackValueOrPromise(id) }];
  }

  ensureSlotInvokeContextId(): string {
    return (this.slotInvokeContextId ??= this.next('slotCtx'));
  }

  private emitComponentPropEntry(prop: ComponentPropRecord): string {
    if (prop.kind === 'spread') {
      throw new Error('Component spread props are emitted as mergeProps sources.');
    }
    if (prop.qrlSegmentId) {
      const qrlSegment = this.requireQrlSegment(prop.qrlSegmentId);
      return `${JSON.stringify(prop.name)}: ${emitQrlReference(qrlSegment)}`;
    }
    if (prop.expressionRange !== undefined) {
      const value = this.emitSourceExpression(prop.expressionRange);
      return `get ${emitObjectGetterName(prop.name)}() { return ${value}; }`;
    }
    return `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`;
  }

  private emitElementParts(node: ElementNode): HtmlPart[] {
    const children = flattenElementChildren(node.children);
    const hasElementText = hasElementTextTarget(children);
    const hasRangeText = !hasElementText && hasDirectRangeTextTarget(children);
    const hasProps = hasDomProps(node);
    const needsElementTarget =
      hasDynamicSourceProp(node) || hasProps || hasElementText || hasRangeText;
    const elementId = needsElementTarget ? this.nextTargetId() : null;
    let propsRenderId: string | null = null;
    const parts: HtmlPart[] = [`<${node.tag}`];

    if (elementId !== null) {
      parts.push(' q:id="', { code: elementId }, '"');
    }
    if (this.options.rootElementAttr !== undefined) {
      parts.push(` ${this.options.rootElementAttr}`);
      this.options.rootElementAttr = undefined;
    }
    parts.push(...this.emitVisibleTaskEventAttrParts());

    if (hasProps) {
      propsRenderId = this.emitSsrDomProps(node, elementId!);
      parts.push({ code: `${propsRenderId}.attrs` });
    } else {
      for (const prop of node.props) {
        if (prop.kind !== 'named') {
          continue;
        }
        if (prop.binding) {
          parts.push(...this.emitDynamicAttrParts(prop, elementId!));
          continue;
        }
        if (prop.expressionRange !== undefined) {
          this.usesCtx = true;
          parts.push({
            code: `ctx.eventAttr(${JSON.stringify(prop.name)}, ${this.emitSourceExpression(
              prop.expressionRange
            )})`,
          });
          continue;
        }
        if (prop.qrlSegmentId) {
          const qrlSegment = this.qrlSegments.get(prop.qrlSegmentId);
          if (qrlSegment) {
            this.usesCtx = true;
            parts.push({
              code: `ctx.eventAttr(${JSON.stringify(prop.name)}, ${emitQrlReference(qrlSegment)})`,
            });
          }
          continue;
        }
        const value = serializeAttrValue(prop.value);
        if (value === null) {
          continue;
        }
        if (value === '') {
          parts.push(` ${prop.name}`);
          continue;
        }
        parts.push(` ${prop.name}="${escapeAttr(value)}"`);
      }
    }

    parts.push('>');
    if (propsRenderId !== null) {
      parts.push({
        code: `(${propsRenderId}.innerHTML ?? ${partsToExpression(
          this.emitElementBodyParts(children, elementId, hasElementText, hasRangeText)
        )})`,
      });
    } else {
      parts.push(...this.emitElementBodyParts(children, elementId, hasElementText, hasRangeText));
    }
    parts.push(`</${node.tag}>`);
    return parts;
  }

  private emitElementBodyParts(
    children: readonly RenderNode[],
    elementId: string | null,
    hasElementText: boolean,
    hasRangeText: boolean
  ): HtmlPart[] {
    if (elementId !== null && hasElementText) {
      return this.emitDynamicTextParts(
        children[0] as DynamicTextNode,
        `${QwikSymbol.CreateSsrElementTextTarget}(${elementId})`
      );
    }
    if (elementId !== null && hasRangeText) {
      return this.emitElementChildrenWithRangeTextParts(children, elementId);
    }
    return children.flatMap((child) => this.emitHtmlParts(child));
  }

  private emitSsrDomProps(node: ElementNode, elementId: string): string {
    if (!node.propsSegmentId) {
      throw new Error('Missing DOM props segment.');
    }
    const qrlSegment = this.requireQrlSegment(node.propsSegmentId);
    this.emitCaptureRoots(qrlSegment);
    this.usesCtx = true;
    const id = this.next('props');
    const batchArg = this.emitSsrBatchArg(getDomPropsBatchKey(node, this.qrlSegments));
    this.line(
      `const ${id} = ${QwikSymbol.RenderSsrProps}(${QwikSymbol.CreateSsrElementTarget}(${elementId}), ${this.emitCaptureArgs(
        qrlSegment
      )}, ${qrlSegment.qrlVariableName}, ctx.eventAttr${batchArg});`
    );
    return this.trackValueOrPromise(id);
  }

  private emitBranchParts(node: BranchNode): HtmlPart[] {
    const rangeId = this.nextTargetId();
    const conditionQrl = this.requireQrlSegment(node.conditionSegmentId);
    const thenQrl = this.requireQrlSegment(node.thenSegmentId);
    const elseQrl = node.elseSegmentId ? this.requireQrlSegment(node.elseSegmentId) : null;

    this.emitCaptureRoots(conditionQrl);
    this.emitCaptureRoots(thenQrl);
    if (elseQrl) {
      this.emitCaptureRoots(elseQrl);
    }

    const args = [
      'ctx',
      rangeId,
      emitQrlReference(conditionQrl),
      emitQrlReference(thenQrl),
      elseQrl ? emitQrlReference(elseQrl) : 'undefined',
    ];
    const branchId = this.next('branch');
    this.line(`const ${branchId} = ${QwikSymbol.RenderSsrBranch}(${args.join(', ')});`);

    return [
      '<!b=',
      { code: rangeId },
      '>',
      {
        code: this.trackValueOrPromise(branchId),
      },
      '<!/b>',
    ];
  }

  private emitForParts(node: ForNode): HtmlPart[] {
    const rangeId = this.nextTargetId();
    const keyQrl = this.requireQrlSegment(node.keySegmentId);
    const renderQrl = this.requireQrlSegment(node.renderSegmentId);

    this.emitRoot(node.sourceName);
    this.emitCaptureRoots(keyQrl);
    this.emitCaptureRoots(renderQrl);

    const blockId = this.next('forBlock');
    this.line(
      `const ${blockId} = ${QwikSymbol.RenderSsrForBlock}(ctx, ${rangeId}, ${node.sourceName}, ${emitQrlReference(
        keyQrl
      )}, ${emitQrlReference(renderQrl)}, ${String(node.usesItemSignal)}, ${String(node.usesIndexSignal)});`
    );

    return [
      '<!f=',
      { code: rangeId },
      '>',
      {
        code: this.trackValueOrPromise(blockId),
      },
      '<!/f>',
    ];
  }

  private emitDynamicAttrParts(prop: PropRecord, elementId: string): HtmlPart[] {
    if (prop.kind !== 'named') {
      throw new Error('Dynamic attribute effects require named props.');
    }
    const binding = prop.binding!;
    const target = `${QwikSymbol.CreateSsrElementTarget}(${elementId})`;
    if (binding.kind === 'expression') {
      const qrlSegment = this.requireQrlSegment(binding.qrlSegmentId);
      this.emitCaptureRoots(qrlSegment);
      const id = this.next('attr');
      const batchArg = this.emitSsrBatchArg(getDynamicBindingBatchKey(binding, this.qrlSegments));
      this.line(
        `const ${id} = ${QwikSymbol.RenderSsrAttrExpression}(${target}, ${JSON.stringify(
          prop.name
        )}, ${this.emitCaptureArgs(qrlSegment)}, ${qrlSegment.qrlVariableName}${batchArg});`
      );
      this.trackValueOrPromise(id);
      return [` ${prop.name}="`, { code: `${QwikSymbol.EscapeHTML}(${id})` }, '"'];
    }
    this.emitRoot(binding.sourceName);
    const batchArg = this.emitSsrBatchArg(getDynamicBindingBatchKey(binding, this.qrlSegments));
    const id = this.next('attr');
    this.line(
      `const ${id} = ${QwikSymbol.RenderSsrAttr}(${target}, ${JSON.stringify(prop.name)}, ${
        binding.sourceName
      }${batchArg});`
    );
    this.trackValueOrPromise(id);
    return [` ${prop.name}="`, { code: `${QwikSymbol.EscapeHTML}(${id})` }, '"'];
  }

  private emitElementChildrenWithRangeTextParts(
    children: readonly RenderNode[],
    elementId: string
  ): HtmlPart[] {
    const parts: HtmlPart[] = [];
    let markerIndex = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.kind !== 'dynamicText') {
        parts.push(...this.emitHtmlParts(child));
        continue;
      }
      parts.push(
        '<!t>',
        ...this.emitDynamicTextParts(
          child,
          `${QwikSymbol.CreateSsrRangeTextTarget}(${elementId}, ${markerIndex})`
        )
      );
      markerIndex++;
      if (needsTextBoundary(children[i + 1])) {
        parts.push('<!/t>');
      }
    }
    return parts;
  }

  private emitDynamicTextParts(node: DynamicTextNode, target: string): HtmlPart[] {
    if (node.binding.kind === 'source') {
      this.emitRoot(node.binding.sourceName);
      const id = this.next('text');
      const batchArg = this.emitSsrBatchArg(
        getDynamicBindingBatchKey(node.binding, this.qrlSegments)
      );
      this.line(
        `const ${id} = ${QwikSymbol.RenderSsrTextNode}(${target}, ${node.binding.sourceName}${batchArg});`
      );
      this.trackValueOrPromise(id);
      return [{ code: `${QwikSymbol.EscapeHTML}(${id})` }];
    }

    const qrlSegment = this.qrlSegments.get(node.binding.qrlSegmentId);
    if (!qrlSegment) {
      throw new Error(`Missing QRL segment for ${node.binding.qrlSegmentId}.`);
    }
    this.emitCaptureRoots(qrlSegment);
    const id = this.next('text');
    const batchArg = this.emitSsrBatchArg(
      getDynamicBindingBatchKey(node.binding, this.qrlSegments)
    );
    this.line(
      `const ${id} = ${QwikSymbol.RenderSsrTextExpression}(${target}, ${this.emitCaptureArgs(
        qrlSegment
      )}, ${qrlSegment.qrlVariableName}${batchArg});`
    );
    this.trackValueOrPromise(id);
    return [{ code: `${QwikSymbol.EscapeHTML}(${id})` }];
  }

  private nextTargetId() {
    const id = this.next('id');
    this.usesCtx = true;
    this.line(`const ${id} = ctx.nextId();`);
    return id;
  }

  private emitSsrBatchArg(batchKey: string | null): string {
    return isDomEffectBatched(this.options.domEffectBatchCounts, batchKey)
      ? `, ${this.ensureSsrBatchEffect(batchKey!)}`
      : '';
  }

  private ensureSsrBatchEffect(batchKey: string): string {
    const existing = this.ssrBatches.get(batchKey);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.next('batch');
    this.ssrBatches.set(batchKey, id);
    this.line(`const ${id} = ${QwikSymbol.CreateSsrDomBatchEffect}();`);
    return id;
  }

  private requireQrlSegment(id: string) {
    const qrlSegment = this.qrlSegments.get(id);
    if (!qrlSegment) {
      throw new Error(`Missing QRL segment for ${id}.`);
    }
    return qrlSegment;
  }

  private emitCaptureRoots(qrlSegment: QrlSegmentOutput) {
    for (const capture of qrlSegment.segment.captures) {
      this.emitRoot(capture.name);
    }
  }

  private emitCaptureArgs(qrlSegment: QrlSegmentOutput): string {
    return `[${qrlSegment.segment.captures.map((capture) => capture.name).join(', ')}]`;
  }

  private emitVisibleTaskEventAttrParts(): HtmlPart[] {
    const visibleTasks = this.options.visibleTasks;
    if (!visibleTasks || visibleTasks.length === 0) {
      return [];
    }
    this.usesCtx = true;
    const grouped = new Map<VisibleTaskCarrier['eventName'], string[]>();
    for (const visibleTask of visibleTasks) {
      this.emitCaptureRoots(visibleTask.qrlSegment);
      const handlers = grouped.get(visibleTask.eventName) ?? [];
      handlers.push(
        `${QwikSymbol.CreateVisibleTaskHandlerQrl}(${emitQrlReference(visibleTask.qrlSegment)})`
      );
      grouped.set(visibleTask.eventName, handlers);
    }
    visibleTasks.length = 0;

    const parts: HtmlPart[] = [];
    for (const [eventName, handlers] of grouped) {
      parts.push({
        code: `ctx.eventAttr(${JSON.stringify(eventName)}, ${
          handlers.length === 1 ? handlers[0] : `[${handlers.join(', ')}]`
        })`,
      });
    }
    return parts;
  }

  private emitRoot(name: string) {
    if (this.roots.has(name)) {
      return;
    }
    this.roots.add(name);
    this.line(`ctx.addRoot(${name});`);
  }

  private trackValueOrPromise(id: string): string {
    this.valueOrPromiseIds.push(id);
    return id;
  }

  private line(code: string) {
    this.lines.push(code);
  }

  toString() {
    return this.lines.join('\n');
  }

  private next(prefix: string) {
    const id = `${prefix}${this.counter}`;
    this.counter++;
    return id;
  }

  private emitSourceExpression(range: [number, number]): string {
    return rewriteLoopCaptures(
      this.sourceCode.slice(range[0], range[1]),
      this.options.loopCaptures ?? []
    );
  }
}

function hasDynamicSourceProp(node: ElementNode) {
  return node.props.some((prop) => prop.kind === 'named' && prop.binding);
}

function hasDomProps(node: ElementNode) {
  return node.props.some((prop) => prop.kind === 'spread');
}

function hasElementTextTarget(children: readonly RenderNode[]) {
  return children.length === 1 && children[0].kind === 'dynamicText';
}

function hasDirectRangeTextTarget(children: readonly RenderNode[]) {
  return children.some((child) => child.kind === 'dynamicText');
}

function hasRootRangeTextTarget(children: readonly RenderNode[]): boolean {
  return children.some(
    (child) =>
      child.kind === 'dynamicText' ||
      (child.kind === 'fragment' && hasRootRangeTextTarget(child.children))
  );
}

function needsTextBoundary(node: RenderNode | undefined) {
  return node !== undefined && node.kind === 'text' && node.value.length > 0;
}

export function partsToExpression(parts: HtmlPart[]) {
  const merged: HtmlPart[] = [];
  for (const part of parts) {
    if (typeof part === 'string' && typeof merged[merged.length - 1] === 'string') {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${part}`;
    } else {
      merged.push(part);
    }
  }
  if (merged.length === 0) {
    return '""';
  }
  return merged
    .map((part) => (typeof part === 'string' ? JSON.stringify(part) : part.code))
    .join(' + ');
}

export function emitSsrDomPropsExpression(
  props: readonly PropRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  sourceCode: string,
  loopCaptures: readonly { name: string; source: string }[] = []
): string {
  const entries = props.map((prop) => {
    if (prop.kind === 'spread') {
      return `...(${rewriteLoopCaptures(
        sourceCode.slice(prop.expressionRange[0], prop.expressionRange[1]),
        loopCaptures
      )})`;
    }
    return emitSsrDomPropEntry(prop, qrlSegments, sourceCode, loopCaptures);
  });
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

function emitSsrDomPropEntry(
  prop: Extract<PropRecord, { kind: 'named' }>,
  qrlSegments: Map<string, QrlSegmentOutput>,
  sourceCode: string,
  loopCaptures: readonly { name: string; source: string }[]
): string {
  if (prop.qrlSegmentId) {
    const qrlSegment = qrlSegments.get(prop.qrlSegmentId);
    if (qrlSegment) {
      return `${JSON.stringify(prop.name)}: ${emitQrlReference(qrlSegment)}`;
    }
  }
  if (prop.expressionRange !== undefined) {
    const value = rewriteLoopCaptures(
      sourceCode.slice(prop.expressionRange[0], prop.expressionRange[1]),
      loopCaptures
    );
    return `get ${emitObjectGetterName(prop.name)}() { return ${value}; }`;
  }
  return `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`;
}
