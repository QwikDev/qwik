/** @file Public types for the client deserialization */

export interface Container {
  element: ContainerElement;
  qContainer: string;
  qVersion: string;
  qBase: string;
  qLocale: string;
  qManifestHash: string;
  rootVNode: VNode;
}

export interface ContainerElement extends HTMLElement {
  qContainer?: Container;
}

export interface QDocument extends Document {
  qVNodeData: WeakMap<Element, string>;
}

export interface QNode extends Node {
  qVNode?: VNode;
}

export interface VNode {
  __brand__: 'Opeque VNode';
}
