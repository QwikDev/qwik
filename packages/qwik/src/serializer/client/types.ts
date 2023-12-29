/** @file Public types for the client deserialization */

export interface Container {
  element: ContainerElement;
  qContainer: string;
  qVersion: string;
  qBase: string;
  qLocale: string;
  qManifestHash: string;
  rootVNode: VNode;
  getObjectById(arg0: number): any;
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

export const enum VNodeProps {
  flags = 0,
  parent = 1,
  nextSibling = 2,
  firstChildOrPreviousText = 3,
  node = 4,
  tagOrContent = 5,
  propsStart = 6,
}

export const enum Flags {
  DeflatedElement = 0b0010,
  InflatedElement = 0b0011,
  Fragment = 0b0100,
  // Deflated Text is one where the original HTML text node has not been broken down yet.
  DeflatedText = 0b1000,
  // Inflated Text is one where the original HTML text node has been broken down into smaller text nodes.
  InflatedText = 0b1001,
}

export type ElementVNode = [
  Flags.DeflatedElement | Flags.InflatedElement,
  VNode | null, /// Parent
  VNode | null | undefined, /// Next sibling
  VNode | null | undefined, /// First child
  Element,
  /// Props
  string | undefined, /// tag
  ...(string | null)[],
] & { __brand__: 'ElementVNode' };

export type TextVNode = [
  Flags.InflatedText | Flags.DeflatedText,
  VNode, /// Parent
  VNode | null, /// Next sibling
  VNode | null, /// Previous TextNode
  Text | null, /// TextNode or SharedTextNode if deflated
  string, /// text content
] & { __brand__: 'TextVNode' };

export type FragmentVNode = [
  Flags.Fragment,
  VNode, /// Parent
  VNode | null, /// Next sibling
  VNode | null, /// First child
] & { __brand__: 'FragmentNode' };

export type VNode = ElementVNode | TextVNode | FragmentVNode;

