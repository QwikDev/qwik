export type StaticAttributeValue = string | number | boolean | null;

export function serializeAttrValue(name: string, value: StaticAttributeValue): string | null {
  const normalizedName = name.toLowerCase();
  if (
    normalizedName.startsWith('aria-') ||
    normalizedName === 'spellcheck' ||
    normalizedName === 'draggable' ||
    normalizedName === 'contenteditable'
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

export function escapeText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string) {
  return escapeText(value).replace(/"/g, '&quot;');
}
