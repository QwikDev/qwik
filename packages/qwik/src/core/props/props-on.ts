import { parseQRL } from '../import/qrl';
import { isQrl, QRLInternal } from '../import/qrl-class';
import { inflateQrl, normalizeOnProp, QContext } from './props';
import { $ } from '../import/qrl.public';
import { QScopedStyle } from '../util/markers';
import { directGetAttribute } from '../render/fast-calls';
import { isArray } from '../util/types';
import { assertTrue } from '../assert/assert';

const ON_PROP_REGEX = /^(on|window:|document:)/;

export const isOnProp = (prop: string): boolean => {
  return ON_PROP_REGEX.test(prop);
};

export const addQRLListener = (ctx: QContext, prop: string, input: QRLInternal[]): boolean => {
  if (!ctx.li) {
    ctx.li = new Map();
  }
  let existingListeners = ctx.li.get(prop);
  if (!existingListeners) {
    ctx.li.set(prop, (existingListeners = []));
  }
  for (const qrl of input) {
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

export const setEvent = (ctx: QContext, prop: string, input: any) => {
  assertTrue(prop.endsWith('$'), 'render: event property does not end with $', prop);
  const qrls = isArray(input) ? input.map(ensureQrl) : [ensureQrl(input)];
  prop = normalizeOnProp(prop.slice(0, -1));
  addQRLListener(ctx, prop, qrls);
  return prop;
};

const ensureQrl = (value: any) => {
  return isQrl(value) ? value : ($(value) as QRLInternal);
};

export const getDomListeners = (
  ctx: QContext,
  containerEl: Element
): Map<string, QRLInternal[]> => {
  const attributes = (ctx.$element$ as Element).attributes;
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
