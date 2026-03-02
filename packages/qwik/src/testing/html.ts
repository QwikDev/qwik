import { EventNameHtmlScope } from '../core/shared/utils/event-names';
import { ELEMENT_KEY, Q_PROPS_SEPARATOR } from '../core/shared/utils/markers';
import { isSelfClosingTag } from '../server/tag-nesting';

export function isTemplate(node: Node | null | undefined): node is HTMLTemplateElement {
  const tagName = (node && (node as Element).tagName) || '';
  return tagName.toUpperCase() == 'TEMPLATE';
}

export function prettyHtml(element: HTMLElement, prefix: string = ''): any {
  const lines = [];
  lines.push(prefix, '<', element.localName);
  const attrs = Array.from(element.attributes)
    .map((attr) => ({ name: attr.name, value: attr.value }))
    .filter(
      (attr) =>
        [Q_PROPS_SEPARATOR, ELEMENT_KEY].indexOf(attr.name) == -1 &&
        !attr.name.startsWith(EventNameHtmlScope.on)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    lines.push('\n', prefix, '   ', attr.name, '="', attr.value, '"');
  }

  if (isSelfClosingTag(element.localName)) {
    lines.push(' />');
    return lines.join('');
  }
  lines.push('>');
  let child = isTemplate(element) ? element.content.firstChild : element.firstChild;
  let text = '';
  while (child) {
    if (child.nodeType === 3) {
      text += child.textContent;
      child = child.nextSibling;
      continue;
    } else if (text) {
      lines.push('\n', prefix, text);
      text = '';
    }
    if (isElement(child)) {
      lines.push('\n', prettyHtml(child, prefix + '  '));
    } else {
      lines.push('\n', prefix, child.textContent);
    }
    child = child.nextSibling;
  }
  if (text) {
    lines.push('\n', prefix, text);
    text = '';
  }
  lines.push('\n', prefix, '</', element.localName, '>');
  return lines.join('');
}

export function isElement(value: any): value is HTMLElement {
  return isNode(value) && value.nodeType === 1;
}

export function isNode(value: any): value is Node {
  return value && typeof value.nodeType === 'number';
}
