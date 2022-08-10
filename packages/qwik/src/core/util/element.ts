import type { QwikElement, VirtualElement } from '../render/dom/virtual-element';
import { isObject } from './types';

export const isNode = (value: any): value is Node => {
  return value && typeof value.nodeType == 'number';
};
export const isDocument = (value: any): value is Document => {
  return value && value.nodeType === 9;
};
export const isElement = (value: any): value is Element => {
  return isNode(value) && value.nodeType === 1;
};

export const isQwikElement = (value: any): value is QwikElement => {
  return isNode(value) && (value.nodeType === 1 || value.nodeType === 111);
};

export const isVirtualElement = (value: any): value is VirtualElement => {
  return isObject(value) && value.nodeType === 111;
};

export const isText = (value: any): value is Text => {
  return isNode(value) && value.nodeType === 3;
};
export const isComment = (value: any): value is Comment => {
  return isNode(value) && value.nodeType === 9;
};
