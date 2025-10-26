/**
 * Think of `-` as an escape character which makes the next character uppercase. `--` is just `-`.
 *
 * Rules for JSX property event names starting with `on`:
 *
 * - Are case insensitive: `onClick$` is same `onclick$`
 * - A `--` is `-`: `dbl--click` => `dbl-click`
 * - Become case sensitive if prefixed by `-`: `-Click` is `Click`
 * - A `-` (not at the beginning) makes next character uppercase: `dbl-click` => `dblClick`
 */

export const enum EventNameJSXScope {
  on = 'on',
  window = 'window:on',
  document = 'document:on',
}

export const enum EventNameHtmlScope {
  on = 'on:',
  window = 'on-window:',
  document = 'on-document:',
}

export const EVENT_SUFFIX = '$';

export const isJsxPropertyAnEventName = (name: string): boolean => {
  return (
    name.endsWith(EVENT_SUFFIX) &&
    (name.startsWith(EventNameJSXScope.on) ||
      name.startsWith(EventNameJSXScope.window) ||
      name.startsWith(EventNameJSXScope.document))
  );
};

export const isHtmlAttributeAnEventName = (name: string): boolean => {
  return (
    name.startsWith(EventNameHtmlScope.on) ||
    name.startsWith(EventNameHtmlScope.window) ||
    name.startsWith(EventNameHtmlScope.document)
  );
};

/**
 * Converts a JSX event property to an HTML attribute. Examples:
 *
 * - OnClick$ -> on:click
 * - On-DOMContentLoaded$ -> on:-d-o-m-content-loaded
 * - On-CustomEvent$ -> on:-custom-event
 */
export function jsxEventToHtmlAttribute(jsxEvent: string): string | null {
  if (jsxEvent.endsWith(EVENT_SUFFIX)) {
    const [prefix, idx] = getEventScopeDataFromJsxEvent(jsxEvent);

    if (idx !== -1) {
      const eventName = jsxEventToEventName(jsxEvent, idx);
      return prefix + fromCamelToKebabCase(eventName);
    }
  }
  return null; // Return null if not matching expected format
}

function jsxEventToEventName(jsxEvent: string, startIdx: number = 0): string {
  const chunk = jsxEvent.substring(startIdx, jsxEvent.length - 1 /* don't include `$` */);
  if (chunk === 'DOMContentLoaded') {
    return '-d-o-m-content-loaded';
  }
  return chunk.toLowerCase();
}

export function getEventScopeDataFromJsxEvent(eventName: string): [string | null, number] {
  let prefix: EventNameHtmlScope | null = null;
  let idx = -1;
  // set prefix and idx based on the scope
  if (eventName.startsWith(EventNameJSXScope.on)) {
    prefix = EventNameHtmlScope.on;
    idx = 2;
  } else if (eventName.startsWith(EventNameJSXScope.window)) {
    prefix = EventNameHtmlScope.window;
    idx = 9;
  } else if (eventName.startsWith(EventNameJSXScope.document)) {
    prefix = EventNameHtmlScope.document;
    idx = 11;
  }
  return [prefix, idx];
}

export const isDash = (charCode: number): boolean => charCode === 45; /* - */

export const getEventNameScopeFromJsxEvent = (name: string): string => {
  const index = name.indexOf(':');
  return index !== -1 ? name.substring(0, index) : '';
};

export function isPreventDefault(key: string): boolean {
  return key.startsWith('preventdefault:');
}

/**
 * Converts a camelCase string to kebab-case. This is used for event names.
 *
 * However, we do not escape `-` characters that are already present in the string. This means that
 * both `dbl-click` and `dblClick` will convert to `dbl-click`. This is intentional, it means that
 * `onCustom-Event$` works for both `custom-event` and `customEvent`.
 */
export const fromCamelToKebabCase = (text: string): string => {
  return text.replace(/([A-Z])/g, '-$1').toLowerCase();
};

export const getEventDataFromHtmlAttribute = (htmlKey: string): [string, string] | null => {
  if (htmlKey.startsWith('on:')) {
    return ['', htmlKey.substring(3)];
  }
  if (htmlKey.startsWith('on-window:')) {
    return ['window', htmlKey.substring(11)];
  }
  return ['document', htmlKey.substring(13)];
};
