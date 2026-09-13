import type { JSXAttributeItem } from 'oxc-parser';
import { isFalseLiteral, jsxAttributeName } from './ast/utils';

/** JSX prefix → html key prefix, plain and passive; the runtime's `getEventScopeDataFromJsxEvent`. */
const eventScopes = [
  ['on', 'q-e:', 'q-ep:'],
  ['window:on', 'q-w:', 'q-wp:'],
  ['document:on', 'q-d:', 'q-dp:'],
] as const;

const eventModifiers = ['preventdefault:', 'stoppropagation:', 'capture:'] as const;

export const PASSIVE_PREFIX = 'passive:';

/** `onClick$` → `q-e:click`, `window:onScroll$` → `q-w:scroll`; null for non-event names. */
export function eventScopeName(
  jsxName: string,
  passiveEvents: ReadonlySet<string> = new Set()
): string | null {
  if (!jsxName.endsWith('$')) {
    return null;
  }
  for (const [jsx, key, passiveKey] of eventScopes) {
    if (jsxName.startsWith(jsx) && /^[A-Z-]/.test(jsxName.charAt(jsx.length))) {
      const event = normalizeEventName(jsxName.slice(jsx.length, -1));
      return (passiveEvents.has(event) ? passiveKey : key) + event;
    }
  }
  return null;
}

/** `preventdefault:dblClick` → `preventdefault:dblclick`, the attribute qwikloader reads. */
export function eventModifierName(jsxName: string): string | null {
  const modifier = eventModifiers.find((prefix) => jsxName.startsWith(prefix));
  return modifier === undefined
    ? null
    : modifier + normalizeEventName(jsxName.slice(modifier.length));
}

export function normalizeEventName(name: string): string {
  if (name === 'DOMContentLoaded') {
    return '-d-o-m-content-loaded';
  }
  const base = name.charAt(0) === '-' ? name.slice(1) : name.toLowerCase();
  return base.replace(/([A-Z-])/g, (part) => '-' + part.toLowerCase());
}

/** `passive:scroll` marks the element's scroll handlers passive and is not an attribute itself. */
export function passiveEventNames(attributes: readonly JSXAttributeItem[]): Set<string> {
  const events = new Set<string>();
  for (const attribute of attributes) {
    const name = jsxAttributeName(attribute);
    if (name?.startsWith(PASSIVE_PREFIX) && !isFalseLiteral(attribute)) {
      events.add(normalizeEventName(name.slice(PASSIVE_PREFIX.length)));
    }
  }
  return events;
}
