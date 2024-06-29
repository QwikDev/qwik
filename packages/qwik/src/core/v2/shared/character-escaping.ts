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
