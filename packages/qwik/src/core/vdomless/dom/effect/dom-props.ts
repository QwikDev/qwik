import {
  EventNameHtmlScope,
  isHtmlAttributeAnEventName,
  jsxEventToHtmlAttribute,
  normalizeJsxEventName,
} from '../../../shared/utils/event-names';
import { escapeHTML } from '../../../shared/utils/character-escaping';
import { serializeAttribute } from '../../../shared/utils/styles';
import type { QElement } from '../../../shared/types';
import { setEvent } from '../event/event';

type DomProps = Record<string, unknown> | null | undefined;
type PropMap = Record<string, unknown>;
type PassiveMap = Record<string, true>;

const PASSIVE = 'passive:';
const PREVENT_DEFAULT = 'preventdefault:';
const STOP_PROPAGATION = 'stoppropagation:';

export function normalizeDomProps(props: DomProps): PropMap {
  return collectDomProps(props);
}

function collectDomProps(props: DomProps, element?: Element, styleScopedId?: string) {
  const normalized: PropMap = {};
  if (props == null) {
    return normalized;
  }

  let passiveEvents: PassiveMap | null = null;
  for (const key in props) {
    if (key === 'children' || key === 'ref' || key.startsWith('bind:')) {
      continue;
    }
    const value = props[key];
    if (key.startsWith(PASSIVE)) {
      if (value) {
        const eventKey = normalizeJsxEventName(key.slice(PASSIVE.length));
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
        removeDomPropFromMap(normalized, `${PREVENT_DEFAULT}${eventKey}`, element);
      }
      continue;
    }
    if (key.startsWith(PREVENT_DEFAULT)) {
      const eventKey = normalizeJsxEventName(key.slice(PREVENT_DEFAULT.length));
      if (passiveEvents?.[eventKey]) {
        continue;
      }
      setDomProp(normalized, `${PREVENT_DEFAULT}${eventKey}`, value, element);
      continue;
    }
    if (key.startsWith(STOP_PROPAGATION)) {
      setDomProp(
        normalized,
        `${STOP_PROPAGATION}${normalizeJsxEventName(key.slice(STOP_PROPAGATION.length))}`,
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

    const normalizedKey = key === 'className' ? 'class' : key;
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
        removeDomProp(element, key, key === 'class' ? styleScopedId : undefined);
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
    if (key === 'dangerouslySetInnerHTML') {
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
    if (attrValue === '') {
      attrs += ` ${key}`;
    } else {
      attrs += ` ${key}="${escapeHTML(attrValue)}"`;
    }
  }

  return { attrs, innerHTML };
}

function applyDomProp(element: Element, key: string, value: unknown, styleScopedId?: string): void {
  if (key === 'dangerouslySetInnerHTML') {
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

function removeDomProp(element: Element, key: string, styleScopedId?: string): void {
  if (key === 'dangerouslySetInnerHTML') {
    (element as Element & { innerHTML: string }).innerHTML = '';
  } else if (isHtmlAttributeAnEventName(key)) {
    removeEvent(element, key);
  } else if (key === 'class' && styleScopedId !== undefined) {
    patchAttrValue(element, key, '', styleScopedId);
  } else {
    element.removeAttribute?.(key);
  }
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
  return valueString === '' && (name === 'class' || name === 'style') ? null : valueString;
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
  if (name === 'class') {
    element.className = serialized;
  } else {
    element.setAttribute(name, serialized);
  }
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

function removeDomPropFromMap(props: PropMap, key: string, element: Element | undefined): void {
  if (key in props) {
    delete props[key];
    if (element !== undefined) {
      removeDomProp(element, key);
    }
  }
}

function moveDomProp(props: PropMap, from: string, to: string, element: Element | undefined): void {
  if (from in props) {
    const value = props[from];
    removeDomPropFromMap(props, from, element);
    setDomProp(props, to, value, element);
  }
}

function getPassiveEventKey(key: string): string | null {
  if (key.startsWith('on') && key.endsWith('$')) {
    return normalizeJsxEventName(key.slice(2, -1));
  }
  if (key.startsWith('window:on') && key.endsWith('$')) {
    return normalizeJsxEventName(key.slice(9, -1));
  }
  if (key.startsWith('document:on') && key.endsWith('$')) {
    return normalizeJsxEventName(key.slice(11, -1));
  }
  return null;
}
