import type {
  ComponentPropRecord,
  ComponentRecord,
  BranchNode,
  CaptureRecord,
  ForNode,
  ImportRecord,
  PropRecord,
  QrlSegmentOutput,
  RenderNode,
  SegmentRecord,
} from '../types';
import { QwikSymbol } from '../words';
import {
  escapeAttr,
  escapeText,
  emitComponentParamSetup,
  emitComponentExpression,
  emitComponentSetup,
  emitImports,
  emitObjectGetterName,
  countScalarDomEffects,
  hasDynamicBinding,
  rewriteLoopCaptures,
  serializeAttrValue,
} from './emit-utils';

export interface DomOutput {
  id: string;
  kind: 'node' | 'nodes';
}

type DynamicTextRenderNode = Extract<RenderNode, { kind: 'dynamicText' }>;
type ElementRenderNode = Extract<RenderNode, { kind: 'element' }>;

interface DomEmitterOptions {
  branchCondition?: 'qrl' | 'inline';
  domEffectMode?: 'notify' | 'run';
  domEffectCount?: number;
  helperPrefix?: string;
  importSegment?: (qrlSegment: QrlSegmentOutput) => void;
  use?: (symbol: QwikSymbol) => void;
  loopCaptures?: readonly { name: string; source: string }[];
}

export function emitCsrModule(
  components: ComponentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string,
  imports: ImportRecord[],
  modulePrelude = ''
) {
  const prelude = emitPrelude(imports);
  return `${prelude}${modulePrelude}${components
    .map((component) => emitCsrComponent(component, qrlSegments, segments, sourceCode))
    .join('\n')}\n`;
}

function emitPrelude(imports: ImportRecord[]) {
  if (imports.length === 0) {
    return '';
  }
  return `${emitImports(imports).join('\n')}\n\n`;
}

function emitCsrComponent(
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string
) {
  const { body, hoists } = emitDomRenderer(component, qrlSegments, segments, sourceCode);
  const propsParam = getComponentPropsParam(component);
  if (component.declarationKind === 'function') {
    return `${hoists}export function ${component.exportName}(${propsParam}, ctx) {\n${body}\n}`;
  }
  if (component.declarationKind === 'const') {
    return `${hoists}export const ${component.exportName} = (${propsParam}, ctx) => {\n${body}\n};`;
  }
  if (component.declarationKind === 'defaultFunction') {
    const name = component.localName ? ` ${component.localName}` : '';
    return `${hoists}export default function${name}(${propsParam}, ctx) {\n${body}\n}`;
  }
  return `${hoists}export default (${propsParam}, ctx) => {\n${body}\n};`;
}

function getComponentPropsParam(component: ComponentRecord): string {
  return component.params[0]?.name ?? '_props';
}

function emitDomRenderer(
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string
) {
  const emitter = new DomEmitter(
    qrlSegments,
    sourceCode,
    {
      domEffectCount: countScalarDomEffects(component.root),
      helperPrefix: createHelperPrefix(component.exportName),
    },
    component
  );
  const root = component.root!;
  emitter.raw(emitComponentParamSetup(component, sourceCode, { omitRewrittenProps: true }));
  emitter.raw(
    emitComponentSetup(
      component,
      qrlSegments,
      segments,
      sourceCode,
      'csr',
      hasDynamicBinding(root) || component.providesContext
    )
  );
  const roots = emitter.emitTemplateRoot(root) ?? emitter.emitRoot(root);
  emitter.finalizeDomBatchEffects();
  emitter.line(`return ${emitNodeOutputExpression(roots)};`);
  return { body: emitter.toString(), hoists: emitter.emitHoists() };
}

export class DomEmitter {
  private counter = 0;
  private helperCounter = 0;
  private readonly lines: string[] = [];
  private readonly hoists: string[] = [];
  private readonly helperBySegment = new Map<string, string>();
  private readonly moduleImportNames = new Set<string>();
  private batchEffectId: string | null = null;
  private batchUpdateId: string | null = null;
  private readonly batchOps: string[] = [];

  constructor(
    private qrlSegments: Map<string, QrlSegmentOutput>,
    private sourceCode: string,
    private options: DomEmitterOptions = {},
    private component?: ComponentRecord
  ) {}

  emitRoot(node: RenderNode): DomOutput[] {
    if (node.kind === 'fragment') {
      return node.children.flatMap((child) => this.emitRoot(child));
    }
    return [this.emitNode(node)];
  }

  emitTemplateRoot(node: RenderNode): DomOutput[] | null {
    return this.emitTemplateRoots(flattenTemplateRoot(node));
  }

  emitTemplateRoots(nodes: readonly RenderNode[]): DomOutput[] | null {
    const roots = flattenTemplateRoots(nodes);
    if (!canEmitTemplateRoots(roots)) {
      return null;
    }

    const templateId = this.nextHoist('template');
    const fragmentId = this.next('fragment');
    this.use(QwikSymbol.CreateTemplate);
    this.hoists.push(
      `const ${templateId} = ${QwikSymbol.CreateTemplate}(${JSON.stringify(emitTemplateHtml(roots))});`
    );
    this.line(`const ${fragmentId} = ${templateId}(ctx.document);`);
    const outputs: DomOutput[] = [];
    let previousId: string | null = null;
    for (const root of roots) {
      const id = this.nextTemplateNode(root);
      const path = previousId === null ? `${fragmentId}.firstChild` : `${previousId}.nextSibling`;
      this.line(`const ${id} = ${path};`);
      this.emitTemplateNode(root, id);
      outputs.push({ id, kind: 'node' });
      previousId = id;
    }
    return outputs;
  }

  emitNode(node: RenderNode): DomOutput {
    if (node.kind === 'children') {
      return { id: `(${node.propsName}.children ?? [])`, kind: 'nodes' };
    }
    if (node.kind === 'text') {
      const id = this.next('text');
      this.line(`const ${id} = ctx.document.createTextNode(${JSON.stringify(node.value)});`);
      return { id, kind: 'node' };
    }
    if (node.kind === 'dynamicText') {
      const id = this.next('text');
      this.line(`const ${id} = ctx.document.createTextNode('');`);
      this.emitDynamicTextBinding(id, node);
      return { id, kind: 'node' };
    }
    if (node.kind === 'element') {
      const id = this.next('el');
      this.line(`const ${id} = ctx.document.createElement(${JSON.stringify(node.tag)});`);
      this.emitElementProps(id, node, true);
      for (const child of node.children) {
        this.appendChild(id, this.emitNode(child));
      }
      return { id, kind: 'node' };
    }
    if (node.kind === 'component') {
      const id = this.next('cmp');
      const props = this.emitComponentProps(node.props, node.children);
      this.use(QwikSymbol.CreateComponent);
      this.line(
        `const ${id} = ${QwikSymbol.CreateComponent}(${props}, (props) => ${node.name}(props, ctx), { container: ctx });`
      );
      return { id, kind: 'nodes' };
    }
    if (node.kind === 'branch') {
      return this.emitBranch(node);
    }
    if (node.kind === 'for') {
      return this.emitFor(node);
    }
    if (node.kind === 'fragment') {
      const id = this.next('fragment');
      this.line(`const ${id} = ctx.document.createDocumentFragment();`);
      for (const child of node.children) {
        this.appendChild(id, this.emitNode(child));
      }
      return { id, kind: 'node' };
    }
    throw new Error('Unsupported render node.');
  }

  private emitComponentProps(
    props: ComponentPropRecord[],
    children: readonly RenderNode[]
  ): string {
    const entries: string[] = [];
    if (children.length > 0) {
      const childOutputs = children.flatMap((child) => this.emitRoot(child));
      entries.push(`${JSON.stringify('children')}: ${emitNodeOutputExpression(childOutputs)}`);
    }
    if (!props.some((prop) => prop.kind === 'spread')) {
      const propEntries = props.map((prop) => this.emitComponentPropEntry(prop));
      return [...propEntries, ...entries].length === 0
        ? '{}'
        : `{ ${[...propEntries, ...entries].join(', ')} }`;
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
        sources.push(`(${this.emitExpression(prop.expressionRange)})`);
      } else {
        currentEntries.push(this.emitComponentPropEntry(prop));
      }
    }
    currentEntries.push(...entries);
    flushEntries();
    this.use(QwikSymbol.MergeProps);
    return sources.length === 0 ? '{}' : `${QwikSymbol.MergeProps}(${sources.join(', ')})`;
  }

  private emitComponentPropEntry(prop: ComponentPropRecord): string {
    if (prop.kind === 'spread') {
      throw new Error('Component spread props are emitted as mergeProps sources.');
    }
    if (prop.qrlSegmentId) {
      const qrlSegment = this.qrlSegments.get(prop.qrlSegmentId);
      if (qrlSegment) {
        this.importSegment(qrlSegment);
        return `${JSON.stringify(prop.name)}: ${this.emitCapturedFunction(qrlSegment)}`;
      }
    }
    if (prop.expressionRange !== undefined) {
      const value = this.emitExpression(prop.expressionRange);
      return `get ${emitObjectGetterName(prop.name)}() { return ${value}; }`;
    }
    return `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`;
  }

  private emitDomPropsExpression(props: PropRecord[], useCaptureParams = false): string {
    const entries = props.map((prop) => {
      if (prop.kind === 'spread') {
        return `...(${this.emitDomEffectExpression(prop.expressionRange, useCaptureParams)})`;
      }
      return this.emitDomPropEntry(prop, useCaptureParams);
    });
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }

  private emitDomPropEntry(
    prop: Extract<PropRecord, { kind: 'named' }>,
    useCaptureParams = false
  ): string {
    if (prop.qrlSegmentId) {
      const qrlSegment = this.qrlSegments.get(prop.qrlSegmentId);
      if (qrlSegment) {
        this.importSegment(qrlSegment);
        return `${JSON.stringify(prop.name)}: ${this.emitDomEventHandler(qrlSegment)}`;
      }
    }
    if (prop.expressionRange !== undefined) {
      const value = this.emitDomEffectExpression(prop.expressionRange, useCaptureParams);
      return `get ${emitObjectGetterName(prop.name)}() { return ${value}; }`;
    }
    return `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`;
  }

  private appendChild(parent: string, child: DomOutput): void {
    if (child.kind === 'nodes') {
      this.line(
        `if (Array.isArray(${child.id})) for (let i = 0; i < ${child.id}.length; i++) ${parent}.appendChild(${child.id}[i]); else ${parent}.appendChild(${child.id});`
      );
    } else {
      this.line(`${parent}.appendChild(${child.id});`);
    }
  }

  private emitTemplateNode(node: RenderNode, id: string): void {
    if (node.kind === 'dynamicText') {
      this.emitDynamicTextBinding(id, node);
      return;
    }
    if (node.kind !== 'element') {
      return;
    }

    this.emitElementProps(id, node, false);
    let previousChildId: string | null = null;
    let previousChildIndex = -1;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!needsTemplatePatch(child)) {
        continue;
      }
      const childId = this.nextTemplateNode(child);
      const path =
        previousChildId === null
          ? childPath(id, i)
          : nextSiblingPath(previousChildId, i - previousChildIndex);
      this.line(`const ${childId} = ${path};`);
      this.emitTemplateNode(child, childId);
      previousChildId = childId;
      previousChildIndex = i;
    }
  }

  private emitDynamicTextBinding(textId: string, node: DynamicTextRenderNode): void {
    if (this.shouldBatchDomEffects()) {
      if (node.binding.kind === 'source') {
        this.use(QwikSymbol.ReadTrackedSourceValue);
        this.emitDomBatchOp(
          `${textId}.data = String(${QwikSymbol.ReadTrackedSourceValue}(${node.binding.sourceName}));`
        );
      } else {
        const callback = this.emitDomExpressionCallback(
          node.binding.qrlSegmentId,
          this.emitSourceExpression(node.expressionRange)
        );
        this.use(QwikSymbol.PatchTextValue);
        this.emitDomBatchOp(`${QwikSymbol.PatchTextValue}(${textId}, ${callback.invoke});`);
      }
      return;
    }

    const effectId = this.next('effect');
    if (node.binding.kind === 'source') {
      this.use(QwikSymbol.CreateTextNodeEffect);
      this.line(
        `const ${effectId} = ${QwikSymbol.CreateTextNodeEffect}(${textId}, ${node.binding.sourceName}, { scheduler: ctx.scheduler });`
      );
    } else {
      const callback = this.emitDomExpressionCallback(
        node.binding.qrlSegmentId,
        this.emitSourceExpression(node.expressionRange)
      );
      this.use(QwikSymbol.CreateTextExpressionEffect);
      this.line(
        `const ${effectId} = ${QwikSymbol.CreateTextExpressionEffect}(${textId}, ${callback.args}, ${callback.fn}, { scheduler: ctx.scheduler });`
      );
    }
    this.emitInitialDomEffect(effectId);
  }

  private emitElementProps(
    elementId: string,
    node: ElementRenderNode,
    includeStaticAttrs: boolean
  ): void {
    if (hasDomProps(node.props)) {
      const propsExpression = this.emitDomPropsExpression(node.props, true);
      const callback = node.propsSegmentId
        ? this.emitDomExpressionCallback(node.propsSegmentId, `(${propsExpression})`)
        : this.emitInlineDomExpressionCallback(`(${this.emitDomPropsExpression(node.props)})`);
      if (this.shouldBatchDomEffects()) {
        const prevPropsId = this.next('prevProps');
        this.use(QwikSymbol.ApplyDomProps);
        this.line(`let ${prevPropsId} = null;`);
        this.emitDomBatchOp(
          `${prevPropsId} = ${QwikSymbol.ApplyDomProps}(${elementId}, ${callback.invoke}, ${prevPropsId});`
        );
      } else {
        const effectId = this.next('effect');
        this.use(QwikSymbol.CreatePropsEffect);
        this.line(
          `const ${effectId} = ${QwikSymbol.CreatePropsEffect}(${elementId}, ${callback.args}, ${callback.fn}, { scheduler: ctx.scheduler });`
        );
        this.emitInitialDomEffect(effectId);
      }
      return;
    }

    for (const prop of node.props) {
      if (prop.kind !== 'named') {
        continue;
      }
      if (prop.binding) {
        if (this.shouldBatchDomEffects()) {
          this.emitDynamicAttrBatchOp(elementId, prop);
        } else {
          const effectId = this.next('effect');
          this.line(this.emitDynamicAttrEffect(effectId, elementId, prop));
          this.emitInitialDomEffect(effectId);
        }
        continue;
      }
      if (prop.qrlSegmentId) {
        const qrlSegment = this.qrlSegments.get(prop.qrlSegmentId);
        if (qrlSegment) {
          this.use(QwikSymbol.SetEvent);
          this.importSegment(qrlSegment);
          this.line(
            `${QwikSymbol.SetEvent}(${elementId}, ${JSON.stringify(prop.name)}, ${
              qrlSegment.symbolName
            }${this.emitEventCaptureArgs(qrlSegment)});`
          );
        }
        continue;
      }
      if (!includeStaticAttrs) {
        continue;
      }
      const attr = serializeAttrValue(prop.value);
      if (attr !== null) {
        if (prop.name === 'class') {
          if (attr !== '') {
            this.line(`${elementId}.className = ${JSON.stringify(attr)};`);
          }
        } else {
          this.line(
            `${elementId}.setAttribute(${JSON.stringify(prop.name)}, ${JSON.stringify(attr)});`
          );
        }
      }
    }
  }

  private emitBranch(node: BranchNode): DomOutput {
    const fragmentId = this.next('fragment');
    const startId = this.next('comment');
    const endId = this.next('comment');
    const branchId = this.next('branch');
    const condition = this.emitBranchCondition(node.conditionSegmentId);
    const thenRenderer = this.emitBranchRenderer(node.thenSegmentId);
    const elseRenderer = node.elseSegmentId
      ? this.emitBranchRenderer(node.elseSegmentId)
      : 'undefined';

    this.use(QwikSymbol.BranchRange);
    this.use(QwikSymbol.CreateBranch);
    this.line(`const ${fragmentId} = ctx.document.createDocumentFragment();`);
    this.line(`const ${startId} = ctx.document.createComment('b');`);
    this.line(`const ${endId} = ctx.document.createComment('/b');`);
    this.line(`${fragmentId}.appendChild(${startId});`);
    this.line(`${fragmentId}.appendChild(${endId});`);
    this.line(
      `const ${branchId} = ${QwikSymbol.CreateBranch}(ctx, new ${QwikSymbol.BranchRange}(ctx.document, ${startId}, ${endId}), ${condition}, ${thenRenderer}, ${elseRenderer});`
    );
    this.line(`ctx.scheduler.notify(${branchId});`);
    return { id: fragmentId, kind: 'node' };
  }

  private emitBranchCondition(segmentId: string): string {
    if (this.options.branchCondition === 'inline') {
      const segment = this.qrlSegments.get(segmentId)?.segment;
      if (!segment?.range) {
        throw new Error(`Missing branch condition segment ${segmentId}.`);
      }
      return `() => ${this.emitExpression(segment.range)}`;
    }
    const qrlSegment = this.qrlSegments.get(segmentId);
    if (!qrlSegment) {
      throw new Error(`Missing branch condition segment ${segmentId}.`);
    }
    return this.emitCapturedFunction(qrlSegment);
  }

  private emitBranchRenderer(segmentId: string): string {
    const qrlSegment = this.qrlSegments.get(segmentId);
    if (!qrlSegment) {
      throw new Error(`Missing branch render segment ${segmentId}.`);
    }
    this.importSegment(qrlSegment);
    return this.emitCapturedFunction(qrlSegment);
  }

  private emitFor(node: ForNode): DomOutput {
    const fragmentId = this.next('fragment');
    const startId = this.next('comment');
    const endId = this.next('comment');
    const blockId = this.next('forBlock');
    const keyFn = this.emitForKey(node.keySegmentId);
    const renderer = this.emitForRenderer(node.renderSegmentId);

    this.use(QwikSymbol.ForRange);
    this.use(QwikSymbol.CreateForBlock);
    this.line(`const ${fragmentId} = ctx.document.createDocumentFragment();`);
    this.line(`const ${startId} = ctx.document.createComment('f');`);
    this.line(`const ${endId} = ctx.document.createComment('/f');`);
    this.line(`${fragmentId}.appendChild(${startId});`);
    this.line(`${fragmentId}.appendChild(${endId});`);
    this.line(
      `const ${blockId} = ${QwikSymbol.CreateForBlock}(ctx, new ${QwikSymbol.ForRange}(ctx.document, ${startId}, ${endId}), ${node.sourceName}, ${keyFn}, ${renderer}, ${String(node.usesItemSignal)}, ${String(node.usesIndexSignal)});`
    );
    this.line(`${blockId}.run();`);
    return { id: fragmentId, kind: 'node' };
  }

  private emitForKey(segmentId: string): string {
    const qrlSegment = this.qrlSegments.get(segmentId);
    if (!qrlSegment) {
      throw new Error(`Missing for key segment ${segmentId}.`);
    }
    this.importSegment(qrlSegment);
    return this.emitCapturedFunction(qrlSegment);
  }

  private emitForRenderer(segmentId: string): string {
    const qrlSegment = this.qrlSegments.get(segmentId);
    if (!qrlSegment) {
      throw new Error(`Missing for render segment ${segmentId}.`);
    }
    this.importSegment(qrlSegment);
    return this.emitCapturedFunction(qrlSegment);
  }

  private emitCapturedFunction(qrlSegment: QrlSegmentOutput) {
    if (qrlSegment.segment.captures.length === 0) {
      return qrlSegment.symbolName;
    }
    this.use(QwikSymbol.WithCaptures);
    return `${QwikSymbol.WithCaptures}(${qrlSegment.symbolName}, [${qrlSegment.segment.captures
      .map((capture) => capture.name)
      .join(', ')}])`;
  }

  private emitDomEventHandler(qrlSegment: QrlSegmentOutput) {
    if (qrlSegment.segment.captures.length === 0) {
      return qrlSegment.symbolName;
    }
    this.use(QwikSymbol.CreateCapturedEvent);
    return `${QwikSymbol.CreateCapturedEvent}(${qrlSegment.symbolName}, ${this.emitCaptureArray(
      qrlSegment
    )})`;
  }

  private emitEventCaptureArgs(qrlSegment: QrlSegmentOutput) {
    return qrlSegment.segment.captures.length === 0 ? '' : `, ${this.emitCaptureArray(qrlSegment)}`;
  }

  private emitCaptureArray(qrlSegment: QrlSegmentOutput) {
    return `[${qrlSegment.segment.captures.map((capture) => capture.name).join(', ')}]`;
  }

  private emitDynamicAttrEffect(effectId: string, elementId: string, prop: PropRecord): string {
    if (prop.kind !== 'named') {
      throw new Error('Dynamic attribute effects require named props.');
    }
    const binding = prop.binding!;
    if (binding.kind === 'expression') {
      const callback = this.emitDomExpressionCallback(
        binding.qrlSegmentId,
        this.emitSourceExpression(binding.expressionRange)
      );
      this.use(QwikSymbol.CreateAttrExpressionEffect);
      return `const ${effectId} = ${QwikSymbol.CreateAttrExpressionEffect}(${elementId}, ${JSON.stringify(
        prop.name
      )}, ${callback.args}, ${callback.fn}, { scheduler: ctx.scheduler });`;
    }
    const sourceName = binding.sourceName;
    if (prop.name === 'class') {
      this.use(QwikSymbol.CreateClassEffect);
      return `const ${effectId} = ${QwikSymbol.CreateClassEffect}(${elementId}, ${sourceName}, { scheduler: ctx.scheduler });`;
    }
    if (prop.name === 'style') {
      this.use(QwikSymbol.CreateStyleEffect);
      return `const ${effectId} = ${QwikSymbol.CreateStyleEffect}(${elementId}, ${sourceName}, { scheduler: ctx.scheduler });`;
    }
    this.use(QwikSymbol.CreateAttrEffect);
    return `const ${effectId} = ${QwikSymbol.CreateAttrEffect}(${elementId}, ${JSON.stringify(
      prop.name
    )}, ${sourceName}, { scheduler: ctx.scheduler });`;
  }

  private emitDynamicAttrBatchOp(elementId: string, prop: PropRecord): void {
    if (prop.kind !== 'named') {
      throw new Error('Dynamic attribute effects require named props.');
    }
    const binding = prop.binding!;
    if (binding.kind === 'expression') {
      const callback = this.emitDomExpressionCallback(
        binding.qrlSegmentId,
        this.emitSourceExpression(binding.expressionRange)
      );
      this.use(QwikSymbol.PatchAttrValue);
      this.emitDomBatchOp(
        `${QwikSymbol.PatchAttrValue}(${elementId}, ${JSON.stringify(prop.name)}, ${callback.invoke});`
      );
      return;
    }

    const sourceValue = `${QwikSymbol.ReadTrackedSourceValue}(${binding.sourceName})`;
    this.use(QwikSymbol.ReadTrackedSourceValue);
    if (prop.name === 'class') {
      this.use(QwikSymbol.PatchAttrValue);
      this.emitDomBatchOp(`${QwikSymbol.PatchAttrValue}(${elementId}, 'class', ${sourceValue});`);
      return;
    }
    if (prop.name === 'style') {
      this.use(QwikSymbol.PatchAttrValue);
      this.emitDomBatchOp(`${QwikSymbol.PatchAttrValue}(${elementId}, 'style', ${sourceValue});`);
      return;
    }
    this.emitDomBatchOp(
      `${elementId}.setAttribute(${JSON.stringify(prop.name)}, String(${sourceValue}));`
    );
  }

  private shouldBatchDomEffects(): boolean {
    return (this.options.domEffectCount ?? 0) > 1;
  }

  private ensureDomBatchEffect(): string {
    if (this.batchEffectId !== null) {
      return this.batchEffectId;
    }
    const effectId = this.next('effect');
    const updateId = this.next('batch');
    this.batchEffectId = effectId;
    this.batchUpdateId = updateId;
    this.use(QwikSymbol.CreateDomBatchEffect);
    this.line(
      `const ${effectId} = ${QwikSymbol.CreateDomBatchEffect}(${updateId}, { scheduler: ctx.scheduler });`
    );
    return effectId;
  }

  private emitDomBatchOp(operation: string): void {
    const effectId = this.ensureDomBatchEffect();
    if (this.options.domEffectMode === 'run') {
      const opId = this.next('batchOp');
      this.batchOps.push(`${opId}();`);
      this.line(`function ${opId}() { ${operation} }`);
      this.use(QwikSymbol.RunDomBatchEffect);
      this.line(`${QwikSymbol.RunDomBatchEffect}(${effectId}, ${opId});`);
      return;
    }
    this.batchOps.push(operation);
  }

  finalizeDomBatchEffects(): void {
    if (this.batchEffectId === null || this.batchUpdateId === null) {
      return;
    }
    this.line(`function ${this.batchUpdateId}() { ${this.batchOps.join(' ')} }`);
    if (this.options.domEffectMode !== 'run') {
      this.line(`ctx.scheduler.notify(${this.batchEffectId});`);
    }
  }

  private emitInitialDomEffect(effectId: string): void {
    if (this.options.domEffectMode === 'run') {
      this.line(`${effectId}.run();`);
      return;
    }
    this.line(`ctx.scheduler.notify(${effectId});`);
  }

  private use(symbol: QwikSymbol): void {
    this.options.use?.(symbol);
  }

  private importSegment(qrlSegment: QrlSegmentOutput): void {
    this.options.importSegment?.(qrlSegment);
  }

  line(code: string) {
    this.lines.push(code);
  }

  raw(code: string) {
    if (code) {
      this.lines.push(code);
    }
  }

  toString() {
    return this.lines.join('\n');
  }

  emitHoists() {
    return this.hoists.length > 0 ? `${this.hoists.join('\n')}\n` : '';
  }

  getModuleImportNames(): string[] {
    return [...this.moduleImportNames];
  }

  private next(prefix: string) {
    const id = `${prefix}${this.counter}`;
    this.counter++;
    return id;
  }

  private nextHelper() {
    const prefix = this.options.helperPrefix ?? 'dom';
    const id = `${prefix}_expr${this.helperCounter}`;
    this.helperCounter++;
    return id;
  }

  private nextHoist(name: string) {
    const prefix = this.options.helperPrefix ?? 'dom';
    const id = `${prefix}_${name}${this.helperCounter}`;
    this.helperCounter++;
    return id;
  }

  private nextTemplateNode(node: RenderNode) {
    return this.next(
      node.kind === 'element' ? 'el' : node.kind === 'dynamicText' ? 'text' : 'node'
    );
  }

  private emitInlineDomExpressionCallback(expression: string): {
    args: string;
    fn: string;
    invoke: string;
  } {
    const fn = `() => (${expression})`;
    return { args: '[]', fn, invoke: `(${fn})()` };
  }

  private emitDomExpressionCallback(
    segmentId: string,
    expression: string
  ): { args: string; fn: string; invoke: string } {
    const qrlSegment = this.qrlSegments.get(segmentId);
    if (!qrlSegment) {
      return this.emitInlineDomExpressionCallback(expression);
    }
    let fn = this.helperBySegment.get(segmentId);
    if (!fn) {
      fn = this.nextHelper();
      this.helperBySegment.set(segmentId, fn);
      for (const moduleImport of qrlSegment.segment.moduleImports) {
        this.moduleImportNames.add(moduleImport.name);
      }
      const params = qrlSegment.segment.captures.map((capture) => capture.name).join(', ');
      this.hoists.push(`const ${fn} = (${params}) => (${expression});`);
    }
    const argsList = qrlSegment.segment.captures
      .map((capture) => this.emitCaptureArg(capture))
      .join(', ');
    return {
      args: `[${argsList}]`,
      fn,
      invoke: `${fn}(${argsList})`,
    };
  }

  private emitCaptureArg(capture: CaptureRecord): string {
    const param = this.component?.params[0];
    if (param?.canRewriteProps) {
      const alias = param.propAliases.find((prop) => prop.localName === capture.name);
      if (alias) {
        return `_props.${alias.propName}`;
      }
    }
    return capture.name;
  }

  private emitDomEffectExpression(range: [number, number], useCaptureParams: boolean): string {
    return useCaptureParams ? this.emitSourceExpression(range) : this.emitExpression(range);
  }

  private emitSourceExpression(range: [number, number]) {
    return rewriteLoopCaptures(
      this.sourceCode.slice(range[0], range[1]),
      this.options.loopCaptures ?? []
    );
  }

  private emitExpression(range: [number, number]) {
    return rewriteLoopCaptures(
      emitComponentExpression(this.component, this.sourceCode, range),
      this.options.loopCaptures ?? []
    );
  }
}

function createHelperPrefix(name: string): string {
  return `dom_${name.replace(/[^A-Za-z0-9_$]/g, '_')}`;
}

export function emitNodeOutputExpression(outputs: readonly DomOutput[]): string {
  if (outputs.length === 0) {
    return '[]';
  }
  if (outputs.length === 1) {
    return outputs[0].id;
  }
  const items = outputs.map((output) => output.id);
  if (outputs.some((output) => output.kind === 'nodes')) {
    return `[].concat(${items.join(', ')})`;
  }
  return `[${items.join(', ')}]`;
}

export function canEmitTemplateRoot(node: RenderNode | null): boolean {
  return node !== null && canEmitTemplateRoots(flattenTemplateRoot(node));
}

function canEmitTemplateRoots(nodes: readonly RenderNode[]): boolean {
  const roots = flattenTemplateRoots(nodes);
  return roots.length > 0 && canEmitTemplateNodeList(roots);
}

function canEmitTemplateNodeList(nodes: readonly RenderNode[]): boolean {
  if (hasAdjacentTextLikeNodes(nodes)) {
    return false;
  }
  return nodes.every(canEmitTemplateNode);
}

function canEmitTemplateNode(node: RenderNode): boolean {
  if (node.kind === 'text' || node.kind === 'dynamicText') {
    return true;
  }
  if (node.kind !== 'element') {
    return false;
  }
  if (TEMPLATE_UNSAFE_TAGS.has(node.tag)) {
    return false;
  }
  if (VOID_ELEMENTS.has(node.tag) && node.children.length > 0) {
    return false;
  }
  if (!canEmitTemplateProps(node)) {
    return false;
  }
  return canEmitTemplateNodeList(node.children);
}

function canEmitTemplateProps(node: ElementRenderNode): boolean {
  if (node.propsSegmentId !== null) {
    return false;
  }
  return node.props.every((prop) => {
    if (prop.kind === 'spread' || prop.expressionRange !== undefined) {
      return false;
    }
    return true;
  });
}

function emitTemplateHtml(nodes: readonly RenderNode[]): string {
  return nodes.map(emitTemplateNodeHtml).join('');
}

function emitTemplateNodeHtml(node: RenderNode): string {
  if (node.kind === 'text') {
    return escapeText(node.value);
  }
  if (node.kind === 'dynamicText') {
    return ' ';
  }
  if (node.kind !== 'element') {
    throw new Error('Unsupported template node.');
  }

  const attrs = emitTemplateAttrs(node);
  const open = `<${node.tag}${attrs}>`;
  if (VOID_ELEMENTS.has(node.tag)) {
    return open;
  }
  return `${open}${emitTemplateHtml(node.children)}</${node.tag}>`;
}

function emitTemplateAttrs(node: ElementRenderNode): string {
  let attrs = '';
  for (const prop of node.props) {
    if (
      prop.kind !== 'named' ||
      prop.binding ||
      prop.qrlSegmentId ||
      prop.expressionRange !== undefined
    ) {
      continue;
    }
    const attr = serializeAttrValue(prop.value);
    if (attr === null || (prop.name === 'class' && attr === '')) {
      continue;
    }
    attrs += attr === '' ? ` ${prop.name}` : ` ${prop.name}="${escapeAttr(attr)}"`;
  }
  return attrs;
}

function flattenTemplateRoot(node: RenderNode): RenderNode[] {
  return node.kind === 'fragment' ? flattenTemplateRoots(node.children) : [node];
}

function flattenTemplateRoots(nodes: readonly RenderNode[]): RenderNode[] {
  return nodes.flatMap(flattenTemplateRoot);
}

function hasAdjacentTextLikeNodes(nodes: readonly RenderNode[]): boolean {
  let previousTextLike = false;
  for (const node of nodes) {
    const textLike = node.kind === 'text' || node.kind === 'dynamicText';
    if (textLike && previousTextLike) {
      return true;
    }
    previousTextLike = textLike;
  }
  return false;
}

function childPath(parentId: string, index: number): string {
  let path = `${parentId}.firstChild`;
  return nextSiblingPath(path, index);
}

function nextSiblingPath(start: string, count: number): string {
  let path = start;
  for (let i = 0; i < count; i++) {
    path += '.nextSibling';
  }
  return path;
}

function needsTemplatePatch(node: RenderNode): boolean {
  if (node.kind === 'dynamicText') {
    return true;
  }
  if (node.kind !== 'element') {
    return false;
  }
  return (
    node.props.some(
      (prop) =>
        prop.kind === 'named' && (prop.binding !== undefined || prop.qrlSegmentId !== undefined)
    ) || node.children.some(needsTemplatePatch)
  );
}

function hasDomProps(props: readonly PropRecord[]): boolean {
  return props.some((prop) => prop.kind === 'spread');
}

const TEMPLATE_UNSAFE_TAGS = new Set(['script', 'style', 'template', 'textarea', 'title']);
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
