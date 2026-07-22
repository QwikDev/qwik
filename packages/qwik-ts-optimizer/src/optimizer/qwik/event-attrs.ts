/** Rewritten event-handler prefixes: `e`/`ep` element, `d`/`dp` document, `w`/`wp` window. */
export const REWRITTEN_EVENT_PREFIXES = [
  'q-e:', 'q-ep:', 'q-dp:', 'q-wp:', 'q-d:', 'q-w:',
] as const;

export function startsWithRewrittenEventPrefix(name: string): boolean {
  for (const prefix of REWRITTEN_EVENT_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

export function isEventAttributeName(name: string): boolean {
  return name.endsWith('$') || startsWithRewrittenEventPrefix(name);
}
