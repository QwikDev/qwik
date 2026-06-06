import type { ComponentRecord, PropRecord, QrlSegmentOutput, RenderNode } from '../types';

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

export function indent(value: string, spaces: number) {
  const prefix = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

export function emitComponentSetup(
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>,
  sourceCode: string
) {
  if (!hasCapturedQrlSegment(component.root, qrlSegments)) {
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
