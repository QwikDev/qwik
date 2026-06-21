import type {
  ComponentRecord,
  ImportRecord,
  NamedPropRecord,
  QrlSegmentOutput,
  RenderNode,
  SegmentRecord,
} from '../types';
import {
  isImplicitDollarSegment,
  transformImplicitDollarCode,
  type DollarTransformTarget,
} from './implicit-dollar';
import { QwikSymbol } from '../words';

export function emitImports(imports: readonly ImportRecord[]) {
  return imports.map(emitImportDeclaration);
}

function emitImportDeclaration(importRecord: ImportRecord) {
  const clauses: string[] = [];
  const namedSpecifiers: string[] = [];
  for (const specifier of importRecord.specifiers) {
    if (specifier.kind === 'default') {
      clauses.push(specifier.localName);
    } else if (specifier.kind === 'namespace') {
      clauses.push(`* as ${specifier.localName}`);
    } else {
      namedSpecifiers.push(emitNamedSpecifier(specifier));
    }
  }
  if (namedSpecifiers.length > 0) {
    clauses.push(`{ ${namedSpecifiers.join(', ')} }`);
  }
  if (clauses.length === 0) {
    return `import ${JSON.stringify(importRecord.source)};`;
  }
  return `import ${clauses.join(', ')} from ${JSON.stringify(importRecord.source)};`;
}

function emitNamedSpecifier(
  specifier: Extract<ImportRecord['specifiers'][number], { kind: 'named' }>
) {
  if (specifier.importedName === specifier.localName) {
    return specifier.localName;
  }
  return `${specifier.importedName} as ${specifier.localName}`;
}

export function serializeAttrValue(value: NamedPropRecord['value']): string | null {
  if (value === false || value === null) {
    return null;
  }
  if (value === true) {
    return '';
  }
  return String(value);
}

export function escapeText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string) {
  return escapeText(value).replace(/"/g, '&quot;');
}

export function emitComponentSetup(
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>,
  segments: readonly SegmentRecord[],
  sourceCode: string,
  target: DollarTransformTarget,
  force = false
) {
  if (!force && !hasCapturedQrlSegment(component.root, qrlSegments)) {
    return '';
  }
  return component.setupRanges
    .map((range) => transformImplicitDollarCode(sourceCode, range, segments, qrlSegments, target))
    .join('\n');
}

export function emitComponentParamSetup(component: ComponentRecord, sourceCode: string): string {
  const param = component.params[0];
  if (!param || param.name !== null || param.bindingRange === null) {
    return '';
  }
  const binding = sourceCode.slice(param.bindingRange[0], param.bindingRange[1]);
  const fallback =
    param.defaultRange !== null
      ? ` ?? ${sourceCode.slice(param.defaultRange[0], param.defaultRange[1])}`
      : '';
  return `const ${binding} = _props${fallback};`;
}

export function emitSsrQrlPrelude(qrlSegments: Map<string, QrlSegmentOutput>): string {
  const lines: string[] = [];
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

export function shouldResolveSsrQrl(qrlSegment: QrlSegmentOutput) {
  return (
    qrlSegment.segment.kind === 'jsxText' ||
    qrlSegment.segment.kind === 'jsxSpreadProps' ||
    qrlSegment.segment.kind === 'branchCondition' ||
    isImplicitDollarSegment(qrlSegment.segment)
  );
}

export function hasCapturedQrlSegment(
  node: RenderNode | null,
  qrlSegments: Map<string, QrlSegmentOutput>
): boolean {
  return someRenderNode(node, (current) => {
    if (current.kind === 'element') {
      return current.props.some(
        (prop) =>
          prop.kind === 'named' &&
          prop.qrlSegmentId &&
          (qrlSegments.get(prop.qrlSegmentId)?.segment.captures.length ?? 0) > 0
      );
    }
    if (current.kind === 'component') {
      return current.props.some(
        (prop) =>
          prop.kind === 'named' &&
          prop.qrlSegmentId &&
          (qrlSegments.get(prop.qrlSegmentId)?.segment.captures.length ?? 0) > 0
      );
    }
    if (current.kind === 'branch') {
      return (
        (qrlSegments.get(current.conditionSegmentId)?.segment.captures.length ?? 0) > 0 ||
        (qrlSegments.get(current.thenSegmentId)?.segment.captures.length ?? 0) > 0 ||
        (current.elseSegmentId
          ? (qrlSegments.get(current.elseSegmentId)?.segment.captures.length ?? 0) > 0
          : false)
      );
    }
    return false;
  });
}

export function hasDynamicBinding(node: RenderNode | null): boolean {
  return someRenderNode(
    node,
    (current) =>
      current.kind === 'dynamicText' ||
      current.kind === 'branch' ||
      (current.kind === 'component' &&
        current.props.some(
          (prop) =>
            prop.kind === 'spread' ||
            prop.expressionRange !== undefined ||
            prop.qrlSegmentId !== undefined
        )) ||
      (current.kind === 'element' &&
        current.props.some(
          (prop) =>
            prop.kind === 'spread' ||
            (prop.kind === 'named' && (prop.binding || prop.expressionRange !== undefined))
        ))
  );
}

export function hasBranch(node: RenderNode | null): boolean {
  return someRenderNode(node, (current) => current.kind === 'branch');
}

export function hasComponent(node: RenderNode | null): boolean {
  return someRenderNode(node, (current) => current.kind === 'component');
}

export function hasTextExpression(node: RenderNode | null): boolean {
  return someRenderNode(
    node,
    (current) => current.kind === 'dynamicText' && current.binding.kind === 'expression'
  );
}

export function hasSourceTextBinding(node: RenderNode | null): boolean {
  return someRenderNode(
    node,
    (current) => current.kind === 'dynamicText' && current.binding.kind === 'source'
  );
}

export function hasDynamicAttrBinding(node: RenderNode | null): boolean {
  return someRenderNode(
    node,
    (current) =>
      current.kind === 'element' &&
      current.props.some((prop) => prop.kind === 'named' && prop.binding)
  );
}

export function hasDomPropsBinding(node: RenderNode | null): boolean {
  return someRenderNode(
    node,
    (current) => current.kind === 'element' && current.props.some((prop) => prop.kind === 'spread')
  );
}

export function hasComponentPropsSpread(node: RenderNode | null): boolean {
  return someRenderNode(
    node,
    (current) =>
      current.kind === 'component' && current.props.some((prop) => prop.kind === 'spread')
  );
}

export function hasDirectDomEvent(node: RenderNode | null): boolean {
  return someRenderNode(
    node,
    (current) =>
      current.kind === 'element' &&
      !current.props.some((prop) => prop.kind === 'spread') &&
      current.props.some((prop) => prop.kind === 'named' && prop.qrlSegmentId)
  );
}

export function emitObjectGetterName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `[${JSON.stringify(name)}]`;
}

export function hasElementTextBinding(node: RenderNode | null): boolean {
  return someRenderNode(node, (current) => {
    if (current.kind !== 'element') {
      return false;
    }
    const children = flattenElementChildren(current.children);
    return children.length === 1 && children[0].kind === 'dynamicText';
  });
}

export function hasRangeTextBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText') {
    return true;
  }
  if (node.kind === 'element') {
    const children = flattenElementChildren(node.children);
    if (children.length === 1 && children[0].kind === 'dynamicText') {
      return false;
    }
    return children.some(hasRangeTextBinding);
  }
  if (node.kind === 'fragment' || node.kind === 'component') {
    return node.children.some(hasRangeTextBinding);
  }
  if (node.kind === 'branch') {
    return (
      node.thenChildren.some(hasRangeTextBinding) || node.elseChildren.some(hasRangeTextBinding)
    );
  }
  return false;
}

export function flattenElementChildren(children: readonly RenderNode[]): RenderNode[] {
  const flattened: RenderNode[] = [];
  for (const child of children) {
    if (child.kind === 'fragment') {
      flattened.push(...flattenElementChildren(child.children));
    } else {
      flattened.push(child);
    }
  }
  return flattened;
}

function someRenderNode(
  node: RenderNode | null,
  predicate: (node: RenderNode) => boolean
): boolean {
  if (!node) {
    return false;
  }
  if (predicate(node)) {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    return node.children.some((child) => someRenderNode(child, predicate));
  }
  if (node.kind === 'branch') {
    return (
      node.thenChildren.some((child) => someRenderNode(child, predicate)) ||
      node.elseChildren.some((child) => someRenderNode(child, predicate))
    );
  }
  return false;
}
