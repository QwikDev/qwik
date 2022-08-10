import { parseQRL } from '../import/qrl';
import { isQrl, isSameQRL, QRLInternal } from '../import/qrl-class';
import type { QContext } from './props';
import { isArray } from '../util/types';
import { $ } from '../import/qrl.public';
import { QScopedStyle } from '../util/markers';

const ON_PROP_REGEX = /^(window:|document:|)on([A-Z]|-.).*\$$/;

export const isOnProp = (prop: string): boolean => {
  return ON_PROP_REGEX.test(prop);
};

export const addQRLListener = (
  ctx: QContext,
  prop: string,
  input: any
): QRLInternal<any>[] | undefined => {
  if (!input) {
    return undefined;
  }
  const value = isArray(input) ? input.map(ensureQrl) : ensureQrl(input);

  if (!ctx.$listeners$) {
    ctx.$listeners$ = new Map();
  }
  let existingListeners = ctx.$listeners$.get(prop);
  if (!existingListeners) {
    ctx.$listeners$.set(prop, (existingListeners = []));
  }
  const newQRLs = isArray(value) ? value : [value];
  for (const value of newQRLs) {
    const cp = value.$copy$();
    cp.$setContainer$(ctx.$element$);

    // Important we modify the array as it is cached.
    for (let i = 0; i < existingListeners.length; i++) {
      const qrl = existingListeners[i];
      if (isSameQRL(qrl as any, cp)) {
        existingListeners.splice(i, 1);
        i--;
      }
    }
    existingListeners.push(cp);
  }
  return existingListeners;
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
  const scoped = el.getAttribute(QScopedStyle);
  if (scoped) {
    return scoped.split(' ');
  }
  return [];
};
