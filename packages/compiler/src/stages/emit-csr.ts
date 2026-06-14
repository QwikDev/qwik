import type {
  ComponentPropRecord,
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

interface DomOutput {
  id: string;
  kind: 'node' | 'nodes';
}

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
  const emitter = new DomEmitter(qrlSegments, sourceCode);
  const root = component.root!;
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

class DomEmitter {
  private counter = 0;
  private readonly lines: string[] = [];

  constructor(
    private qrlSegments: Map<string, QrlSegmentOutput>,
    private sourceCode: string
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
      return { id, kind: 'node' };
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
        this.appendChild(id, this.emitNode(child));
      }
      return { id, kind: 'node' };
    }
    if (node.kind === 'component') {
      const id = this.next('cmp');
      const props = this.emitComponentProps(node.props, node.children);
      this.line(
        `const ${id} = ${QwikSymbol.CreateComponent}(${props}, (props) => ${node.name}(props, ctx), { container: ctx });`
      );
      return { id, kind: 'nodes' };
    }
    if (node.kind === 'branch') {
      return this.emitBranch(node);
    }
    if (node.kind === 'fragment') {
      const id = this.next('fragment');
      this.line(`const ${id} = ctx.document.createDocumentFragment();`);
      for (const child of node.children) {
        this.appendChild(id, this.emitNode(child));
      }
      return { id, kind: 'node' };
    }
    throw new Error(node.reason);
  }

  private emitComponentProps(
    props: ComponentPropRecord[],
    children: readonly RenderNode[]
  ): string {
    const entries = props.map((prop) => {
      if (prop.expressionRange !== undefined) {
        const value = this.sourceCode.slice(prop.expressionRange[0], prop.expressionRange[1]);
        return `get ${JSON.stringify(prop.name)}() { return ${value}; }`;
      }
      return `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`;
    });
    if (children.length > 0) {
      entries.push(
        `${JSON.stringify('children')}: [${emitReturnItems(children.flatMap((child) => this.emitRoot(child))).join(', ')}]`
      );
    }
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }

  private appendChild(parent: string, child: DomOutput): void {
    if (child.kind === 'nodes') {
      this.line(`for (const child of ${child.id}) ${parent}.appendChild(child);`);
    } else {
      this.line(`${parent}.appendChild(${child.id});`);
    }
  }

  private emitBranch(node: BranchNode): DomOutput {
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
    return { id: fragmentId, kind: 'node' };
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

function emitReturnItems(outputs: readonly DomOutput[]): string[] {
  return outputs.map((output) => (output.kind === 'nodes' ? `...${output.id}` : output.id));
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
