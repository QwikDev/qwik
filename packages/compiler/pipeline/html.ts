/** HTML facts shared across analyse and the generators. */

/** Elements that never take children and close without an end tag. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export function normalizeAttributeName(name: string): string {
  return name === 'className' ? 'class' : name === 'htmlFor' ? 'for' : name;
}

export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

/**
 * `null` = omit the attribute; `''` = bare attribute; otherwise the (unescaped) value text.
 * `aria-*`/`spellcheck`/`draggable`/`contenteditable` stringify booleans — even `false`.
 */
export function serializeAttrValue(
  name: string,
  value: string | number | boolean | null
): string | null {
  const normalized = name.toLowerCase();
  if (
    normalized.startsWith('aria-') ||
    normalized === 'spellcheck' ||
    normalized === 'draggable' ||
    normalized === 'contenteditable'
  ) {
    return value === null ? null : String(value);
  }
  if (value === false || value === null) {
    return null;
  }
  if (value === true) {
    return '';
  }
  return String(value);
}
