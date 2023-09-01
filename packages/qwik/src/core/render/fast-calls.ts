import type { QwikElement } from './dom/virtual-element';

export const directSetAttribute = (el: QwikElement, prop: string, value: string) => {
  return el.setAttribute(prop, value);
};

export const directGetAttribute = (el: QwikElement, prop: string) => {
  return el.getAttribute(prop);
};

export const directRemoveAttribute = (el: QwikElement, prop: string) => {
  return el.removeAttribute(prop);
};
