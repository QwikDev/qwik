const EXPAND_ANIMATION_DELAY_MS = 250;
const HIGHLIGHT_FLASH_MS = 1500;

/** Finds the first tree row whose node name matches, comparing the rendered `data-node-name`. */
function findRowByName(container: HTMLElement, name: string): HTMLElement | null {
  const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-node-name]'));
  return rows.find((row) => row.dataset.nodeName === name) ?? null;
}

/**
 * Expands the collapsed ancestors of a tree row, scrolls it into view, and briefly highlights it.
 * DOM-driven because tree expansion lives in each node's local state, so there is no signal to set.
 * Returns false when no matching row exists yet, so the caller can retry while the tree loads.
 */
export function revealTreeNodeByName(container: HTMLElement, name: string): boolean {
  const targetRow = findRowByName(container, name);
  if (!targetRow) {
    return false;
  }

  // Expand every collapsed ancestor by clicking its row (an animated container has maxHeight 0).
  let parent = targetRow.parentElement;
  while (parent && parent !== container) {
    const rowToExpand = parent.previousElementSibling;
    if (parent.style.maxHeight === '0px' && rowToExpand instanceof HTMLElement) {
      rowToExpand.click();
    }
    parent = parent.parentElement;
  }

  setTimeout(() => {
    targetRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
    targetRow.click();
    targetRow.style.background = 'rgba(139, 92, 246, 0.25)';
    targetRow.style.borderRadius = '8px';
    targetRow.style.transition = 'background 0.5s';
    setTimeout(() => {
      targetRow.style.background = '';
      targetRow.style.borderRadius = '';
      targetRow.style.transition = '';
    }, HIGHLIGHT_FLASH_MS);
  }, EXPAND_ANIMATION_DELAY_MS);
  return true;
}
