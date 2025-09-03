/**
 * Qwik Backpatch Executor
 *
 * This script executes the backpatch operations by finding the backpatch data script within the
 * same container and applying the patches to the DOM elements.
 */

const executorScript = document.querySelector('script[q\\:backpatch-executor]');
if (executorScript) {
  const container = executorScript.closest('[q\\:container]');
  if (container) {
    const script = container.querySelector('script[type="qwik/backpatch"]');
    if (script) {
      const data = JSON.parse(script.textContent || '[]');
      const elements: Element[] = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
      let n: Node | null = walker.currentNode;
      while (n) {
        elements.push(n as Element);
        n = walker.nextNode();
      }

      for (let j = 0; j < data.length; ) {
        const attr = data[j++];
        const value = data[j++];

        while (j < data.length && typeof data[j] === 'number') {
          const idx = +data[j++];
          const el = elements[idx];
          if (!el) {
            continue;
          }

          if (value === null || value === false) {
            el.removeAttribute(attr);
          } else {
            el.setAttribute(attr, value === true ? '' : String(value));
          }
        }
      }
    }
  }
}
