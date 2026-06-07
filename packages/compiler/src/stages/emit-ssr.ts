import type { ComponentRecord, ImportRecord, QrlSegmentOutput, RenderNode } from '../types';
import { QwikSymbol } from '../words';
import {
  emitComponentSetup,
  emitImports,
  escapeAttr,
  escapeText,
  serializeAttrValue,
} from './emit-utils';

type HtmlPart = string | { code: string };

export function emitSsrModule(
  components: ComponentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  sourceCode: string,
  imports: ImportRecord[]
) {
  const prelude = emitPrelude(qrlSegments, imports);
  return `${prelude}${components
    .map((component) => emitSsrComponent(component, qrlSegments, sourceCode))
    .join('\n')}\n`;
}

function emitPrelude(qrlSegments: Map<string, QrlSegmentOutput>, imports: ImportRecord[]) {
  if (imports.length === 0) {
    return '';
  }
  const lines = emitImports(imports);
  lines.push('');
  for (const qrlSegment of qrlSegments.values()) {
    lines.push(
      `const ${qrlSegment.qrlVariableName} = /*#__PURE__*/ ${
        QwikSymbol.Qrl
      }(()=>import(${JSON.stringify(qrlSegment.importPath)}), ${JSON.stringify(
        qrlSegment.symbolName
      )});`
    );
  }
  return `${lines.join('\n')}\n\n`;
}

function emitSsrComponent(
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>,
  sourceCode: string
) {
  const html = emitHtmlExpression(component.root!, qrlSegments);
  const setup = emitComponentSetup(component, qrlSegments, sourceCode);
  const body = setup ? `${setup}\nreturn ${html};` : `return ${html};`;
  if (component.declarationKind === 'function') {
    return `export function ${component.exportName}(_props, _ctx) {\n${body}\n}`;
  }
  if (component.declarationKind === 'const') {
    return setup
      ? `export const ${component.exportName} = (_props, _ctx) => {\n${body}\n};`
      : `export const ${component.exportName} = (_props, _ctx) => ${html};`;
  }
  if (component.declarationKind === 'defaultFunction') {
    const name = component.localName ? ` ${component.localName}` : '';
    return `export default function${name}(_props, _ctx) {\n${body}\n}`;
  }
  return setup
    ? `export default (_props, _ctx) => {\n${body}\n};`
    : `export default (_props, _ctx) => ${html};`;
}

function emitHtmlExpression(node: RenderNode, qrlSegments: Map<string, QrlSegmentOutput>) {
  return partsToExpression(emitHtmlParts(node, qrlSegments));
}

function emitHtmlParts(node: RenderNode, qrlSegments: Map<string, QrlSegmentOutput>): HtmlPart[] {
  if (node.kind === 'text') {
    return [escapeText(node.value)];
  }
  if (node.kind === 'fragment') {
    return node.children.flatMap((child) => emitHtmlParts(child, qrlSegments));
  }
  if (node.kind === 'element') {
    const parts: HtmlPart[] = [`<${node.tag}`];
    for (const prop of node.props) {
      if (prop.qrlSegmentId) {
        const qrlSegment = qrlSegments.get(prop.qrlSegmentId);
        if (qrlSegment) {
          parts.push(` ${prop.name}="`, { code: emitEventQrlExpression(qrlSegment) }, '"');
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
    parts.push('>');
    for (const child of node.children) {
      parts.push(...emitHtmlParts(child, qrlSegments));
    }
    parts.push(`</${node.tag}>`);
    return parts;
  }
  if (node.kind === 'dynamicText') {
    throw new Error('Dynamic JSX children are not supported yet.');
  }
  throw new Error(node.reason);
}

function emitEventQrlExpression(qrlSegment: QrlSegmentOutput) {
  if (qrlSegment.segment.captures.length === 0) {
    return qrlSegment.qrlVariableName;
  }
  return `${qrlSegment.qrlVariableName}.w([${qrlSegment.segment.captures
    .map((capture) => capture.name)
    .join(', ')}])`;
}

function partsToExpression(parts: HtmlPart[]) {
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
