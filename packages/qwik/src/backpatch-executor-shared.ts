/**
 * Shared backpatch executor logic that can be imported by both the inline script
 * (backpatch-executor.ts) and test utilities.
 */

const BACKPATCH_DATA_SELECTOR = 'script[type="qwik/backpatch"]';

/**
 * Execute backpatch operations on a document.
 *
 * @param doc - The document to execute backpatch on
 * @param containerElement - Optional specific container element (if not provided, will search for
 *   it)
 */
export function executeBackpatch(doc: Document, containerElement?: Element | null) {
  const container =
    containerElement ||
    doc.querySelector('[q\\:container]:not([q\\:container=html]):not([q\\:container=text])');

  if (container) {
    const script = container.querySelector(BACKPATCH_DATA_SELECTOR);
    if (script) {
      const data = JSON.parse(script.textContent || '[]');
      const walker = doc.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
      let currentNode: Node | null = walker.currentNode;
      let currentNodeIdx = (currentNode as Element).hasAttribute(':') ? 0 : -1;

      for (let i = 0; i < data.length; i += 3) {
        const elementIdx = data[i];
        const attrName = data[i + 1];
        let value = data[i + 2];

        while (currentNodeIdx < elementIdx) {
          currentNode = walker.nextNode();
          if (!currentNode) {
            break;
          }
          if ((currentNode as Element).hasAttribute(':')) {
            currentNodeIdx++;
          }
        }

        const element = currentNode as Element;
        if (value == null || value === false) {
          element.removeAttribute(attrName);
        } else {
          if (typeof value === 'boolean') {
            // only true value can be here
            value = '';
          }
          element.setAttribute(attrName, value);
        }
      }
    }
  }
}
