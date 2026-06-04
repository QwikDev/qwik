import type { ComponentRecord, RenderNode } from '../types';
import { indent, serializeAttrValue } from './emit-utils';

export function emitCsrModule(components: ComponentRecord[]) {
  return `${components.map(emitCsrComponent).join('\n')}\n`;
}

function emitCsrComponent(component: ComponentRecord) {
  const body = emitDomRenderer(component.root!);
  if (component.declarationKind === 'function') {
    return `export function ${component.exportName}(_props, ctx) {\n${indent(body, 2)}\n}`;
  }
  if (component.declarationKind === 'const') {
    return `export const ${component.exportName} = (_props, ctx) => {\n${indent(body, 2)}\n};`;
  }
  if (component.declarationKind === 'defaultFunction') {
    const name = component.localName ? ` ${component.localName}` : '';
    return `export default function${name}(_props, ctx) {\n${indent(body, 2)}\n}`;
  }
  return `export default (_props, ctx) => {\n${indent(body, 2)}\n};`;
}

function emitDomRenderer(root: RenderNode) {
  const emitter = new DomEmitter();
  const roots = emitter.emitRoot(root);
  emitter.line(`return [${roots.join(', ')}];`);
  return emitter.toString();
}

class DomEmitter {
  private counter = 0;
  private readonly lines: string[] = [];

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
    if (node.kind === 'element') {
      const id = this.next('el');
      this.line(`const ${id} = ctx.document.createElement(${JSON.stringify(node.tag)});`);
      for (const prop of node.props) {
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

  line(code: string) {
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
}
