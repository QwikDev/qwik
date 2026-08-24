/** `onClick$` → `q-e:click` — the runtime's event-attr key; null for non-event names. */
export function eventScopeName(jsxName: string): string | null {
  if (!jsxName.endsWith('$') || !/^on[A-Z-]/.test(jsxName)) {
    return null;
  }
  return `q-e:${normalizeEventName(jsxName.slice(2, -1))}`;
}

function normalizeEventName(name: string): string {
  if (name === 'DOMContentLoaded') {
    return '-d-o-m-content-loaded';
  }
  const base = name.charAt(0) === '-' ? name.slice(1) : name.toLowerCase();
  return base.replace(/([A-Z-])/g, (part) => '-' + part.toLowerCase());
}
