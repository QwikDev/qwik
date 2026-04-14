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

export interface EventTransformResult {
  outputPropName: string;
  isHtmlOnly: boolean;
  stripPassive: string[];
}

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
 * Convert camelCase string to kebab-case.
 */
export function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (match, offset) => {
    return (offset > 0 ? '-' : '') + match.toLowerCase();
  });
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

type PassiveDirectiveAttributeName =
  | {
      type: string;
      name?: unknown;
      namespace?: { name: string };
    };

type PassiveDirectiveAttribute = {
  type: string;
  name?: PassiveDirectiveAttributeName;
};

function getJsxAttributeName(attr: PassiveDirectiveAttribute): string | null {
  if (attr.name?.type === 'JSXIdentifier' && typeof attr.name.name === 'string') {
    return attr.name.name;
  }
  if (
    attr.name?.type === 'JSXNamespacedName' &&
    attr.name.namespace &&
    typeof attr.name.name === 'object' &&
    attr.name.name !== null &&
    'name' in attr.name.name &&
    typeof attr.name.name.name === 'string'
  ) {
    return `${attr.name.namespace.name}:${attr.name.name.name}`;
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
 * Convert a JSX event name to its plain event name for matching/display.
 * Matches Rust's `jsx_event_to_event_name`.
 */
export function jsxEventToEventName(jsxEvent: string): string | null {
  if (!jsxEvent.endsWith('$')) return null;

  const scopeData = getEventScopeData(jsxEvent, false);
  if (!scopeData) return null;

  const [, stripIndex] = scopeData;
  return normalizeJsxEventName(jsxEvent.slice(stripIndex, jsxEvent.length - 1));
}

/**
 * Scan JSX attributes for passive:* directives and collect normalized event names.
 * Matches Rust's `collect_passive_event_names_from_jsx_attrs`.
 */
export function collectPassiveDirectives(
  attributes: PassiveDirectiveAttribute[],
): Set<string> {
  const passiveEvents = new Set<string>();

  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute') continue;

    const name = getJsxAttributeName(attr);

    if (!name || !isPassiveDirective(name)) continue;

    const rawEventName = name.slice('passive:'.length);
    passiveEvents.add(normalizeJsxEventName(rawEventName));
  }

  return passiveEvents;
}
