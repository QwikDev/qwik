import { parseQRL } from '../import/qrl';
import { isQrl, QRLInternal } from '../import/qrl-class';
import { normalizeOnProp, QContext } from './props';
import { $ } from '../import/qrl.public';
import { QScopedStyle } from '../util/markers';
import { directGetAttribute } from '../render/fast-calls';
import { isArray } from '../util/types';
import { assertTrue } from '../assert/assert';

const ON_PROP_REGEX = /^(window:|document:|)on([A-Z]|-.).*\$$/;

export const isOnProp = (prop: string): boolean => {
  return ON_PROP_REGEX.test(prop);
};

export const addQRLListener = (ctx: QContext, prop: string, input: QRLInternal[]): boolean => {
  if (!ctx.$listeners$) {
    ctx.$listeners$ = new Map();
  }
  let existingListeners = ctx.$listeners$.get(prop);
  if (!existingListeners) {
    ctx.$listeners$.set(prop, (existingListeners = []));
  }
  start: for (const qrl of input) {
    const hash = qrl.$hash$;
    for (let i = 0; i < existingListeners.length; i++) {
      const qrl = existingListeners[i];
      if (qrl.$hash$ === hash) {
        existingListeners.splice(i, 1, qrl);
        continue start;
      }
    }
    existingListeners.push(qrl);
  }
  return false;
};

export const setEvent = (ctx: QContext, prop: string, input: any) => {
  assertTrue(prop.endsWith('$'), 'render: event property does not end with $', prop);
  const qrls = isArray(input) ? input.map(ensureQrl) : [ensureQrl(input)];
  addQRLListener(ctx, normalizeOnProp(prop.slice(0, -1)), qrls);
};

const ensureQrl = (value: any) => {
  return isQrl(value) ? value : ($(value) as QRLInternal);
};

export const getDomListeners = (el: Element): Map<string, QRLInternal[]> => {
  const attributes = el.attributes;
  const listeners: Map<string, QRLInternal[]> = new Map();
  for (let i = 0; i < attributes.length; i++) {
    const { name, value } = attributes.item(i)!;
    if (
      name.startsWith('on:') ||
      name.startsWith('on-window:') ||
      name.startsWith('on-document:')
    ) {
      let array = listeners.get(name);
      if (!array) {
        listeners.set(name, (array = []));
      }
      array.push(parseQRL(value, el));
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
