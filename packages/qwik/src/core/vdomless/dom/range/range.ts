export function createContentRange(document: Document, start: Comment, end: Comment): Range {
  const range = document.createRange();
  range.setStartAfter(start);
  range.setEndBefore(end);
  return range;
}

export function getRangeParent(start: Comment, end: Comment): Node {
  const parent = start.parentNode;
  if (parent === null || parent !== end.parentNode) {
    throw new Error('Range markers must share a parent');
  }
  return parent;
}

export function replaceRange(
  document: Document,
  start: Comment,
  end: Comment,
  range: Range,
  nodes: readonly Node[]
): void {
  range.deleteContents();

  if (nodes.length === 1) {
    range.insertNode(nodes[0]);
  } else if (nodes.length > 1) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < nodes.length; i++) {
      fragment.appendChild(nodes[i]);
    }
    range.insertNode(fragment);
  }

  range.setStartAfter(start);
  range.setEndBefore(end);
}
