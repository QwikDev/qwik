import type {
  ComponentRecord,
  BranchNode,
  ImportRecord,
  QrlSegmentOutput,
  RenderNode,
  SegmentRecord,
} from '../types';
import { QwikSymbol } from '../words';
import {
  emitComponentSetup,
  emitImports,
  hasDynamicBinding,
  serializeAttrValue,
} from './emit-utils';

export function emitCsrModule(
  components: ComponentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string,
  imports: ImportRecord[]
) {
  const prelude = emitPrelude(imports);
  return `${prelude}${components
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
  if (component.declarationKind === 'function') {
    return `export function ${component.exportName}(_props, ctx) {\n${body}\n}`;
  }
  if (component.declarationKind === 'const') {
    return `export const ${component.exportName} = (_props, ctx) => {\n${body}\n};`;
  }
  if (component.declarationKind === 'defaultFunction') {
    const name = component.localName ? ` ${component.localName}` : '';
    return `export default function${name}(_props, ctx) {\n${body}\n}`;
  }
  return `export default (_props, ctx) => {\n${body}\n};`;
}

function emitDomRenderer(
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string
) {
  const emitter = new DomEmitter(qrlSegments, sourceCode);
  const root = component.root!;
  emitter.raw(
    emitComponentSetup(component, qrlSegments, segments, sourceCode, 'csr', hasDynamicBinding(root))
  );
  const roots = emitter.emitRoot(root);
  emitter.line(`return [${roots.join(', ')}];`);
  return emitter.toString();
}

class DomEmitter {
  private counter = 0;
  private readonly lines: string[] = [];

  constructor(
    private qrlSegments: Map<string, QrlSegmentOutput>,
    private sourceCode: string
  ) {}

  emitRoot(node: RenderNode): string[] {
    if (node.kind === 'fragment') {
      return node.children.flatMap((child) => this.emitRoot(child));
    }
    return [this.emitNode(node)];
  }

  emitNode(node: RenderNode): string {
    if (node.kind === 'text') {
      const id = this.next('text');
      this.line(`const ${id} = ctx.document.createTextNode(${JSON.stringify(node.value)});`);
      return id;
    }
    if (node.kind === 'dynamicText') {
      const id = this.next('text');
      const effectId = this.next('effect');
      this.line(`const ${id} = ctx.document.createTextNode('');`);
      if (node.binding.kind === 'source') {
        this.line(
          `const ${effectId} = ${QwikSymbol.CreateTextNodeEffect}(${id}, ${node.binding.sourceName}, { scheduler: ctx.scheduler });`
        );
      } else {
        const expression = this.sourceCode.slice(node.expressionRange[0], node.expressionRange[1]);
        this.line(
          `const ${effectId} = ${QwikSymbol.CreateTextExpressionEffect}(${id}, [], () => ${expression}, { scheduler: ctx.scheduler });`
        );
      }
      this.line(`ctx.scheduler.notify(${effectId});`);
      return id;
    }
    if (node.kind === 'element') {
      const id = this.next('el');
      this.line(`const ${id} = ctx.document.createElement(${JSON.stringify(node.tag)});`);
      for (const prop of node.props) {
        if (prop.binding) {
          const effectId = this.next('effect');
          this.line(emitDynamicAttrEffect(effectId, id, prop));
          this.line(`ctx.scheduler.notify(${effectId});`);
          continue;
        }
        if (prop.qrlSegmentId) {
          const qrlSegment = this.qrlSegments.get(prop.qrlSegmentId);
          if (qrlSegment) {
            this.line(
              `${QwikSymbol.SetEvent}(${id}, ${JSON.stringify(prop.name)}, ${emitEventHandler(
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
      for (const child of node.children) {
        const childId = this.emitNode(child);
        this.line(`${id}.appendChild(${childId});`);
      }
      return id;
    }
    if (node.kind === 'branch') {
      return this.emitBranch(node);
    }
    if (node.kind === 'fragment') {
      const id = this.next('fragment');
      this.line(`const ${id} = ctx.document.createDocumentFragment();`);
      for (const child of node.children) {
        const childId = this.emitNode(child);
        this.line(`${id}.appendChild(${childId});`);
      }
      return id;
    }
    throw new Error(node.reason);
  }

  private emitBranch(node: BranchNode): string {
    const fragmentId = this.next('fragment');
    const startId = this.next('comment');
    const endId = this.next('comment');
    const branchId = this.next('branch');
    const condition = this.sourceCode.slice(node.conditionRange[0], node.conditionRange[1]);
    const thenRenderer = this.emitBranchRenderer(node.thenSegmentId);
    const elseRenderer = node.elseSegmentId
      ? this.emitBranchRenderer(node.elseSegmentId)
      : 'undefined';

    this.line(`const ${fragmentId} = ctx.document.createDocumentFragment();`);
    this.line(`const ${startId} = ctx.document.createComment('b');`);
    this.line(`const ${endId} = ctx.document.createComment('/b');`);
    this.line(`${fragmentId}.appendChild(${startId});`);
    this.line(`${fragmentId}.appendChild(${endId});`);
    this.line(
      `const ${branchId} = ${QwikSymbol.CreateBranch}(${QwikSymbol.CreateBranchRange}(${startId}, ${endId}), [], () => ${condition}, ${thenRenderer}, ${elseRenderer}, { scheduler: ctx.scheduler, container: ctx });`
    );
    this.line(`ctx.scheduler.notify(${branchId});`);
    return fragmentId;
  }

  private emitBranchRenderer(segmentId: string): string {
    const qrlSegment = this.qrlSegments.get(segmentId);
    if (!qrlSegment) {
      throw new Error(`Missing branch render segment ${segmentId}.`);
    }
    return emitCapturedFunction(qrlSegment);
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
}

function emitEventHandler(qrlSegment: QrlSegmentOutput) {
  return emitCapturedFunction(qrlSegment);
}

function emitCapturedFunction(qrlSegment: QrlSegmentOutput) {
  if (qrlSegment.segment.captures.length === 0) {
    return qrlSegment.symbolName;
  }
  return `${QwikSymbol.WithCaptures}(${qrlSegment.symbolName}, [${qrlSegment.segment.captures
    .map((capture) => capture.name)
    .join(', ')}])`;
}

function emitDynamicAttrEffect(
  effectId: string,
  elementId: string,
  prop: Extract<RenderNode, { kind: 'element' }>['props'][number]
): string {
  const sourceName = prop.binding!.sourceName;
  if (prop.name === 'class') {
    return `const ${effectId} = ${QwikSymbol.CreateClassEffect}(${elementId}, ${sourceName}, { scheduler: ctx.scheduler });`;
  }
  if (prop.name === 'style') {
    return `const ${effectId} = ${QwikSymbol.CreateStyleEffect}(${elementId}, ${sourceName}, { scheduler: ctx.scheduler });`;
  }
  return `const ${effectId} = ${QwikSymbol.CreateAttrEffect}(${elementId}, ${JSON.stringify(
    prop.name
  )}, ${sourceName}, { scheduler: ctx.scheduler });`;
}
