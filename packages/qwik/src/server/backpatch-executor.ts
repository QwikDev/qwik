import { ELEMENT_BACKPATCH_DATA, ELEMENT_BACKPATCH_ID_SELECTOR } from './qwik-copy';
import type { SsrBackpatchData } from './qwik-types';

const querySelector = document.querySelector;
const querySelectorAll = document.querySelectorAll;

try {
  for (const backpatchScript of querySelectorAll(`[type="${ELEMENT_BACKPATCH_DATA}"]`)) {
    const content = backpatchScript.textContent || '[]';
    const data = JSON.parse(content) as SsrBackpatchData[];
    // TODO: replace 3 with $numBackpatchPropsPerPatch$
    for (let i = 0; i < data.length; i += 3) {
      const id = data[i];
      const attrName = data[i + 1] as string;
      const value = data[i + 2] as string | false | null;
      const element = querySelector(`[${ELEMENT_BACKPATCH_ID_SELECTOR}="${id}"]`);

      if (!element) {
        continue;
      }

      if (value === null || value === false) {
        element.removeAttribute(attrName);
      } else {
        element.setAttribute(attrName, value);
      }
    }
  }
} catch (e) {
  console.error(e);
}
