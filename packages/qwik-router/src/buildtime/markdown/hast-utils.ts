// Minimal inlined replacement for `hast-util-to-string` and `hast-util-heading-rank`.

export function hastToString(node: any): string {
  if (node && Array.isArray(node.children)) {
    return node.children.map(textContent).join('');
  }
  return typeof node?.value === 'string' ? node.value : '';
}

function textContent(node: any): string {
  if (node.type === 'text') {
    return node.value || '';
  }
  return Array.isArray(node.children) ? node.children.map(textContent).join('') : '';
}

export function headingRank(node: any): number | undefined {
  const tagName = node?.type === 'element' && typeof node.tagName === 'string' ? node.tagName : '';
  const rank = tagName.length === 2 && tagName[0] === 'h' ? Number(tagName[1]) : NaN;
  return rank >= 1 && rank <= 6 ? rank : undefined;
}
