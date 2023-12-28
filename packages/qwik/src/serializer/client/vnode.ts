import { Fragment } from '@builder.io/qwik/jsx-runtime';
import type { QDocument, VNode } from './types';
import { throwErrorAndStop } from '../../core/util/log';

const enum _ {
  node = 0,
  nextSibling = 1,
  firstChild = 2,
  tag = 3,
  attrsStart = 4,
}
type IVNode = [
  /// At a minimum the VNode must have a
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
  VNode;

type Tag = Function | string | null;

export const vnode_new = (node: Node): IVNode => {
  return [node] as IVNode;
};

export const vnode_newInflated = (
  node: Node,
  next: IVNode | null,
  child: IVNode | null,
  tag: Tag
): IVNode => {
  return [node, next, child, tag] as IVNode;
};

export const vnode_getTag = (vnode: VNode): Tag => {
  return ensureInflated(vnode)[_.tag] as any;
};

export const vnode_getText = (vnode: VNode): string => {
  return ensureInflated(vnode)[_.node].textContent!;
};

export const vnode_getNode = (vnode: VNode): Node => {
  return ensureInflated(vnode)[_.node];
};

export const vnode_getFirstChild = (vnode: VNode): VNode | null => {
  return ensureInflated(vnode)[_.firstChild];
};

export const vnode_setFirstChild = (vnode: VNode, firstChild: VNode | null) => {
  ensureInflated(vnode)[_.firstChild] = firstChild as IVNode | null;
};

export const vnode_getNextSibling = (vnode: VNode): VNode | null => {
  return ensureInflated(vnode)[_.nextSibling];
};

export const vnode_setNextSibling = (vnode: VNode, next: VNode | null) => {
  ensureInflated(vnode)[_.nextSibling] = next as IVNode | null;
};

function ensureInflated(vnode: VNode): IVNode {
  if (!vnode) {
    throwErrorAndStop('Inflation error: missing vnode.');
  }
  if ((vnode as IVNode).length === 1) {
    // don't inline this function to keep `ensureInflated` small so that it can be inlined into parent.
    inflate(vnode as IVNode);
  }
  return vnode as IVNode;
}

export const vnode_toString = (
  vnode: VNode | null,
  depth: number = 2,
  offset: string = '',
  includeSiblings: boolean = false
): string => {
  if (depth === 0) {
    return '...';
  }
  if (vnode === null) {
    return 'null';
  }
  if (vnode === undefined) {
    return 'undefined';
  }
  const strings: string[] = [];
  do {
    const node = (vnode as IVNode)[_.node];
    const child = (vnode as IVNode)[_.firstChild];
    strings.push(
      'VNode{ ' +
        (isElement(node)
          ? `<${node.nodeName}>`
          : node
            ? JSON.stringify(node.textContent)
            : 'null') +
        ','
    );
    if (child) {
      strings.push('  ' + vnode_toString(child, depth - 1, offset + '  ', true) + ',');
    }
    strings.push('}');
    vnode = includeSiblings && vnode ? (vnode as IVNode)[_.nextSibling] : null;
  } while (vnode);
  return strings.join('\n' + offset);
};

function inflate(vnode: IVNode) {
  const node = vnode[_.node];
  const nextSibling = node.nextSibling;
  vnode.push(nextSibling ? vnode_new(nextSibling) : null);
  const child = node.firstChild;
  let vNodeChild: IVNode | null = null;
  if (isElement(node)) {
    // console.log('inflate', node.outerHTML);
    const document = node.ownerDocument as QDocument;
    const map = document.qVNodeData;
    const vNodeData = map?.get(node as Element);
    if (vNodeData) {
      vNodeChild = processVNodeData(node as Element, vNodeData, child);
      // console.log(vnode_toString(vNodeChild));
    }
  }
  vnode.push(child ? vNodeChild || vnode_new(child) : null);
  vnode.push(node.nodeType === /** Node.ELEMENT_NODE* */ 1 ? node.nodeName.toLowerCase() : null);
}

const isNumber = (ch: number) => /* `0` */ 48 <= ch && ch <= 57; /* `9` */
const isLowercase = (ch: number) => /* `a` */ 97 <= ch && ch <= 122; /* `z` */

const stack: (Node | IVNode | null)[] = [];
function processVNodeData(parent: Element, vNodeData: string, child: Node | null): IVNode {
  console.log('processVNodeData', parent.outerHTML, vNodeData);
  let nextToConsumeIdx = 0;
  let firstVNode: IVNode | null = null;
  let lastVNode: IVNode | null = null;
  let ch = 0;
  let peekCh = 0;
  const peek = () => {
    if (peekCh !== 0) {
      return peekCh;
    } else {
      return (peekCh =
        nextToConsumeIdx < vNodeData!.length ? vNodeData!.charCodeAt(nextToConsumeIdx) : 0);
    }
  };
  const consume = () => {
    ch = peek();
    peekCh = 0;
    nextToConsumeIdx++;
    return ch;
  };
  const addVNode = (node: IVNode) => {
    firstVNode = firstVNode || node;
    lastVNode && vnode_setNextSibling(lastVNode, node);
    lastVNode = node;
  };

  let textIdx = 0;
  let combinedText: string | null = null;
  while (peek() !== 0) {
    if (isNumber(peek())) {
      // Element counts get encoded as numbers.
      while (!isElement(child)) {
        child = child!.nextSibling;
        if (!child) {
          throwErrorAndStop('Inflation error: missing element.', parent, vNodeData);
        }
      }
      combinedText = null;
      let value = 0;
      while (isNumber(peek())) {
        value *= 10;
        value += consume() - 48; /* `0` */
      }
      while (value--) {
        addVNode(vnode_new(child!));
        child = child!.nextSibling;
      }
      // collect the elements;
    } else if (peek() === 123 /* `{` */) {
      consume();
      addVNode(vnode_newInflated(child!, null, null, Fragment));
      stack.push(firstVNode, lastVNode, child);
      firstVNode = lastVNode = null;
    } else if (peek() === 125 /* `}` */) {
      consume();
      const firstChild = firstVNode;
      child = stack.pop() as Node | null;
      lastVNode = stack.pop() as IVNode | null;
      firstVNode = stack.pop() as IVNode | null;
      vnode_setFirstChild(lastVNode!, firstChild);
    } else {
      // must be alphanumeric
      let length = 0;
      if (combinedText === null) {
        combinedText = child?.textContent || '';
        textIdx = 0;
      }
      while (isLowercase(peek())) {
        length += consume() - 97; /* `a` */
        length *= 26;
      }
      length += consume() - 65; /* `A` */
      const text = combinedText!.substring(textIdx, textIdx + length);
      let textNode: Node | null = child;
      if (child && isNumber(peek())) {
        // Next item is element, so reuse the text node.
        child!.textContent = text;
      } else {
        textNode = parent.ownerDocument!.createTextNode(text);
        parent.insertBefore(textNode, child);
      }
      addVNode(vnode_newInflated(textNode!, null, null, null));
      textIdx += length;
      // Text nodes get encoded as alphanumeric characters.
    }
  }
  return firstVNode!;
}

const isElement = (node: Node | null): node is Element =>
  node?.nodeType === /** Node.ELEMENT_NODE* */ 1;
