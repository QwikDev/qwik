import type { ComponentRecord, RenderNode } from '../types';
import { escapeAttr, escapeText, serializeAttrValue } from './emit-utils';

export function emitSsrModule(components: ComponentRecord[]) {
  return `${components.map(emitSsrComponent).join('\n')}\n`;
}

function emitSsrComponent(component: ComponentRecord) {
  const html = emitHtml(component.root!);
  if (component.declarationKind === 'function') {
    return `export function ${component.exportName}(_props, _ctx) {\n  return ${JSON.stringify(html)};\n}`;
  }
  if (component.declarationKind === 'const') {
    return `export const ${component.exportName} = (_props, _ctx) => ${JSON.stringify(html)};`;
  }
  if (component.declarationKind === 'defaultFunction') {
    const name = component.localName ? ` ${component.localName}` : '';
    return `export default function${name}(_props, _ctx) {\n  return ${JSON.stringify(html)};\n}`;
  }
  return `export default (_props, _ctx) => ${JSON.stringify(html)};`;
}

function emitHtml(node: RenderNode): string {
  if (node.kind === 'text') {
    return escapeText(node.value);
  }
  if (node.kind === 'fragment') {
    return node.children.map(emitHtml).join('');
  }
  if (node.kind === 'element') {
    const attrs = node.props
      .map((prop) => {
        const value = serializeAttrValue(prop.value);
        if (value === null) {
          return '';
        }
        if (value === '') {
          return ` ${prop.name}`;
        }
        return ` ${prop.name}="${escapeAttr(value)}"`;
      })
      .join('');
    return `<${node.tag}${attrs}>${node.children.map(emitHtml).join('')}</${node.tag}>`;
  }
  throw new Error(node.reason);
}
