export function isTemplate(node: Node | null | undefined): node is HTMLTemplateElement {
  const tagName = (node && (node as Element).tagName) || '';
  return tagName.toUpperCase() == 'TEMPLATE';
}

export function prettyHtml(element: HTMLElement, prefix: string = ''): any {
  const lines = [];
  lines.push(prefix, '<', element.localName);
  const attrs = element.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    lines.push('\n', prefix, '    ', attr.name, '="', attr.value, '"');
  }
  lines.push('>');
  let child = isTemplate(element) ? element.content.firstChild : element.firstChild;
  while (child) {
    if (isElement(child)) {
      lines.push('\n', prettyHtml(child, prefix + '  '));
    } else {
      lines.push('\n', prefix, child.textContent);
    }
    child = child.nextSibling;
  }
  lines.push('\n', prefix, '</', element.localName, '>');
  return lines.join('');
}

export function isElement(value: any): value is HTMLElement {
  return isNode(value) && value.nodeType == 1;
}

export function isNode(value: any): value is Node {
  return value && typeof value.nodeType == 'number';
}
