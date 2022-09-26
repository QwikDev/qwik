import { parseQRL } from '../import/qrl';
import { assertQrl, isQrl, QRLInternal } from '../import/qrl-class';
import { inflateQrl, normalizeOnProp, QContext } from './props';
import { $ } from '../import/qrl.public';
import { QScopedStyle } from '../util/markers';
import { directGetAttribute } from '../render/fast-calls';
import { isArray } from '../util/types';
import { assertTrue } from '../assert/assert';
import { qRuntimeQrl, qSerialize } from '../util/qdev';

const ON_PROP_REGEX = /^(on|window:|document:)/;

export const isOnProp = (prop: string): boolean => {
  return prop.endsWith('$') && ON_PROP_REGEX.test(prop);
};

export const addQRLListener = (
  listenersMap: Record<string, QRLInternal<any>[]>,
  prop: string,
  input: QRLInternal[]
): boolean => {
  let existingListeners = listenersMap[prop];
  if (!existingListeners) {
    listenersMap[prop] = existingListeners = [];
  }
  for (const qrl of input) {
    assertQrl(qrl);
    const hash = qrl.$hash$;
    let replaced = false;
    for (let i = 0; i < existingListeners.length; i++) {
      const existing = existingListeners[i];
      if (existing.$hash$ === hash) {
        existingListeners.splice(i, 1, qrl);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      existingListeners.push(qrl);
    }
  }
  return false;
};

export const setEvent = (
  listenerMap: Record<string, QRLInternal[]>,
  prop: string,
  input: any,
  containerEl: Element | undefined
) => {
  assertTrue(prop.endsWith('$'), 'render: event property does not end with $', prop);
  const qrls = isArray(input) ? input : [ensureQrl(input, containerEl)];
  prop = normalizeOnProp(prop.slice(0, -1));
  addQRLListener(listenerMap, prop, qrls);
  return prop;
};

const ensureQrl = (value: any, containerEl: Element | undefined) => {
  if (qSerialize && !qRuntimeQrl) {
    assertQrl(value);
    value.$setContainer$(containerEl);
    return value;
  }
  const qrl = isQrl(value) ? value : ($(value) as QRLInternal);
  qrl.$setContainer$(containerEl);
  return qrl;
};

export const getDomListeners = (
  ctx: QContext,
  containerEl: Element
): Record<string, QRLInternal[]> => {
  const attributes = (ctx.$element$ as Element).attributes;
  const listeners: Record<string, QRLInternal[]> = {};
  for (let i = 0; i < attributes.length; i++) {
    const { name, value } = attributes.item(i)!;
    if (
      name.startsWith('on:') ||
      name.startsWith('on-window:') ||
      name.startsWith('on-document:')
    ) {
      let array = listeners[name];
      if (!array) {
        listeners[name] = array = [];
      }
      const urls = value.split('\n');
      for (const url of urls) {
        const qrl = parseQRL(url, containerEl);
        if (qrl.$capture$) {
          inflateQrl(qrl, ctx);
        }
        array.push(qrl);
      }
    }
  }
  return listeners;
};

export const getScopeIds = (el: Element): string[] => {
  const scoped = directGetAttribute(el, QScopedStyle);
  if (scoped) {
    return scoped.split(' ');
  }
  return [];
};
