import { VNodeDataSeparator } from '../vnode-data-types';

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

export function encodeVNodeDataString(str: string): string {
  let escapedHTML = '';
  const length = str.length;
  let idx = 0;
  let lastIdx = idx;
  for (; idx < length; idx++) {
    // We get the charCode NOT string. String would allocate memory.
    const ch = str.charCodeAt(idx);
    // Every time we concat a string we allocate memory. We want to minimize that.
    if (ch >= VNodeDataSeparator.ADVANCE_1 && ch <= VNodeDataSeparator.ADVANCE_8192) {
      escapedHTML += str.substring(lastIdx, idx) + '\\' + str.charAt(idx);
    } else {
      continue;
    }
    lastIdx = idx + 1;
  }
  if (lastIdx === 0) {
    // This is most common case, just return previous string no memory allocation.
    return str;
  } else {
    // Add the tail of replacement.
    return escapedHTML + str.substring(lastIdx);
  }
}

export function decodeVNodeDataString(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    if (str.charAt(i) === '\\' && i + 1 < str.length) {
      result += str.charAt(i + 1);
      i++;
    } else {
      result += str.charAt(i);
    }
  }
  return result;
}
