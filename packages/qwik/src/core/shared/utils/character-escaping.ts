import { isDev } from '@qwik.dev/core/build';
import { QError, qError } from '../error/error';

/** Characters that end an attribute name: https://html.spec.whatwg.org/#attributes-2 */
const UNSAFE_ATTR_NAME = /[\t\n\f\r "'/=>]/;
const VALID_ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9._:-]*$/;

/** A runtime tag name is written raw into the HTML, so anything but a name is rejected. */
export function assertElementName(tagName: string): void {
  if (!VALID_ELEMENT_NAME.test(tagName)) {
    throw qError(QError.invalidElementName, [JSON.stringify(tagName)]);
  }
}

/** An attribute name that would end its own name is dropped, and throws in dev. */
export function isSafeAttrName(name: string): boolean {
  if (!UNSAFE_ATTR_NAME.test(name)) {
    return true;
  }
  if (isDev) {
    throw qError(QError.unsafeAttr, [name]);
  }
  return false;
}

export function escapeHTML(html: string): string {
  let escapedHTML = '';
  const length = html.length;
  let idx = 0;
  let lastIdx = idx;
  for (; idx < length; idx++) {
    // We get the charCode NOT string. String would allocate memory.
    const ch = html.charCodeAt(idx);
    // Every time we concat a string we allocate memory. We want to minimize that.
    if (ch === 60 /* < */) {
      escapedHTML += html.substring(lastIdx, idx) + '&lt;';
    } else if (ch === 62 /* > */) {
      escapedHTML += html.substring(lastIdx, idx) + '&gt;';
    } else if (ch === 38 /* & */) {
      escapedHTML += html.substring(lastIdx, idx) + '&amp;';
    } else if (ch === 34 /* " */) {
      escapedHTML += html.substring(lastIdx, idx) + '&quot;';
    } else if (ch === 39 /* ' */) {
      escapedHTML += html.substring(lastIdx, idx) + '&#39;';
    } else {
      continue;
    }
    lastIdx = idx + 1;
  }
  if (lastIdx === 0) {
    // This is most common case, just return previous string no memory allocation.
    return html;
  } else {
    // Add the tail of replacement.
    return escapedHTML + html.substring(lastIdx);
  }
}

/** JSX text coercion: nullish and booleans render empty, everything else via String. */
export function _textValue(value: unknown): string {
  return value == null || typeof value === 'boolean' ? '' : String(value);
}
