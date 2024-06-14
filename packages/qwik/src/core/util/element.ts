import type { QwikElement, VirtualElement } from '../render/dom/virtual-element';

export const isNode = (value: any): value is Node => {
  return value && typeof value.nodeType === 'number';
};

export const isDocument = (value: Node): value is Document => {
  return (value as any).nodeType === 9;
};

export const isElement = (value: object): value is Element => {
  return (value as any).nodeType === 1;
};

export const isQwikElement = (value: object): value is QwikElement => {
  const nodeType = (value as any).nodeType;
  return nodeType === 1 || nodeType === 111;
};

export const isNodeElement = (value: object): value is QwikElement => {
  const nodeType = (value as any).nodeType;
  return nodeType === 1 || nodeType === 111 || nodeType === 3;
};

export const isVirtualElement = (value: object): value is VirtualElement => {
  return (value as any).nodeType === 111;
};

export const isVirtualElementOpenComment = (value: Node | VirtualElement): value is Comment => {
  return isComment(value) && value.data.startsWith('qv ');
};

export const isText = (value: Node | QwikElement): value is Text => {
  return (value as any).nodeType === 3;
};

export const isComment = (value: Node | QwikElement): value is Comment => {
  return (value as any).nodeType === 8;
};
