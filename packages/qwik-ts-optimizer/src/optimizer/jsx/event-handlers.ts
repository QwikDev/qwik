/**
 * Event handler prop naming transformation for the Qwik optimizer.
 *
 * Transforms JSX event prop names to Qwik's serialized event format:
 * - onClick$ -> "q-e:click" (element scope)
 * - document:onFocus$ -> "q-d:focus" (document scope)
 * - window:onClick$ -> "q-w:click" (window scope)
 * - host:onClick$ -> null (passthrough, no transformation)
 * - on-customName$ -> "q-e:custom-name" (kebab-case custom events)
 * - passive events use q-ep:/q-wp:/q-dp: prefixes
 */

import type { JSXAttributeItem } from '../../ast-types.js';
import { getJsxAttributeName } from './jsx-attr-name.js';

/**
 * Check if a JSX prop name is an event handler that will be transformed.
 *
 * Returns true for props starting with `on` (with optional scope prefix)
 * and ending with `$`. Does NOT match non-event `$` props like `custom$`.
 */
export function isEventProp(propName: string): boolean {
  if (!propName.endsWith('$')) return false;

  if (propName.startsWith('document:on')) return true;
  if (propName.startsWith('window:on')) return true;
  if (propName.startsWith('host:on')) return true;

  if (propName.startsWith('on') && propName.length > 3) {
    const charAfterOn = propName[2];
    return charAfterOn === '-' || (charAfterOn >= 'A' && charAfterOn <= 'Z');
  }

  return false;
}

export function isPassiveDirective(propName: string): boolean {
  return propName.startsWith('passive:');
}

/**
 * Convert a processed event name by replacing uppercase chars and dashes
 * with dash + lowercased char. Matches Rust's `create_event_name`.
 */
function createEventName(name: string): string {
  let result = '';
  for (const ch of name) {
    if ((ch >= 'A' && ch <= 'Z') || ch === '-') {
      result += '-';
      result += ch.toLowerCase();
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Normalize a JSX event name segment (after scope prefix and `on` are stripped).
 * Matches Rust's `normalize_jsx_event_name`.
 */
function normalizeJsxEventName(name: string): string {
  if (name === 'DOMContentLoaded') {
    return '-d-o-m-content-loaded';
  }

  const processedName = name.startsWith('-')
    ? name.slice(1)        // Custom event: strip leading dash, preserve case
    : name.toLowerCase();  // Standard event: lowercase everything first

  return createEventName(processedName);
}

/**
 * Get the scope prefix and strip-index from a JSX event prop name.
 * Matches Rust's `get_event_scope_data_from_jsx_event`.
 */
function getEventScopeData(
  propName: string,
  isPassive: boolean,
): [prefix: string, stripIndex: number] | null {
  if (propName.startsWith('window:on')) {
    return [isPassive ? 'q-wp:' : 'q-w:', 9];
  }
  if (propName.startsWith('document:on')) {
    return [isPassive ? 'q-dp:' : 'q-d:', 11];
  }
  if (propName.startsWith('on')) {
    return [isPassive ? 'q-ep:' : 'q-e:', 2];
  }
  return null;
}

/**
 * Transform an event prop name to Qwik's serialized format.
 *
 * Returns the transformed prop name string, or null if the prop should
 * pass through unchanged (host: prefix, non-event $ props, etc.).
 * Matches Rust's `jsx_event_to_html_attribute`.
 */
export function transformEventPropName(
  propName: string,
  passiveEvents: Set<string>,
): string | null {
  if (!propName.endsWith('$')) return null;
  if (propName.startsWith('host:')) return null;

  const scopeData = getEventScopeData(propName, false);
  if (!scopeData) return null;

  const [, stripIndex] = scopeData;
  const eventNameRaw = propName.slice(stripIndex, propName.length - 1);
  const normalizedName = normalizeJsxEventName(eventNameRaw);

  const isPassive = passiveEvents.has(normalizedName);
  const [prefix] = getEventScopeData(propName, isPassive)!;

  return prefix + normalizedName;
}

/**
 * The prop name an extracted event-handler call site is rewritten to.
 *
 * Component-element events keep the author-form name — the runtime resolves
 * component props itself, so no `q-*:` serialization applies. HTML-element
 * events get the serialized form via `transformEventPropName`, falling back
 * to the raw name when the transform declines (host: prefix, non-event $
 * props). `passiveEvents` follows `transformEventPropName`'s contract; the
 * inline/hoist emit path passes an empty set — passive detection is derived
 * from displayName markers only on the segment-codegen path (deliberate
 * delta, see `buildNestedCallSites`).
 */
export function eventHandlerPropName(
  rawName: string,
  isComponentEvent: boolean,
  passiveEvents: Set<string>,
): string {
  if (isComponentEvent) return rawName;
  return transformEventPropName(rawName, passiveEvents) ?? rawName;
}

/**
 * Scan JSX attributes for passive:* directives and collect normalized event names.
 * Matches Rust's `collect_passive_event_names_from_jsx_attrs`.
 */
export function collectPassiveDirectives(
  attributes: readonly JSXAttributeItem[],
): Set<string> {
  const passiveEvents = new Set<string>();

  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute') continue;

    const name = getJsxAttributeName(attr);

    if (!isPassiveDirective(name)) continue;

    const rawEventName = name.slice('passive:'.length);
    passiveEvents.add(normalizeJsxEventName(rawEventName));
  }

  return passiveEvents;
}
