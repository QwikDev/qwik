/** @file Public types for the client deserialization */

export interface Container {
  element: ContainerElement;
}

export interface ContainerElement extends HTMLElement {
  qContainer?: Container;
}

export interface QNode extends Node {
  qVNode?: VNode;
}

export interface VNode {
  tag: string | Function;
}
