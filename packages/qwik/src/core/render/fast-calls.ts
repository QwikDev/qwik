export const directSetAttribute = (el: Element, prop: string, value: string) => {
  return el.setAttribute(prop, value);
};

export const directGetAttribute = (el: Element, prop: string) => {
  return el.getAttribute(prop);
};
