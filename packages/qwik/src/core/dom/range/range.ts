import { isDev } from '@qwik.dev/core/build';

export function getRangeParent(start: Comment, end: Comment): Node {
  const parent = start.parentNode;
  if (isDev && (parent === null || parent !== end.parentNode)) {
    throw new Error('Range markers must share a parent');
  }
  return parent!;
}

export function replaceRange(
  document: Document,
  start: Comment,
  end: Comment,
  nodes: readonly Node[]
): void {
  // detached markers mean an ancestor already tore this range out of the DOM — nothing to do
  if (start.parentNode === null) {
    return;
  }
  // Created per operation and dropped: the browser fixes up every *live* Range on every DOM
  // mutation, so holding one per block taxes writes anywhere on the page.
  const range = document.createRange();
  range.setStartAfter(start);
  range.setEndBefore(end);
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
}
