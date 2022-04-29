export function caseInsensitiveCompare(a: any, b: any): boolean {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}
