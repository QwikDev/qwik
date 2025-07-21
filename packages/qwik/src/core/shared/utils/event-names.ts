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

const enum EventNameHtmlScope {
  on = 'on:',
  window = 'on-window:',
  document = 'on-document:',
}

export const EVENT_SUFFIX = '$';
export const DOMContentLoadedEvent = 'DOMContentLoaded';

export const isJsxPropertyAnEventName = (name: string): boolean => {
  return (
    (name.startsWith(EventNameJSXScope.on) ||
      name.startsWith(EventNameJSXScope.window) ||
      name.startsWith(EventNameJSXScope.document)) &&
    name.endsWith(EVENT_SUFFIX)
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
      const eventName = getEventNameFromJsxEvent(jsxEvent)!;
      return prefix + fromCamelToKebabCase(eventName);
    }
  }
  return null; // Return null if not matching expected format
}

/**
 * Converts an HTML attribute back to JSX event property. Examples:
 *
 * - On:click -> onClick$
 * - On:-d-o-m-content-loaded -> onDOMContentLoaded$
 * - On:-custom-event -> on-CustomEvent$
 */
export function htmlAttributeToJsxEvent(htmlAttr: string): string | null {
  const eventScopeData = getEventScopeDataFromHtmlEvent(htmlAttr);
  let prefix = eventScopeData[0];
  const idx = eventScopeData[1];

  if (idx !== -1) {
    const isCaseSensitive = isDash(htmlAttr.charCodeAt(idx));
    const eventName = htmlAttrToEventName(htmlAttr, idx);
    if (isCaseSensitive && eventName !== DOMContentLoadedEvent) {
      prefix += '-'; // Add hyphen at the start if case-sensitive
    }
    return eventNameToJsxEvent(eventName, prefix);
  }
  return null; // Return null if not matching expected format
}

export function eventNameToJsxEvent(eventName: string, prefix: string | null) {
  eventName = eventName.charAt(0).toUpperCase() + eventName.substring(1);
  return prefix + eventName + EVENT_SUFFIX;
}

/**
 * Gets the event name from a JSX event property. Examples:
 *
 * - OnClick$ -> click
 * - OnDOMContentLoaded$ -> DOMContentLoaded
 * - On-CustomEvent$ -> CustomEvent
 */
export function getEventNameFromJsxEvent(jsxEvent: string): string | null {
  if (jsxEvent.endsWith(EVENT_SUFFIX)) {
    const [, idx] = getEventScopeDataFromJsxEvent(jsxEvent);
    if (idx != -1) {
      return jsxEventToEventName(jsxEvent, idx);
    }
  }
  return null;
}

function jsxEventToEventName(jsxEvent: string, startIdx: number = 0): string {
  const idx = startIdx;
  let lastIdx = idx;
  const isCaseSensitive = isDash(jsxEvent.charCodeAt(idx));
  if (isCaseSensitive) {
    lastIdx++;
  }
  let eventName = '';
  const chunk = jsxEvent.substring(lastIdx, jsxEvent.length - 1 /* don't include `$` */);
  if (chunk === DOMContentLoadedEvent) {
    return DOMContentLoadedEvent;
  }
  eventName += isCaseSensitive ? chunk : chunk.toLowerCase();
  return eventName;
}

/**
 * Gets the event name from an HTML attribute. Examples:
 *
 * - On:click -> click
 * - On:-d-o-m-content-loaded -> DOMContentLoaded
 * - On:-custom-event -> CustomEvent
 */
export function getEventNameFromHtmlAttribute(htmlAttr: string): string {
  const [, idx] = getEventScopeDataFromHtmlEvent(htmlAttr);
  if (idx !== -1) {
    return htmlAttrToEventName(htmlAttr, idx);
  }
  return htmlAttr; // Return as is if not matching expected format
}

/** Helper function to convert HTML attribute name to event name. */
function htmlAttrToEventName(htmlAttr: string, startIdx: number = 0): string {
  let idx = startIdx;
  let lastIdx = idx;
  let eventName = '';
  const isCaseSensitive = isDash(htmlAttr.charCodeAt(lastIdx));
  if (isCaseSensitive) {
    lastIdx++; // Skip the hyphen
    eventName += htmlAttr.charAt(lastIdx).toUpperCase(); // Capitalize the first letter
    lastIdx++; // Skip the first letter
  }

  while (true as boolean) {
    idx = htmlAttr.indexOf('-', lastIdx); // Find the next hyphen
    const chunk = htmlAttr.substring(lastIdx, idx === -1 ? htmlAttr.length : idx); // Get the chunk
    eventName += chunk; // Add the chunk to the event name
    if (idx == -1) {
      return eventName; // Return the event name if no more hyphens
    }
    idx++; // Move to the next character after the hyphen
    eventName += htmlAttr.charAt(idx).toUpperCase(); // Capitalize the next letter if previous character is hyphen
    lastIdx = idx + 1; // Move to the next character
  }
  return eventName;
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

function getEventScopeDataFromHtmlEvent(htmlAttr: string): [string | null, number] {
  let prefix: EventNameJSXScope | null = null;
  let idx = -1;
  if (htmlAttr.startsWith(EventNameHtmlScope.on)) {
    prefix = EventNameJSXScope.on;
    idx = 3;
  } else if (htmlAttr.startsWith(EventNameHtmlScope.window)) {
    prefix = EventNameJSXScope.window;
    idx = 10;
  } else if (htmlAttr.startsWith(EventNameHtmlScope.document)) {
    prefix = EventNameJSXScope.document;
    idx = 12;
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

export const fromCamelToKebabCase = (text: string): string => {
  return text.replace(/([A-Z-])/g, '-$1').toLowerCase();
};
