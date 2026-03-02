import type { JSXOutput } from '@qwik.dev/core';
import { isJSXNode } from '../core/shared/jsx/jsx-node';
import { ELEMENT_KEY, Q_PROPS_SEPARATOR } from '../core/shared/utils/markers';
import { isSelfClosingTag } from '../server/tag-nesting';
import { serializeAttribute } from '../core/shared/utils/styles';

export function prettyJSX(element: JSXOutput, prefix: string = ''): string {
  if (!isJSXNode(element)) {
    return prefix + element;
  }
  const lines = [];
  lines.push(prefix, '<', element.type);
  const attrs = Object.entries(element.props)
    .map(([name, value]) => {
      const serializedAttr = serializeAttribute(name, value);
      return {
        name,
        value: serializedAttr === true ? '' : serializedAttr,
      };
    })
    .filter(
      (attr) =>
        [Q_PROPS_SEPARATOR, ELEMENT_KEY, 'children'].indexOf(attr.name) == -1 &&
        !attr.name.startsWith('on')
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    lines.push('\n', prefix, '   ', attr.name, '="', attr.value, '"');
  }
  if (typeof element.type === 'string' && isSelfClosingTag(element.type)) {
    lines.push(' />');
    return lines.join('');
  }
  lines.push('>');
  const children = element.children;
  if (children) {
    if (isJSXNode(children)) {
      lines.push('\n', prettyJSX(children, prefix + '  '));
    } else if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isJSXNode(child)) {
          lines.push('\n', prettyJSX(child, prefix + '  '));
        } else {
          lines.push('\n', prefix, child);
        }
      }
    } else {
      lines.push('\n', prefix, children);
    }
  }
  lines.push('\n', prefix, '</', element.type, '>');
  return lines.join('');
}
