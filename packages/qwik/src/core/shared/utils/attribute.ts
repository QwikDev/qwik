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
