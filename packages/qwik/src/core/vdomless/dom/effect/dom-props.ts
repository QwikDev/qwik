import {
  EventNameHtmlScope,
  EventNameJSXScope,
  isHtmlAttributeAnEventName,
  jsxEventToHtmlAttribute,
  normalizeJsxEventName,
} from '../../../shared/utils/event-names';
import { escapeHTML } from '../../../shared/utils/character-escaping';
import { serializeAttribute } from '../../../shared/utils/styles';
import type { QElement } from '../../../shared/types';
import { setEvent } from '../event/event';
import {
  BindEventPrefix,
  ClassAttr,
  ClassNameAttr,
  DangerousInnerHTMLAttr,
  EMPTY_STRING,
  EventSuffix,
  PassiveEventPrefix,
  PreventDefaultEventPrefix,
  StopPropagationEventPrefix,
  StyleAttr,
} from '../../utils/consts';

type DomProps = Record<string, unknown> | null | undefined;
type PropMap = Record<string, unknown>;
type PassiveMap = Record<string, true>;

function collectDomProps(props: DomProps, element?: Element, styleScopedId?: string) {
  const normalized: PropMap = {};
  if (props == null) {
    return normalized;
  }

  let passiveEvents: PassiveMap | null = null;
  for (const key in props) {
    if (key === 'children' || key === 'ref' || key.startsWith(BindEventPrefix)) {
      continue;
    }
    const value = props[key];
    if (key.startsWith(PassiveEventPrefix)) {
      if (value) {
        const eventKey = normalizeJsxEventName(key.slice(PassiveEventPrefix.length));
        passiveEvents ||= {};
        passiveEvents[eventKey] = true;
        moveDomProp(
          normalized,
          `${EventNameHtmlScope.on}${eventKey}`,
          `${EventNameHtmlScope.onPassive}${eventKey}`,
          element
        );
        moveDomProp(
          normalized,
          `${EventNameHtmlScope.window}${eventKey}`,
          `${EventNameHtmlScope.windowPassive}${eventKey}`,
          element
        );
        moveDomProp(
          normalized,
          `${EventNameHtmlScope.document}${eventKey}`,
          `${EventNameHtmlScope.documentPassive}${eventKey}`,
          element
        );
        clearDomPropFromMap(normalized, `${PreventDefaultEventPrefix}${eventKey}`, element);
      }
      continue;
    }
    if (key.startsWith(PreventDefaultEventPrefix)) {
      const eventKey = normalizeJsxEventName(key.slice(PreventDefaultEventPrefix.length));
      if (passiveEvents?.[eventKey]) {
        continue;
      }
      setDomProp(normalized, `${PreventDefaultEventPrefix}${eventKey}`, value, element);
      continue;
    }
    if (key.startsWith(StopPropagationEventPrefix)) {
      setDomProp(
        normalized,
        `${StopPropagationEventPrefix}${normalizeJsxEventName(key.slice(StopPropagationEventPrefix.length))}`,
        value,
        element
      );
      continue;
    }

    const eventKey = getPassiveEventKey(key);
    if (eventKey !== null) {
      const attr = jsxEventToHtmlAttribute(key, passiveEvents?.[eventKey] === true);
      if (attr !== null) {
        setDomProp(normalized, attr, value, element);
      }
      continue;
    }

    const normalizedKey = key === ClassNameAttr ? ClassAttr : key;
    setDomProp(normalized, normalizedKey, value, element, styleScopedId);
  }
  return normalized;
}

export function applyDomProps(
  element: Element,
  props: DomProps,
  prevProps: Record<string, unknown> | null = null,
  styleScopedId?: string
): Record<string, unknown> {
  const nextProps = collectDomProps(props, element, styleScopedId);
  if (prevProps !== null) {
    for (const key in prevProps) {
      if (!(key in nextProps)) {
        applyDomProp(element, key, null, styleScopedId);
      }
    }
  }
  return nextProps;
}

export function renderDomPropsToString(
  props: DomProps,
  eventAttr?: (name: string, value: unknown) => string,
  styleScopedId?: string
) {
  const normalized = collectDomProps(props, undefined, styleScopedId);
  let attrs = '';
  let innerHTML: string | null = null;

  for (const key in normalized) {
    const value = normalized[key];
    if (key === DangerousInnerHTMLAttr) {
      innerHTML = value == null || value === false ? '' : String(value);
      continue;
    }
    if (isHtmlAttributeAnEventName(key)) {
      if (value != null && value !== false && eventAttr) {
        attrs += eventAttr(key, value);
      }
      continue;
    }

    const attrValue = serializeAttrExpressionValue(key, value, styleScopedId);
    if (attrValue === null) {
      continue;
    }
    if (Object.is(attrValue, EMPTY_STRING)) {
      attrs += ` ${key}`;
    } else {
      attrs += ` ${key}="${escapeHTML(attrValue)}"`;
    }
  }

  return { attrs, innerHTML };
}

function applyDomProp(element: Element, key: string, value: unknown, styleScopedId?: string): void {
  if (key === DangerousInnerHTMLAttr) {
    (element as Element & { innerHTML: string }).innerHTML =
      value == null || value === false ? '' : String(value);
    return;
  }
  if (isHtmlAttributeAnEventName(key)) {
    if (value == null || value === false) {
      removeEvent(element, key);
    } else {
      setEvent(element, key, value as (event: Event, element: Element) => unknown);
    }
    return;
  }

  patchAttrValue(element, key, value, styleScopedId);
}

function removeEvent(element: Element, key: string): void {
  const scopedKebabName = key.slice(2);
  const target = element as QElement;
  if (target._qDispatch) {
    delete target._qDispatch[scopedKebabName];
  }
  if (key.charAt(2) !== 'e') {
    element.removeAttribute?.(key);
  }
}

function setDomProp(
  props: PropMap,
  key: string,
  value: unknown,
  element: Element | undefined,
  styleScopedId?: string
): void {
  props[key] = value;
  if (element !== undefined) {
    applyDomProp(element, key, value, styleScopedId);
  }
}

function clearDomPropFromMap(props: PropMap, key: string, element: Element | undefined): void {
  if (key in props) {
    delete props[key];
    if (element !== undefined) {
      applyDomProp(element, key, null);
    }
  }
}

function moveDomProp(props: PropMap, from: string, to: string, element: Element | undefined): void {
  if (from in props) {
    const value = props[from];
    clearDomPropFromMap(props, from, element);
    setDomProp(props, to, value, element);
  }
}

function getPassiveEventKey(key: string): string | null {
  if (key.startsWith(EventNameJSXScope.on) && key.endsWith(EventSuffix)) {
    return normalizeJsxEventName(key.slice(2, -1));
  }
  if (key.startsWith(EventNameJSXScope.window) && key.endsWith(EventSuffix)) {
    return normalizeJsxEventName(key.slice(9, -1));
  }
  if (key.startsWith(EventNameJSXScope.document) && key.endsWith(EventSuffix)) {
    return normalizeJsxEventName(key.slice(11, -1));
  }
  return null;
}

export function serializeAttrExpressionValue(
  name: string,
  value: unknown,
  styleScopedId?: string
): string | null {
  const serialized = serializeAttribute(name, value, styleScopedId);
  if (serialized == null || serialized === false) {
    return null;
  }
  if (serialized === true) {
    return '';
  }
  const valueString = String(serialized);
  return valueString === '' && (name === ClassAttr || name === StyleAttr) ? null : valueString;
}

export function patchAttrValue(
  element: Element,
  name: string,
  value: unknown,
  styleScopedId?: string
): void {
  const serialized = serializeAttrExpressionValue(name, value, styleScopedId);
  if (serialized === null) {
    element.removeAttribute?.(name);
    return;
  }
  if (name === ClassAttr) {
    element.className = serialized;
  } else {
    element.setAttribute(name, serialized);
  }
}
