import { QwikElement, VirtualElement, VirtualElement2 } from '../render/dom/virtual-element';

export const isNode = (value: any): value is Node => {
  return value && typeof value.nodeType === 'number';
};
export const isDocument = (value: any): value is Document => {
  return value && value.nodeType === 9;
};
export const isElement = (value: Node | VirtualElement): value is Element => {
  return isNode(value) && value.nodeType === 1;
};

export const isQwikElement = (value: any): value is QwikElement => {
  return isNode(value) && (value.nodeType === 1 || value.nodeType === 111);
};

export const isVirtualElement = (value: any): value is VirtualElement => {
  return value instanceof VirtualElement2;
};

export const isText = (value: Node): value is Text => {
  return value.nodeType === 3;
};
export const isComment = (value: Node): value is Comment => {
  return value.nodeType === 9;
};
