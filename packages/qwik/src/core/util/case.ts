export function fromCamelToKebabCase(text: string): string {
  return text.replace(/([A-Z])/g, '-$1').toLowerCase();
}

export function fromKebabToCamelCase(text: string): string {
  return text.replace(/-./g, (x) => x[1].toUpperCase());
}
