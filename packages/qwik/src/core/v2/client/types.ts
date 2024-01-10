/** @file Public types for the client deserialization */

import type { ContainerState } from '../../container/container';

export interface ClientContainer {
  containerState: ContainerState;
  element: ContainerElement;
  qContainer: string;
  qVersion: string;
  qBase: string;
  qLocale: string;
  qManifestHash: string;
  rootVNode: ElementVNode;
  readonly getObjectById: (id: number | string) => any;
}

export interface ContainerElement extends HTMLElement {
  qContainer?: ClientContainer;
  /**
   * Map of element ID to Element. If VNodeData has a reference to an element, then it is added to
   * this map for later retrieval.
   *
   * Once retrieved the element is replaced with its VNode.
   *
   * NOTE: This map leaks memory! Once the application is resumed we don't know which element IDs
   * are still in the deserialized state. we will probably need a GC cycle. Some process running in
   * the idle time which processes few elements at a time to see if they are still referenced and
   * removes them from the map if they are not.
   */
  qVNodeRefs: Map<number, Element | VNode>;
}

export interface QDocument extends Document {
  /*
   * Map of Element to VNodeData.
   *
   * This map is used to rebuild virtual nodes from the HTML. Missing extra text nodes, and Fragments.
   */
  qVNodeData: WeakMap<Element, string>;
}

export interface QNode extends Node {
  qVNode?: VNode;
}

export const enum VNodeProps {
  flags = 0,
  parent = 1,
  previousSibling = 2,
  nextSibling = 3,
  firstChildOrPreviousText = 4,
  node = 5,
  tagOrContent = 6,
  key = 7,
  propsStart = 8,
}

export const enum Flags {
  // Combine this flag with Element/Text/Fragment to indicate that the node is inflated.
  NeedsInflation = 0b00001,
  // Text
  Text = 0b00010,
  Element = 0b0100,
  Fragment = 0b1000,
  MaskType = 0b1110,
  MaskElementOrFragment = 0b1100,
}

export type ElementVNode = [
  Flags.Element,
  VNode | null, /// Parent
  VNode | null | undefined, /// Previous sibling
  VNode | null | undefined, /// Next sibling
  VNode | null | undefined, /// First child
  Element,
  /// Props
  string | undefined, /// tag
  string | null, /// key
  ...(string | null)[],
] & { __brand__: 'ElementVNode' };

export type TextVNode = [
  Flags.Text,
  VNode, /// Parent
  VNode | null | undefined, /// Previous sibling
  VNode | null, /// Next sibling
  VNode | null, /// Previous TextNode
  Text | null, /// TextNode or SharedTextNode if deflated
  string, /// text content
  string | null, /// key content
] & { __brand__: 'TextVNode' };

export type FragmentVNode = [
  Flags.Fragment,
  VNode, /// Parent
  VNode | null, /// Next sibling
  VNode | null | undefined, /// Previous sibling
  VNode | null, /// First child
  null, /// Node
  null, /// tag
  string | null, /// key
  ...(string | null)[], // attrs
] & { __brand__: 'FragmentNode' };

export type VNode = ElementVNode | TextVNode | FragmentVNode;

