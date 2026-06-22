export function createContentRange(start: Comment, end: Comment): Range {
  const ownerDocument = getRangeDocument(start);
  const range = ownerDocument.createRange();
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
  start: Comment,
  end: Comment,
  range: Range,
  nodes: readonly Node[]
): void {
  range.deleteContents();

  if (nodes.length === 1) {
    range.insertNode(nodes[0]);
  } else if (nodes.length > 1) {
    const fragment = getRangeDocument(start).createDocumentFragment();
    for (let i = 0; i < nodes.length; i++) {
      fragment.appendChild(nodes[i]);
    }
    range.insertNode(fragment);
  }

  range.setStartAfter(start);
  range.setEndBefore(end);
}

function getRangeDocument(start: Comment): Document {
  const ownerDocument = start.ownerDocument;
  if (ownerDocument === null) {
    throw new Error('Range start marker must have an owner document');
  }
  return ownerDocument;
}
