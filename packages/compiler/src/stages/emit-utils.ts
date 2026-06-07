import type {
  ComponentRecord,
  ImportRecord,
  PropRecord,
  QrlSegmentOutput,
  RenderNode,
} from '../types';

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
  sourceCode: string,
  force = false
) {
  if (!force && !hasCapturedQrlSegment(component.root, qrlSegments)) {
    return '';
  }
  return component.setupRanges.map(([start, end]) => sourceCode.slice(start, end)).join('\n');
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
  return false;
}

export function hasDynamicBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText') {
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
  return false;
}

export function hasElementTextBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'element') {
    if (node.children.length === 1 && node.children[0].kind === 'dynamicText') {
      return true;
    }
    return node.children.some(hasElementTextBinding);
  }
  if (node.kind === 'fragment') {
    return node.children.some(hasElementTextBinding);
  }
  return false;
}

export function hasRangeTextBinding(node: RenderNode | null, elementTextOnly = false): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText') {
    return !elementTextOnly;
  }
  if (node.kind === 'element') {
    const childElementTextOnly =
      node.children.length === 1 && node.children[0].kind === 'dynamicText';
    return node.children.some((child) => hasRangeTextBinding(child, childElementTextOnly));
  }
  if (node.kind === 'fragment') {
    return node.children.some((child) => hasRangeTextBinding(child, false));
  }
  return false;
}
