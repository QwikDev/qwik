import type {
  ComponentRecord,
  DynamicTextNode,
  ElementNode,
  ImportRecord,
  PropRecord,
  QrlSegmentOutput,
  RenderNode,
} from '../types';
import { QwikSymbol } from '../words';
import {
  emitComponentSetup,
  emitImports,
  escapeAttr,
  escapeText,
  hasDynamicBinding,
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
  const lines = emitImports(imports);
  for (const qrlSegment of qrlSegments.values()) {
    if (qrlSegment.segment.kind === 'jsxText') {
      lines.push(
        `import { ${qrlSegment.symbolName} } from ${JSON.stringify(qrlSegment.importPath)};`
      );
    }
  }
  if (lines.length > 0) {
    lines.push('');
  }
  for (const qrlSegment of qrlSegments.values()) {
    lines.push(
      `const ${qrlSegment.qrlVariableName} = /*#__PURE__*/ ${
        QwikSymbol.Qrl
      }(${JSON.stringify(qrlSegment.importPath)}, ${JSON.stringify(qrlSegment.symbolName)});`
    );
    if (qrlSegment.segment.kind === 'jsxText') {
      lines.push(`${qrlSegment.qrlVariableName}.s(${qrlSegment.symbolName});`);
    }
  }
  return lines.length > 0 ? `${lines.join('\n')}\n\n` : '';
}

function emitSsrComponent(
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>,
  sourceCode: string
) {
  const emitter = new SsrEmitter(qrlSegments);
  const html = emitter.emitHtmlExpression(component.root!);
  const setup = emitComponentSetup(
    component,
    qrlSegments,
    sourceCode,
    hasDynamicBinding(component.root)
  );
  const statements = emitter.toString();
  const bodyParts = [setup, statements, `return ${html};`].filter(Boolean);
  const body = bodyParts.join('\n');
  const ctxParam = emitter.usesCtx ? 'ctx' : '_ctx';
  if (component.declarationKind === 'function') {
    return `export function ${component.exportName}(_props, ${ctxParam}) {\n${body}\n}`;
  }
  if (component.declarationKind === 'const') {
    return bodyParts.length > 1
      ? `export const ${component.exportName} = (_props, ${ctxParam}) => {\n${body}\n};`
      : `export const ${component.exportName} = (_props, ${ctxParam}) => ${html};`;
  }
  if (component.declarationKind === 'defaultFunction') {
    const name = component.localName ? ` ${component.localName}` : '';
    return `export default function${name}(_props, ${ctxParam}) {\n${body}\n}`;
  }
  return bodyParts.length > 1
    ? `export default (_props, ${ctxParam}) => {\n${body}\n};`
    : `export default (_props, ${ctxParam}) => ${html};`;
}

class SsrEmitter {
  private counter = 0;
  private readonly lines: string[] = [];
  usesCtx = false;

  constructor(private qrlSegments: Map<string, QrlSegmentOutput>) {}

  emitHtmlExpression(node: RenderNode) {
    return partsToExpression(this.emitHtmlParts(node));
  }

  private emitHtmlParts(node: RenderNode): HtmlPart[] {
    if (node.kind === 'text') {
      return [escapeText(node.value)];
    }
    if (node.kind === 'fragment') {
      return node.children.flatMap((child) => this.emitHtmlParts(child));
    }
    if (node.kind === 'element') {
      return this.emitElementParts(node);
    }
    if (node.kind === 'dynamicText') {
      return this.emitRangeTextParts(node);
    }
    throw new Error(node.reason);
  }

  private emitElementParts(node: ElementNode): HtmlPart[] {
    const needsElementTarget = hasDynamicSourceProp(node) || hasElementTextTarget(node);
    const elementId = needsElementTarget ? this.nextTargetId() : null;
    const parts: HtmlPart[] = [`<${node.tag}`];

    if (elementId !== null) {
      parts.push(' q:id="', { code: elementId }, '"');
    }

    for (const prop of node.props) {
      if (prop.binding) {
        parts.push(...this.emitDynamicAttrParts(prop, elementId!));
        continue;
      }
      if (prop.qrlSegmentId) {
        const qrlSegment = this.qrlSegments.get(prop.qrlSegmentId);
        if (qrlSegment) {
          this.usesCtx = true;
          parts.push({
            code: `ctx.eventAttr(${JSON.stringify(prop.name)}, ${emitQrl(qrlSegment)})`,
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

    parts.push('>');
    if (elementId !== null && hasElementTextTarget(node)) {
      parts.push(
        ...this.emitDynamicTextParts(
          node.children[0] as DynamicTextNode,
          `${QwikSymbol.CreateSsrElementTextTarget}(${elementId})`
        )
      );
    } else {
      for (const child of node.children) {
        parts.push(...this.emitHtmlParts(child));
      }
    }
    parts.push(`</${node.tag}>`);
    return parts;
  }

  private emitDynamicAttrParts(prop: PropRecord, elementId: string): HtmlPart[] {
    const binding = prop.binding!;
    this.line(`ctx.addRoot(${binding.sourceName});`);
    const target = `${QwikSymbol.CreateSsrElementTarget}(${elementId})`;
    const renderCall =
      prop.name === 'class'
        ? `${QwikSymbol.RenderSsrClass}(${target}, ${binding.sourceName})`
        : prop.name === 'style'
          ? `${QwikSymbol.RenderSsrStyle}(${target}, ${binding.sourceName})`
          : `${QwikSymbol.RenderSsrAttr}(${target}, ${JSON.stringify(prop.name)}, ${
              binding.sourceName
            })`;
    return [` ${prop.name}="`, { code: `${QwikSymbol.EscapeHTML}(${renderCall})` }, '"'];
  }

  private emitRangeTextParts(node: DynamicTextNode): HtmlPart[] {
    const id = this.nextTargetId();
    return [
      '<!--q:t=',
      { code: id },
      '-->',
      ...this.emitDynamicTextParts(node, `${QwikSymbol.CreateSsrRangeTextTarget}(${id})`),
      '<!--/q:t-->',
    ];
  }

  private emitDynamicTextParts(node: DynamicTextNode, target: string): HtmlPart[] {
    if (node.binding.kind === 'source') {
      this.line(`ctx.addRoot(${node.binding.sourceName});`);
      return [
        {
          code: `${QwikSymbol.EscapeHTML}(${QwikSymbol.RenderSsrTextNode}(${target}, ${node.binding.sourceName}))`,
        },
      ];
    }

    const qrlSegment = this.qrlSegments.get(node.binding.qrlSegmentId);
    if (!qrlSegment) {
      throw new Error(`Missing QRL segment for ${node.binding.qrlSegmentId}.`);
    }
    for (const capture of qrlSegment.segment.captures) {
      this.line(`ctx.addRoot(${capture.name});`);
    }
    return [
      {
        code: `${QwikSymbol.EscapeHTML}(${QwikSymbol.RenderSsrTextExpression}(${target}, [], ${emitQrl(
          qrlSegment
        )}))`,
      },
    ];
  }

  private nextTargetId() {
    const id = this.next('id');
    this.usesCtx = true;
    this.line(`const ${id} = ctx.nextId();`);
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
}

function emitQrl(qrlSegment: QrlSegmentOutput) {
  if (qrlSegment.segment.captures.length === 0) {
    return qrlSegment.qrlVariableName;
  }
  return `${qrlSegment.qrlVariableName}.w([${qrlSegment.segment.captures
    .map((capture) => capture.name)
    .join(', ')}])`;
}

function hasDynamicSourceProp(node: ElementNode) {
  return node.props.some((prop) => prop.binding);
}

function hasElementTextTarget(node: ElementNode) {
  return node.children.length === 1 && node.children[0].kind === 'dynamicText';
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
