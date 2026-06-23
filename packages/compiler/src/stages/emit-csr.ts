import type {
  ComponentPropRecord,
  ComponentRecord,
  BranchNode,
  ForNode,
  ImportRecord,
  PropRecord,
  QrlSegmentOutput,
  RenderNode,
  SegmentRecord,
} from '../types';
import { QwikSymbol } from '../words';
import {
  emitComponentParamSetup,
  emitComponentExpression,
  emitComponentSetup,
  emitImports,
  emitObjectGetterName,
  hasDynamicBinding,
  rewriteLoopCaptures,
  serializeAttrValue,
} from './emit-utils';

export interface DomOutput {
  id: string;
  kind: 'node' | 'nodes';
}

interface DomEmitterOptions {
  branchCondition?: 'qrl' | 'inline';
  domEffectMode?: 'notify' | 'run';
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
  const body = emitDomRenderer(component, qrlSegments, segments, sourceCode);
  const propsParam = getComponentPropsParam(component);
  if (component.declarationKind === 'function') {
    return `export function ${component.exportName}(${propsParam}, ctx) {\n${body}\n}`;
  }
  if (component.declarationKind === 'const') {
    return `export const ${component.exportName} = (${propsParam}, ctx) => {\n${body}\n};`;
  }
  if (component.declarationKind === 'defaultFunction') {
    const name = component.localName ? ` ${component.localName}` : '';
    return `export default function${name}(${propsParam}, ctx) {\n${body}\n}`;
  }
  return `export default (${propsParam}, ctx) => {\n${body}\n};`;
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
  const emitter = new DomEmitter(qrlSegments, sourceCode, {}, component);
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
  const roots = emitter.emitRoot(root);
  emitter.line(`return [${emitReturnItems(roots).join(', ')}];`);
  return emitter.toString();
}

export class DomEmitter {
  private counter = 0;
  private readonly lines: string[] = [];

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
      const effectId = this.next('effect');
      this.line(`const ${id} = ctx.document.createTextNode('');`);
      if (node.binding.kind === 'source') {
        this.use(QwikSymbol.CreateTextNodeEffect);
        this.line(
          `const ${effectId} = ${QwikSymbol.CreateTextNodeEffect}(${id}, ${node.binding.sourceName}, { scheduler: ctx.scheduler });`
        );
      } else {
        const expression = this.emitExpression(node.expressionRange);
        this.use(QwikSymbol.CreateTextExpressionEffect);
        this.line(
          `const ${effectId} = ${QwikSymbol.CreateTextExpressionEffect}(${id}, [], () => ${expression}, { scheduler: ctx.scheduler });`
        );
      }
      this.emitInitialDomEffect(effectId);
      return { id, kind: 'node' };
    }
    if (node.kind === 'element') {
      const id = this.next('el');
      this.line(`const ${id} = ctx.document.createElement(${JSON.stringify(node.tag)});`);
      if (hasDomProps(node.props)) {
        const effectId = this.next('effect');
        this.use(QwikSymbol.CreatePropsEffect);
        const propsExpression = this.emitDomPropsExpression(node.props);
        this.line(
          `const ${effectId} = ${QwikSymbol.CreatePropsEffect}(${id}, [], () => (${propsExpression}), { scheduler: ctx.scheduler });`
        );
        this.emitInitialDomEffect(effectId);
      } else {
        for (const prop of node.props) {
          if (prop.kind !== 'named') {
            continue;
          }
          if (prop.binding) {
            const effectId = this.next('effect');
            this.line(this.emitDynamicAttrEffect(effectId, id, prop));
            this.emitInitialDomEffect(effectId);
            continue;
          }
          if (prop.qrlSegmentId) {
            const qrlSegment = this.qrlSegments.get(prop.qrlSegmentId);
            if (qrlSegment) {
              this.use(QwikSymbol.SetEvent);
              this.importSegment(qrlSegment);
              this.line(
                `${QwikSymbol.SetEvent}(${id}, ${JSON.stringify(prop.name)}, ${this.emitEventHandler(
                  qrlSegment
                )});`
              );
            }
            continue;
          }
          const attr = serializeAttrValue(prop.value);
          if (attr !== null) {
            this.line(`${id}.setAttribute(${JSON.stringify(prop.name)}, ${JSON.stringify(attr)});`);
          }
        }
      }
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
      entries.push(
        `${JSON.stringify('children')}: [${emitReturnItems(children.flatMap((child) => this.emitRoot(child))).join(', ')}]`
      );
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
        return `${JSON.stringify(prop.name)}: ${this.emitEventHandler(qrlSegment)}`;
      }
    }
    if (prop.expressionRange !== undefined) {
      const value = this.emitExpression(prop.expressionRange);
      return `get ${emitObjectGetterName(prop.name)}() { return ${value}; }`;
    }
    return `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`;
  }

  private emitDomPropsExpression(props: PropRecord[]): string {
    const entries = props.map((prop) => {
      if (prop.kind === 'spread') {
        return `...(${this.emitExpression(prop.expressionRange)})`;
      }
      return this.emitDomPropEntry(prop);
    });
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }

  private emitDomPropEntry(prop: Extract<PropRecord, { kind: 'named' }>): string {
    if (prop.qrlSegmentId) {
      const qrlSegment = this.qrlSegments.get(prop.qrlSegmentId);
      if (qrlSegment) {
        this.importSegment(qrlSegment);
        return `${JSON.stringify(prop.name)}: ${this.emitEventHandler(qrlSegment)}`;
      }
    }
    if (prop.expressionRange !== undefined) {
      const value = this.emitExpression(prop.expressionRange);
      return `get ${emitObjectGetterName(prop.name)}() { return ${value}; }`;
    }
    return `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`;
  }

  private appendChild(parent: string, child: DomOutput): void {
    if (child.kind === 'nodes') {
      this.line(
        `for (let i = 0; i < ${child.id}.length; i++) ${parent}.appendChild(${child.id}[i]);`
      );
    } else {
      this.line(`${parent}.appendChild(${child.id});`);
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

  private emitEventHandler(qrlSegment: QrlSegmentOutput) {
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

  private emitDynamicAttrEffect(effectId: string, elementId: string, prop: PropRecord): string {
    if (prop.kind !== 'named') {
      throw new Error('Dynamic attribute effects require named props.');
    }
    const binding = prop.binding!;
    if (binding.kind === 'expression') {
      this.use(QwikSymbol.CreateAttrExpressionEffect);
      return `const ${effectId} = ${QwikSymbol.CreateAttrExpressionEffect}(${elementId}, ${JSON.stringify(
        prop.name
      )}, [], () => (${this.emitExpression(binding.expressionRange)}), { scheduler: ctx.scheduler });`;
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

  private next(prefix: string) {
    const id = `${prefix}${this.counter}`;
    this.counter++;
    return id;
  }

  private emitExpression(range: [number, number]) {
    return rewriteLoopCaptures(
      emitComponentExpression(this.component, this.sourceCode, range),
      this.options.loopCaptures ?? []
    );
  }
}

export function emitReturnItems(outputs: readonly DomOutput[]): string[] {
  return outputs.map((output) => (output.kind === 'nodes' ? `...${output.id}` : output.id));
}

function hasDomProps(props: readonly PropRecord[]): boolean {
  return props.some((prop) => prop.kind === 'spread');
}
