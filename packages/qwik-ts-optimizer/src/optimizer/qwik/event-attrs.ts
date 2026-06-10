/**
 * Event-handler attribute naming helpers.
 *
 * The optimizer rewrites `$`-suffixed event markers (`onClick$`) into
 * `q-*:`-prefixed attributes (`q-e:click`, `q-wp:value`, …). Several phases
 * need to recognise both forms; this module is the single source of truth for
 * the prefix set so a new prefix is added in one place, not three.
 */

/**
 * The rewritten-event-handler attribute/prop prefixes the optimizer emits.
 * `e`/`ep` = element/passive event, `d`/`dp` = document, `w`/`wp` = window.
 */
export const REWRITTEN_EVENT_PREFIXES = [
  'q-e:', 'q-ep:', 'q-dp:', 'q-wp:', 'q-d:', 'q-w:',
] as const;

/** True when `name` begins with any rewritten-event-handler prefix. */
export function startsWithRewrittenEventPrefix(name: string): boolean {
  for (const prefix of REWRITTEN_EVENT_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * True for a JSX attribute name denoting an event handler: either a
 * `$`-suffixed author marker (`onClick$`) or an already-rewritten `q-*:`
 * prefix.
 */
export function isEventAttributeName(name: string): boolean {
  return name.endsWith('$') || startsWithRewrittenEventPrefix(name);
}
