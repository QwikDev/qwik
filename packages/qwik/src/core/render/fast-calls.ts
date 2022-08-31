import type { QwikElement } from './dom/virtual-element';

export const directSetAttribute = (el: QwikElement, prop: string, value: string) => {
  return el.setAttribute(prop, value);
};

export const directGetAttribute = (el: QwikElement, prop: string) => {
  console.warn('DOM READ: directGetAttribute()', el, prop);
  return el.getAttribute(prop);
};
