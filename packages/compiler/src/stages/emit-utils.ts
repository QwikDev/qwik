import type {
  ComponentRecord,
  ImportRecord,
  PropRecord,
  QrlSegmentOutput,
  RenderNode,
  SegmentRecord,
} from '../types';
import { transformImplicitDollarCode, type DollarTransformTarget } from './implicit-dollar';

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

export function serializeAttrValue(value: PropRecord['value']): string | null {
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

export function hasCapturedQrlSegment(
  node: RenderNode | null,
  qrlSegments: Map<string, QrlSegmentOutput>
): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'element') {
    for (const prop of node.props) {
      if (
        prop.qrlSegmentId &&
        (qrlSegments.get(prop.qrlSegmentId)?.segment.captures.length ?? 0) > 0
      ) {
        return true;
      }
    }
  }
  if (node.kind === 'element' || node.kind === 'fragment') {
    return node.children.some((child) => hasCapturedQrlSegment(child, qrlSegments));
  }
  if (node.kind === 'branch') {
    return (
      (qrlSegments.get(node.conditionSegmentId)?.segment.captures.length ?? 0) > 0 ||
      (qrlSegments.get(node.thenSegmentId)?.segment.captures.length ?? 0) > 0 ||
      (node.elseSegmentId
        ? (qrlSegments.get(node.elseSegmentId)?.segment.captures.length ?? 0) > 0
        : false) ||
      node.thenChildren.some((child) => hasCapturedQrlSegment(child, qrlSegments)) ||
      node.elseChildren.some((child) => hasCapturedQrlSegment(child, qrlSegments))
    );
  }
  return false;
}

export function hasDynamicText(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText') {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'fragment') {
    return node.children.some(hasDynamicText);
  }
  if (node.kind === 'branch') {
    return node.thenChildren.some(hasDynamicText) || node.elseChildren.some(hasDynamicText);
  }
  return false;
}

export function hasDynamicBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText') {
    return true;
  }
  if (node.kind === 'branch') {
    return true;
  }
  if (node.kind === 'element') {
    if (node.props.some((prop) => prop.binding)) {
      return true;
    }
    return node.children.some(hasDynamicBinding);
  }
  if (node.kind === 'fragment') {
    return node.children.some(hasDynamicBinding);
  }
  return false;
}

export function hasBranch(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'branch') {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'fragment') {
    return node.children.some(hasBranch);
  }
  return false;
}

export function hasTextExpression(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText') {
    return node.binding.kind === 'expression';
  }
  if (node.kind === 'element' || node.kind === 'fragment') {
    return node.children.some(hasTextExpression);
  }
  if (node.kind === 'branch') {
    return node.thenChildren.some(hasTextExpression) || node.elseChildren.some(hasTextExpression);
  }
  return false;
}

export function hasSourceTextBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText') {
    return node.binding.kind === 'source';
  }
  if (node.kind === 'element' || node.kind === 'fragment') {
    return node.children.some(hasSourceTextBinding);
  }
  if (node.kind === 'branch') {
    return (
      node.thenChildren.some(hasSourceTextBinding) || node.elseChildren.some(hasSourceTextBinding)
    );
  }
  return false;
}

export function hasDynamicAttrBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'element') {
    if (node.props.some((prop) => prop.binding)) {
      return true;
    }
    return node.children.some(hasDynamicAttrBinding);
  }
  if (node.kind === 'fragment') {
    return node.children.some(hasDynamicAttrBinding);
  }
  if (node.kind === 'branch') {
    return (
      node.thenChildren.some(hasDynamicAttrBinding) || node.elseChildren.some(hasDynamicAttrBinding)
    );
  }
  return false;
}

export function hasElementTextBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'element') {
    const children = flattenElementChildren(node.children);
    if (children.length === 1 && children[0].kind === 'dynamicText') {
      return true;
    }
    return children.some(hasElementTextBinding);
  }
  if (node.kind === 'fragment') {
    return node.children.some(hasElementTextBinding);
  }
  if (node.kind === 'branch') {
    return (
      node.thenChildren.some(hasElementTextBinding) || node.elseChildren.some(hasElementTextBinding)
    );
  }
  return false;
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
  if (node.kind === 'fragment') {
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
