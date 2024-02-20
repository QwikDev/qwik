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

export const isJsxPropertyAnEventName = (name: string): boolean => {
  return (
    (name.startsWith('on') || name.startsWith('window:on') || name.startsWith('document:on')) &&
    name.endsWith('$')
  );
};

export const isHtmlAttributeAnEventName = (name: string): boolean => {
  return name.startsWith('on:') || name.startsWith('on-window:') || name.startsWith('on-document:');
};

export const getEventNameFromJsxProp = (name: string): string | null => {
  if (name.endsWith('$')) {
    let idx = -1;
    if (name.startsWith('on')) {
      idx = 2;
    } else if (name.startsWith('window:on')) {
      idx = 9;
    } else if (name.startsWith('document:on')) {
      idx = 11;
    }
    if (idx != -1) {
      const isCaseSensitive = isDashAt(name, idx) && !isDashAt(name, idx + 1);
      if (isCaseSensitive) {
        idx++;
      }
      let lastIdx = idx;
      let eventName = '';
      while (true) {
        idx = name.indexOf('-', lastIdx);
        const chunk = name.substring(
          lastIdx,
          idx === -1 ? name.length - 1 /* don't include `$` */ : idx
        );
        eventName += isCaseSensitive ? chunk : chunk.toLowerCase();
        if (idx == -1) {
          return eventName;
        }
        if (isDashAt(name, idx + 1)) {
          eventName += '-';
          idx++;
        } else {
          eventName += name.charAt(idx + 1).toUpperCase();
          idx++;
        }
        lastIdx = idx + 1;
      }
    }
  }
  return null;
};

export const getEventNameScopeFromJsxProp = (name: string): string => {
  const index = name.indexOf(':');
  return index !== -1 ? name.substring(0, index) : '';
};

export const getEventNameFromHtmlAttr = (name: string): string | null => {
  let idx = -1;
  if (name.startsWith('on:')) {
    idx = 3; // 'on:'.length
  } else if (name.startsWith('on-window:')) {
    idx = 10; // 'on-window:'.length
  } else if (name.startsWith('on-document:')) {
    idx = 12; // 'on-document:'.length
  }
  if (idx != -1) {
    let lastIdx = idx;
    let eventName = '';
    while (true) {
      idx = name.indexOf('-', lastIdx);
      const chunk = name.substring(lastIdx, idx === -1 ? name.length : idx);
      eventName += chunk;
      if (idx == -1) {
        return eventName;
      }
      eventName += name.charAt(idx + 1).toUpperCase();
      idx++;
      lastIdx = idx + 1;
    }
  }
  return null;
};

const isDashAt = (name: string, idx: number): boolean => name.charCodeAt(idx) === 45; /* - */

export const convertEventNameFromHtmlAttrToJsxProp = (name: string): string | null => {
  let prefix: string | null = null;
  if (name.startsWith('on:')) {
    prefix = 'on';
  } else if (name.startsWith('on-window:')) {
    prefix = 'window:on';
  } else if (name.startsWith('on-document:')) {
    prefix = 'document:on';
  }
  if (prefix !== null) {
    const eventName = getEventNameFromHtmlAttr(name)!;
    let kabobCase = fromCamelToKebabCase(eventName);
    if (isDashAt(kabobCase, 0) && !isDashAt(kabobCase, 1)) {
      // special case for events which start with a `-`
      // if we would just append it would be interpreted as a case sensitive event
      kabobCase = '-' + kabobCase.charAt(1).toUpperCase() + kabobCase.substring(2);
    }
    return prefix + kabobCase + '$';
  }
  return null;
};

export const convertEventNameFromJsxPropToHtmlAttr = (name: string): string | null => {
  if (name.endsWith('$')) {
    let prefix: string | null = null;
    let idx = -1;
    if (name.startsWith('on')) {
      prefix = 'on:';
      idx = 2; // 'on'.length
    } else if (name.startsWith('window:on')) {
      prefix = 'on-window:';
      idx = 9; // 'window:on'.length
    } else if (name.startsWith('document:on')) {
      prefix = 'on-document:';
      idx = 11; // 'document:on'.length
    }
    if (prefix !== null) {
      const eventName = getEventNameFromJsxProp(name)!;
      return prefix + fromCamelToKebabCase(eventName);
    }
  }
  return null;
};

const fromCamelToKebabCase = (text: string): string => {
  return text.replace(/([A-Z-])/g, '-$1').toLowerCase();
};
