/**
 * Qwik Backpatch Executor
 *
 * This script executes the backpatch operations by finding the backpatch data script within the
 * same container and applying the patches to the DOM elements.
 */

const BACKPATCH_DATA_SELECTOR = 'script[type="qwik/backpatch"]';

const executorScript = document.currentScript;
if (executorScript) {
  const container = executorScript.closest(
    '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])'
  );
  if (container) {
    const script = container.querySelector(BACKPATCH_DATA_SELECTOR);
    if (script) {
      const data = JSON.parse(script.textContent || '[]');
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);

      let currentNode: Node | null = walker.nextNode();
      let currentNodeIdx = currentNode && (currentNode as Element).hasAttribute(':') ? 0 : -1;

      for (let i = 0; i < data.length; i += 3) {
        const elementIdx = data[i];
        const attrName = data[i + 1];
        let value = data[i + 2];

        while (currentNode && currentNodeIdx < elementIdx - 1) {
          currentNode = walker.nextNode();
          if (!currentNode) {
            break;
          }
          if ((currentNode as Element).hasAttribute(':')) {
            currentNodeIdx++;
          }
        }

        if (!currentNode || !(currentNode as Element).hasAttribute(':')) {
          continue;
        }

        const element = currentNode as Element;
        if (value == null || value === false) {
          element.removeAttribute(attrName);
        } else {
          if (typeof value === 'boolean') {
            value = '';
          }
          element.setAttribute(attrName, value);
        }
      }
    }
  }
}
