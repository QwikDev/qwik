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
  on = 'q-e:',
  onPassive = 'q-ep:',
  window = 'q-w:',
  windowPassive = 'q-wp:',
  document = 'q-d:',
  documentPassive = 'q-dp:',
}

export const EVENT_SUFFIX = '$';
export const DOM_CONTENT_LOADED_EVENT = 'DOMContentLoaded';

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
    name.charCodeAt(0) === 113 /* q */ &&
    name.charCodeAt(1) === 45 /* - */ &&
    (name.charCodeAt(3) === 58 /* : */ ||
      (name.charCodeAt(3) === 112 /* p */ && name.charCodeAt(4) === 58)) /* : */
  );
};

export function jsxEventToHtmlAttribute(jsxEvent: string, isPassive = false): string | null {
  if (jsxEvent.endsWith(EVENT_SUFFIX)) {
    const [prefix, idx] = getEventScopeDataFromJsxEvent(jsxEvent, isPassive);

    if (idx !== -1) {
      return prefix + normalizeJsxEventName(jsxEvent.slice(idx, -1));
    }
  }
  return null; // Return null if not matching expected format
}

export function createEventName(event: string, prefix = ''): string {
  const eventName = fromCamelToKebabCase(event);
  return prefix + eventName;
}

export function getEventScopeDataFromJsxEvent(
  eventName: string,
  isPassive = false
): [EventNameHtmlScope | undefined, number] {
  let prefix: EventNameHtmlScope | undefined;
  let idx = -1;
  // set prefix and idx based on the scope
  if (eventName.startsWith(EventNameJSXScope.on)) {
    prefix = isPassive ? EventNameHtmlScope.onPassive : EventNameHtmlScope.on;
    idx = 2;
  } else if (eventName.startsWith(EventNameJSXScope.window)) {
    prefix = isPassive ? EventNameHtmlScope.windowPassive : EventNameHtmlScope.window;
    idx = 9;
  } else if (eventName.startsWith(EventNameJSXScope.document)) {
    prefix = isPassive ? EventNameHtmlScope.documentPassive : EventNameHtmlScope.document;
    idx = 11;
  }
  return [prefix, idx];
}

export const normalizeJsxEventName = (name: string): string => {
  return name === DOM_CONTENT_LOADED_EVENT
    ? '-d-o-m-content-loaded'
    : createEventName(
        name.charAt(0) === '-'
          ? // marker for case sensitive event name
            name.slice(1)
          : name.toLowerCase()
      );
};

export const isDash = (charCode: number): boolean => charCode === 45; /* - */

export const getEventNameScopeFromJsxEvent = (name: string): string => {
  const index = name.indexOf(':');
  return index !== -1 ? name.substring(0, index) : '';
};

export function isPreventDefault(key: string): boolean {
  return key.startsWith('preventdefault:');
}

/** Converts a camelCase string to kebab-case. This is used for event names. */
export const fromCamelToKebabCase = (text: string): string => {
  return text.replace(/([A-Z-])/g, (a) => '-' + a.toLowerCase());
};

/** E.g. `"q-e:click"` => `['e', 'click']` */
export const getEventDataFromHtmlAttribute = (htmlKey: string): [string, string] => {
  const isPassive = htmlKey.charAt(3) === 'p';
  return [htmlKey.charAt(2), htmlKey.substring(isPassive ? 5 : 4)];
};

/** E.g. `"e:click"`, `"w:load"` */
export const getScopedEventName = (scope: string, eventName: string): string =>
  scope + ':' + eventName;
