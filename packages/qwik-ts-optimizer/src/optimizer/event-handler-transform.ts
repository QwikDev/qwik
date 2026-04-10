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
 *
 * Algorithm matched to Rust optimizer:
 * - get_event_scope_data_from_jsx_event -> scope prefix + index
 * - normalize_jsx_event_name -> lowercase (or strip dash for custom), then create_event_name
 * - create_event_name -> for each char: uppercase/dash -> push '-' + lowercase
 *
 * Verified against snapshot corpus:
 * - should_convert_jsx_events.snap
 * - example_jsx_listeners.snap
 * - should_convert_passive_jsx_events.snap
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventTransformResult {
  outputPropName: string;
  isHtmlOnly: boolean;
  stripPassive: string[];
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

/**
 * Check if a JSX prop name is an event handler prop that will be transformed.
 *
 * Returns true for props that start with `on` (with optional `document:`/`window:`/`host:` prefix)
 * and end with `$`. Does NOT match non-event `$` props like `custom$` or `transparent$`.
 */
export function isEventProp(propName: string): boolean {
  if (!propName.endsWith('$')) return false;

  // Check for scope prefixes
  if (propName.startsWith('document:on')) return true;
  if (propName.startsWith('window:on')) return true;
  if (propName.startsWith('host:on')) return true;

  // Check for on* or on-* pattern (on followed by uppercase or dash)
  if (propName.startsWith('on') && propName.length > 3) {
    const afterOn = propName[2];
    if (afterOn === '-' || (afterOn >= 'A' && afterOn <= 'Z')) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a prop name is a passive event directive (passive:*).
 */
export function isPassiveDirective(propName: string): boolean {
  return propName.startsWith('passive:');
}

// ---------------------------------------------------------------------------
// Core naming functions (matching Rust optimizer exactly)
// ---------------------------------------------------------------------------

/**
 * Convert a processed event name by replacing uppercase chars and dashes
 * with dash + lowercased char. Matches Rust's `create_event_name`.
 *
 * For each char: if uppercase or `-`, push `-` then push lowercased char.
 * This means existing dashes become double dashes in the output.
 */
function createEventName(name: string): string {
  let result = '';
  for (const c of name) {
    if ((c >= 'A' && c <= 'Z') || c === '-') {
      result += '-';
      result += c.toLowerCase();
    } else {
      result += c;
    }
  }
  return result;
}

/**
 * Normalize a JSX event name segment (after scope prefix and `on` are stripped).
 * Matches Rust's `normalize_jsx_event_name`.
 *
 * - If starts with `-` (custom event marker): strip the dash, keep casing, then createEventName
 * - Otherwise: lowercase everything first, then createEventName
 */
function normalizeJsxEventName(name: string): string {
  if (name === 'DOMContentLoaded') {
    return '-d-o-m-content-loaded';
  }

  let processedName: string;
  if (name.startsWith('-')) {
    // Custom event: strip leading dash, preserve case
    processedName = name.slice(1);
  } else {
    // Standard event: lowercase everything first
    processedName = name.toLowerCase();
  }

  return createEventName(processedName);
}

/**
 * Convert camelCase string to kebab-case.
 * Public helper for external use.
 */
export function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (match, offset) => {
    return (offset > 0 ? '-' : '') + match.toLowerCase();
  });
}

// ---------------------------------------------------------------------------
// Main transformation
// ---------------------------------------------------------------------------

/**
 * Get the scope prefix and strip-index from a JSX event prop name.
 * Matches Rust's `get_event_scope_data_from_jsx_event`.
 *
 * Returns [prefix, stripIndex] or null if not an event prop.
 */
function getEventScopeData(
  propName: string,
  isPassive: boolean
): [string, number] | null {
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
 *
 * Matches Rust's `jsx_event_to_html_attribute`.
 */
export function transformEventPropName(
  propName: string,
  passiveEvents: Set<string>
): string | null {
  if (!propName.endsWith('$')) return null;

  // host: prefix -> passthrough
  if (propName.startsWith('host:')) return null;

  // Check if this is a recognized event pattern
  // First determine if it's passive (by checking the event name against passiveEvents)
  const nonPassiveData = getEventScopeData(propName, false);
  if (!nonPassiveData) return null;

  const [, stripIdx] = nonPassiveData;
  // Extract the name between the scope prefix and the trailing $
  const eventNameRaw = propName.slice(stripIdx, propName.length - 1);
  const normalizedName = normalizeJsxEventName(eventNameRaw);

  // Determine the "plain" event name for passive lookup
  // (the normalized name without any prefix modifications)
  // For passive lookup, we need the event name as it appears in passive:xxx directives
  // which is already in lowercase form (e.g., "click", "scroll", "touchstart")
  const isPassive = passiveEvents.has(normalizedName);

  const [prefix] = getEventScopeData(propName, isPassive)!;

  return prefix + normalizedName;
}

/**
 * Convert a JSX event name to its plain event name for use in matching.
 * Used for display name generation and event name extraction.
 * Matches Rust's `jsx_event_to_event_name`.
 */
export function jsxEventToEventName(jsxEvent: string): string | null {
  if (!jsxEvent.endsWith('$')) return null;

  const data = getEventScopeData(jsxEvent, false);
  if (!data) return null;

  const [, stripIdx] = data;
  return normalizeJsxEventName(jsxEvent.slice(stripIdx, jsxEvent.length - 1));
}

// ---------------------------------------------------------------------------
// Passive directive collection
// ---------------------------------------------------------------------------

/**
 * Scan JSX attributes for passive:* directives and collect normalized event names.
 *
 * The passive event names go through the same normalization as regular event names.
 * Matches Rust's `collect_passive_event_names_from_jsx_attrs` + `passive_attr_to_event_name`.
 */
export function collectPassiveDirectives(attributes: any[]): Set<string> {
  const passiveEvents = new Set<string>();

  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute') continue;

    const name =
      attr.name?.type === 'JSXIdentifier'
        ? attr.name.name
        : attr.name?.type === 'JSXNamespacedName'
          ? `${attr.name.namespace.name}:${attr.name.name.name}`
          : null;

    if (name && isPassiveDirective(name)) {
      const rawEventName = name.slice('passive:'.length);
      // Passive event names go through normalization too
      passiveEvents.add(normalizeJsxEventName(rawEventName));
    }
  }

  return passiveEvents;
}
