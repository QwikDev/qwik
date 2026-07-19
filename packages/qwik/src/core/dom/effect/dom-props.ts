import {
  EventNameHtmlScope,
  EventNameJSXScope,
  isHtmlAttributeAnEventName,
  jsxEventToHtmlAttribute,
  normalizeJsxEventName,
} from '../../shared/utils/event-names';
import { escapeHTML } from '../../shared/utils/character-escaping';
import { isPromise } from '../../shared/utils/promises';
import { serializeAttribute } from '../../shared/utils/styles';
import { inlinedQrl } from '../../shared/qrl/qrl';
import { _chk, _val } from '../../runtime/bind-handlers';
import type { QElement } from '../../shared/types';
import type { SsrEventAttrChunk, SsrRecordPart } from '../../ssr/output';
import { setEvent } from '../event/event';
import { commitDomPromise } from './dom-subscription';
import {
  CheckedAttr,
  ClassAttr,
  ClassNameAttr,
  DangerousInnerHTMLAttr,
  EMPTY_STRING,
  EventSuffix,
  PassiveEventPrefix,
  PreventDefaultEventPrefix,
  RefAttr,
  StopPropagationEventPrefix,
  StyleAttr,
  ValueAttr,
} from '../../utils/consts';

type DomProps = Record<string, unknown> | null | undefined;
type PropMap = Record<string, unknown>;
type PassiveMap = Record<string, true>;

const BindValue = 'bind:value';
const BindChecked = 'bind:checked';
const InputEvent = 'q-e:input';

function collectDomProps(
  props: DomProps,
  element?: Element,
  styleScopedId?: string,
  prevProps: PropMap | null = null
) {
  const normalized: PropMap = {};
  if (props == null) {
    return normalized;
  }

  let passiveEvents: PassiveMap | null = null;
  let bindValue: any = null;
  let bindChecked: any = null;
  for (const key in props) {
    if (key === 'children') {
      continue;
    }
    const value = props[key];
    if (key === RefAttr) {
      normalized[RefAttr] = value;
      if (element !== undefined && (prevProps === null || value !== prevProps[RefAttr])) {
        setRef(value, element);
      }
      continue;
    }
    if (key === BindChecked) {
      bindChecked = value;
      continue;
    }
    if (key === BindValue) {
      bindValue = value;
      continue;
    }
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
  const binding = bindChecked || bindValue;
  if (binding) {
    const checked = !!bindChecked;
    setDomProp(
      normalized,
      checked ? CheckedAttr : ValueAttr,
      binding.value,
      element,
      styleScopedId
    );
    const handler = inlinedQrl(checked ? _chk : _val, checked ? '_chk' : '_val', [binding]);
    const existing = normalized[InputEvent];
    setDomProp(
      normalized,
      InputEvent,
      existing ? (Array.isArray(existing) ? [...existing, handler] : [existing, handler]) : handler,
      element
    );
  }
  return normalized;
}

export function applyDomProps(
  element: Element,
  props: DomProps,
  prevProps: Record<string, unknown> | null = null,
  styleScopedId?: string
): Record<string, unknown> {
  const nextProps = collectDomProps(props, element, styleScopedId, prevProps);
  if (prevProps !== null) {
    for (const key in prevProps) {
      if (key !== RefAttr && !(key in nextProps)) {
        applyDomProp(element, key, null, styleScopedId);
      }
    }
  }
  return nextProps;
}

export function renderDomPropsToString(
  props: DomProps,
  eventAttr?: (name: string, value: unknown) => SsrEventAttrChunk,
  styleScopedId?: string
): { attrs: SsrRecordPart[]; innerHTML: string | null; ref?: unknown } {
  const normalized = collectDomProps(props, undefined, styleScopedId);
  const attrs: SsrRecordPart[] = [];
  let innerHTML: string | null = null;
  let ref: unknown;

  for (const key in normalized) {
    const value = normalized[key];
    if (key === RefAttr) {
      ref = value;
      continue;
    }
    if (key === DangerousInnerHTMLAttr) {
      innerHTML = value == null || value === false ? '' : String(value);
      continue;
    }
    if (isHtmlAttributeAnEventName(key)) {
      if (value != null && value !== false && eventAttr) {
        appendSsrAttrPart(attrs, eventAttr(key, value));
      }
      continue;
    }

    const attrValue = serializeAttrExpressionValue(key, value, styleScopedId);
    if (attrValue === null) {
      continue;
    }
    if (Object.is(attrValue, EMPTY_STRING)) {
      appendSsrAttrPart(attrs, ` ${key}`);
    } else {
      appendSsrAttrPart(attrs, ` ${key}="${escapeHTML(attrValue)}"`);
    }
  }

  const output: { attrs: SsrRecordPart[]; innerHTML: string | null; ref?: unknown } = {
    attrs,
    innerHTML,
  };
  if (ref !== undefined) {
    output.ref = ref;
  }
  return output;
}

export function setRef(value: unknown, element: Element): void {
  if (typeof value === 'function') {
    value(element);
  } else if (value != null) {
    (value as { value: Element }).value = element;
  }
}

function appendSsrAttrPart(attrs: SsrRecordPart[], part: SsrRecordPart): void {
  const last = attrs.length - 1;
  if (typeof part === 'string' && typeof attrs[last] === 'string') {
    attrs[last] += part;
  } else {
    attrs.push(part);
  }
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
  if (isPromise(value)) {
    throw new Error(
      `Promise values are not supported for scalar JSX attribute or component prop "${name}".`
    );
  }
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
): void | Promise<void> {
  if (isPromise(value)) {
    return commitDomPromise(value, (resolved) => {
      patchAttrValue(element, name, resolved, styleScopedId);
    });
  }
  if (name === ClassAttr) {
    const serialized = serializeAttrExpressionValue(name, value, styleScopedId);
    if (serialized === null) {
      element.removeAttribute?.(name);
    } else {
      element.className = serialized;
    }
    return;
  }
  if (name === ValueAttr && name in element) {
    (element as Element & { value: string }).value =
      serializeAttrExpressionValue(name, value) ?? '';
    return;
  }
  if (name === CheckedAttr && name in element) {
    (element as Element & { checked: boolean }).checked = !!value;
    return;
  }
  const serialized = serializeAttrExpressionValue(name, value, styleScopedId);
  if (serialized === null) {
    element.removeAttribute?.(name);
  } else {
    element.setAttribute(name, serialized);
  }
}
