import type { VNode, VNode as VNodeBrand } from './types';

const enum _ {
  node = 0,
  nextSibling = 1,
  firstChild = 2,
  tag = 3,
  attrsStart = 4,
}
type IVNode = [
  /// At a minumum the VNode must have a
  Node,
  /// Next sibling
  IVNode | null,
  /// First child
  IVNode | null,
  /// Tag
  Tag,
  /// Attributes (or props)
  ...(string | null)[],
] &
  VNodeBrand;

type Tag = Function | string;

export const vnode_new = (node: Node): IVNode => {
  return [node] as IVNode;
};

export const vnode_getTag = (vnode: VNode): Tag => {
  return ensureInflated(vnode)[_.tag] as any;
};

export const vnode_getText = (vnode: VNode): string => {
  return ensureInflated(vnode)[_.node].textContent!;
};

export const vnode_getFirstChild = (vnode: VNode): VNode | null => {
  return ensureInflated(vnode)[_.firstChild];
};

export const vnode_getNextSibling = (vnode: VNode): VNode | null => {
  return ensureInflated(vnode)[_.nextSibling];
};

function ensureInflated(vnode: VNode): IVNode {
  if ((vnode as IVNode).length === 1) {
    // don't inline this function to keep `ensureInflated` small so that it can be inlined into parent.
    inflate(vnode as IVNode);
  }
  return vnode as IVNode;
}

function inflate(vnode: IVNode) {
  const node = vnode[_.node];
  const nextSibling = node.nextSibling;
  vnode.push(nextSibling ? vnode_new(nextSibling) : null);
  const child = node.firstChild;
  vnode.push(child ? vnode_new(child) : null);
  vnode.push(node.nodeType === /** Node.ELEMENT_NODE* */ 1 ? node.nodeName.toLowerCase() : null);
}
