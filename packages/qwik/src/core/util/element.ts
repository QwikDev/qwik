import type { QwikElement, VirtualElement } from '../render/dom/virtual-element';

export const isNode = (value: any): value is Node => {
  return value && typeof value.nodeType === 'number';
};

export const isDocument = (value: Node): value is Document => {
  return value.nodeType === 9;
};

export const isElement = (value: Node | VirtualElement): value is Element => {
  return value.nodeType === 1;
};

export const isQwikElement = (value: Node | VirtualElement): value is QwikElement => {
  const nodeType = value.nodeType;
  return nodeType === 1 || nodeType === 111;
};

export const isNodeElement = (value: any): value is QwikElement => {
  const nodeType = value.nodeType;
  return nodeType === 1 || nodeType === 111 || nodeType === 3;
};

export const isVirtualElement = (value: Node | VirtualElement): value is VirtualElement => {
  return value.nodeType === 111;
};

export const isText = (value: Node | QwikElement): value is Text => {
  return value.nodeType === 3;
};

export const isComment = (value: Node | QwikElement): value is Comment => {
  return value.nodeType === 8;
};
