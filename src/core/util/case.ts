export function fromCamelToKebabCase(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function fromKebabToCamelCase(text: string): string {
  return text.replace(/-./g, (x) => x[1].toUpperCase());
}
