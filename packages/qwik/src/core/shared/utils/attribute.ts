import { getAttributeNamespace } from '../../client/vnode-namespace';

let _setAttribute: typeof Element.prototype.setAttribute | null = null;

const fastSetAttribute = (target: Element, name: string, value: string): void => {
  if (!_setAttribute) {
    _setAttribute = target.setAttribute;
  }
  _setAttribute.call(target, name, value);
};

let _setAttributeNS: typeof Element.prototype.setAttributeNS | null = null;

const fastSetAttributeNS = (
  target: Element,
  namespace: string,
  name: string,
  value: string
): void => {
  if (!_setAttributeNS) {
    _setAttributeNS = target.setAttributeNS;
  }
  _setAttributeNS.call(target, namespace, name, value);
};

export function directSetAttribute(
  element: Element,
  attrName: string,
  attrValue: any,
  isSvg: boolean
): void {
  if (attrValue != null) {
    if (isSvg) {
      // only svg elements can have namespace attributes
      const namespace = getAttributeNamespace(attrName);
      if (namespace) {
        fastSetAttributeNS(element, namespace, attrName, attrValue);
        return;
      }
    }
    fastSetAttribute(element, attrName, attrValue);
  }
}

const isBooleanAttr = (element: Element, key: string): boolean => {
  const isBoolean =
    key == 'allowfullscreen' ||
    key == 'async' ||
    key == 'autofocus' ||
    key == 'autoplay' ||
    key == 'checked' ||
    key == 'controls' ||
    key == 'default' ||
    key == 'defer' ||
    key == 'disabled' ||
    key == 'formnovalidate' ||
    key == 'inert' ||
    key == 'ismap' ||
    key == 'itemscope' ||
    key == 'loop' ||
    key == 'multiple' ||
    key == 'muted' ||
    key == 'nomodule' ||
    key == 'novalidate' ||
    key == 'open' ||
    key == 'playsinline' ||
    key == 'readonly' ||
    key == 'required' ||
    key == 'reversed' ||
    key == 'selected';
  return isBoolean && key in element;
};

const parseBoolean = (value: string | boolean | null): boolean => {
  if (value === 'false') {
    return false;
  }
  return Boolean(value);
};

export const applyDomAttribute = (
  element: Element,
  attrName: string,
  attrValue: string | boolean | null,
  isSvg: boolean
): void => {
  if (isBooleanAttr(element, attrName)) {
    (element as any)[attrName] = parseBoolean(attrValue);
  } else if (attrValue == null || attrValue === false) {
    element.removeAttribute(attrName);
  } else if (attrName === 'value' && attrName in element) {
    (element as any).value = attrValue;
  } else {
    directSetAttribute(element, attrName, attrValue, isSvg);
  }
};
