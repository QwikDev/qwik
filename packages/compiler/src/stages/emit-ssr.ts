import type {
  ComponentPropRecord,
  ComponentRecord,
  BranchNode,
  DynamicTextNode,
  ElementNode,
  ImportRecord,
  PropRecord,
  QrlSegmentOutput,
  RenderNode,
  SegmentRecord,
} from '../types';
import { QwikSymbol } from '../words';
import {
  emitComponentSetup,
  emitImports,
  escapeAttr,
  escapeText,
  flattenElementChildren,
  hasDynamicBinding,
  serializeAttrValue,
} from './emit-utils';
import { emitQrlReference, isImplicitDollarSegment } from './implicit-dollar';

type HtmlPart = string | { code: string };

export function emitSsrModule(
  components: ComponentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string,
  imports: ImportRecord[]
) {
  const prelude = emitPrelude(qrlSegments, imports);
  return `${prelude}${components
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
  if (lines.length > 0) {
    lines.push('');
  }
  for (const qrlSegment of qrlSegments.values()) {
    lines.push(
      `const ${qrlSegment.qrlVariableName} = /*#__PURE__*/ ${
        QwikSymbol.QrlWithChunk
      }(${JSON.stringify(qrlSegment.importPath)}, () => import(${JSON.stringify(
        qrlSegment.importPath
      )}), ${JSON.stringify(qrlSegment.symbolName)});`
    );
    if (shouldResolveSsrQrl(qrlSegment)) {
      lines.push(`${qrlSegment.qrlVariableName}.s(${qrlSegment.symbolName});`);
    }
  }
  return lines.length > 0 ? `${lines.join('\n')}\n\n` : '';
}

function shouldResolveSsrQrl(qrlSegment: QrlSegmentOutput) {
  return (
    qrlSegment.segment.kind === 'jsxText' ||
    qrlSegment.segment.kind === 'branchCondition' ||
    isImplicitDollarSegment(qrlSegment.segment)
  );
}

function emitSsrComponent(
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string
) {
  const emitter = new SsrEmitter(qrlSegments, sourceCode);
  const html = emitter.emitHtmlExpression(component.root!);
  const setup = emitComponentSetup(
    component,
    qrlSegments,
    segments,
    sourceCode,
    'ssr',
    hasDynamicBinding(component.root) || component.providesContext
  );
  const statements = emitter.toString();
  const bodyParts = component.providesContext
    ? [
        setup,
        'const contextScopeId = ctx.contextScopeId();',
        statements,
        `const contextHtml = ${html};`,
        "return '<!c=' + contextScopeId + '>' + contextHtml + '<!/c>';",
      ].filter(Boolean)
    : [setup, statements, `return ${html};`].filter(Boolean);
  const body = bodyParts.join('\n');
  const ctxParam = emitter.usesCtx || component.providesContext ? 'ctx' : '_ctx';
  const propsParam = getComponentPropsParam(component);
  if (component.declarationKind === 'function') {
    return `export function ${component.exportName}(${propsParam}, ${ctxParam}) {\n${body}\n}`;
  }
  if (component.declarationKind === 'const') {
    return bodyParts.length > 1
      ? `export const ${component.exportName} = (${propsParam}, ${ctxParam}) => {\n${body}\n};`
      : `export const ${component.exportName} = (${propsParam}, ${ctxParam}) => ${html};`;
  }
  if (component.declarationKind === 'defaultFunction') {
    const name = component.localName ? ` ${component.localName}` : '';
    return `export default function${name}(${propsParam}, ${ctxParam}) {\n${body}\n}`;
  }
  return bodyParts.length > 1
    ? `export default (${propsParam}, ${ctxParam}) => {\n${body}\n};`
    : `export default (${propsParam}, ${ctxParam}) => ${html};`;
}

function getComponentPropsParam(component: ComponentRecord): string {
  return component.params[0]?.name ?? '_props';
}

class SsrEmitter {
  private counter = 0;
  private readonly lines: string[] = [];
  usesCtx = false;

  constructor(
    private qrlSegments: Map<string, QrlSegmentOutput>,
    private sourceCode: string
  ) {}

  emitHtmlExpression(node: RenderNode) {
    return partsToExpression(this.emitHtmlParts(node));
  }

  private emitHtmlParts(node: RenderNode): HtmlPart[] {
    if (node.kind === 'text') {
      return [escapeText(node.value)];
    }
    if (node.kind === 'children') {
      return [{ code: `(${node.propsName}.children ?? '')` }];
    }
    if (node.kind === 'fragment') {
      return node.children.flatMap((child) => this.emitHtmlParts(child));
    }
    if (node.kind === 'component') {
      return this.emitComponentParts(node);
    }
    if (node.kind === 'branch') {
      return this.emitBranchParts(node);
    }
    if (node.kind === 'element') {
      return this.emitElementParts(node);
    }
    if (node.kind === 'dynamicText') {
      throw new Error('Dynamic text outside an element is not supported for SSR resume yet.');
    }
    throw new Error(node.reason);
  }

  private emitComponentParts(node: Extract<RenderNode, { kind: 'component' }>): HtmlPart[] {
    this.usesCtx = true;
    return [
      {
        code: `${QwikSymbol.CreateComponent}(${this.emitComponentProps(
          node.props,
          node.children
        )}, (props) => ${node.name}(props, ctx))`,
      },
    ];
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
        `${JSON.stringify('children')}: ${partsToExpression(
          children.flatMap((child) => this.emitHtmlParts(child))
        )}`
      );
    }
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }

  private emitElementParts(node: ElementNode): HtmlPart[] {
    const children = flattenElementChildren(node.children);
    const hasElementText = hasElementTextTarget(children);
    const hasRangeText = !hasElementText && hasDirectRangeTextTarget(children);
    const needsElementTarget = hasDynamicSourceProp(node) || hasElementText || hasRangeText;
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

    parts.push('>');
    if (elementId !== null && hasElementText) {
      parts.push(
        ...this.emitDynamicTextParts(
          children[0] as DynamicTextNode,
          `${QwikSymbol.CreateSsrElementTextTarget}(${elementId})`
        )
      );
    } else if (elementId !== null && hasRangeText) {
      parts.push(...this.emitElementChildrenWithRangeTextParts(children, elementId));
    } else {
      for (const child of children) {
        parts.push(...this.emitHtmlParts(child));
      }
    }
    parts.push(`</${node.tag}>`);
    return parts;
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

    const thenHtml = partsToExpression(
      node.thenChildren.flatMap((child) => this.emitHtmlParts(child))
    );
    const elseHtml = partsToExpression(
      node.elseChildren.flatMap((child) => this.emitHtmlParts(child))
    );
    const args = [
      rangeId,
      '[]',
      emitQrlReference(conditionQrl),
      emitQrlReference(thenQrl),
      elseQrl ? emitQrlReference(elseQrl) : 'undefined',
      `() => ${thenHtml}`,
    ];
    if (elseQrl || node.elseChildren.length > 0) {
      args.push(`() => ${elseHtml}`);
    }

    return [
      '<!b=',
      { code: rangeId },
      '>',
      {
        code: `${QwikSymbol.RenderSsrBranch}(${args.join(', ')})`,
      },
      '<!/b>',
    ];
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
        code: `${QwikSymbol.EscapeHTML}(${QwikSymbol.RenderSsrTextExpression}(${target}, [], ${emitQrlReference(
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

  private requireQrlSegment(id: string) {
    const qrlSegment = this.qrlSegments.get(id);
    if (!qrlSegment) {
      throw new Error(`Missing QRL segment for ${id}.`);
    }
    return qrlSegment;
  }

  private emitCaptureRoots(qrlSegment: QrlSegmentOutput) {
    for (const capture of qrlSegment.segment.captures) {
      this.line(`ctx.addRoot(${capture.name});`);
    }
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

function hasDynamicSourceProp(node: ElementNode) {
  return node.props.some((prop) => prop.binding);
}

function hasElementTextTarget(children: readonly RenderNode[]) {
  return children.length === 1 && children[0].kind === 'dynamicText';
}

function hasDirectRangeTextTarget(children: readonly RenderNode[]) {
  return children.some((child) => child.kind === 'dynamicText');
}

function needsTextBoundary(node: RenderNode | undefined) {
  return node !== undefined && node.kind === 'text' && node.value.length > 0;
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
