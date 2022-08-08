import { assertEqual, assertTrue } from "../../assert/assert";
import { isQwikElement, isVirtualElement } from "../../util/element";
import { qDev } from "../../util/qdev";
import { directRemoveChild } from "./visitor";

const VIRTUAL_SYMBOL = '__virtual';

export interface VirtualElement {
  readonly open: Comment;
  readonly close: Comment;
  readonly insertBefore: <T extends Node>(node: T, child: Node | null) => T;
  readonly appendChild: <T extends Node>(node: T) => T;
  readonly insertBeforeTo: (newParent: QwikElement, child: Node | null) => void;
  readonly appendTo: (newParent: QwikElement) => void;
  readonly ownerDocument: Document;
  readonly nodeType: 111;
  readonly childNodes: Node[];
  readonly firstChild: Node | null;
  readonly nextSibling: Node | null;
  readonly remove: () => void;
  readonly closest: (query: string) => Element | null;
  readonly hasAttribute: (prop: string) => boolean,
  readonly getAttribute: (prop: string) => string | null;
  readonly removeAttribute: (prop: string) => void;
  readonly querySelector: (query: string) => QwikElement | null;
  readonly querySelectorAll: (query: string) => QwikElement[];
  readonly compareDocumentPosition: (other: Node) => number;
  readonly matches: (query: string) => boolean;
  readonly setAttribute: (prop: string, value: string) => void;
  readonly removeChild: (node: Node) => void;
  readonly localName: string;
  readonly nodeName: string;
  isConnected: boolean;
  parentElement: QwikElement | null;
}

export type QwikElement = Element | VirtualElement;

export const newVirtualElement = (doc: Document): VirtualElement => {
  const open = doc.createComment('qv ');
  const close = doc.createComment('/qv');
  return createVirtualElement(open, close);
}

export const createVirtualElement = (open: Comment, close: Comment): VirtualElement => {
  const children: Node[] = [];
  assertTrue(open.data.startsWith('qv '), 'comment is not a qv');

  const attributes = new URLSearchParams(open.data.slice(3));
  const insertBefore = <T extends Node>(node: T, ref: Node | null): T => {
    // if (qDev && child) {
    //   if (!children.includes(child)) {
    //     throw new Error('child is not part of the virtual element');
    //   }
    // }
    const parent = virtual.parentElement;
    if (parent) {
      const ref2 = ref ? ref : close;
      parent.insertBefore(node, ref2);
    } else {
      if (ref) {
        const index = children.indexOf(ref);
        if (index >= 0) {
          children.splice(index, 0, node);
          return node;
        }
      }
      children.push(node);
    }
    return node;
  };

  const remove = () => {
    const parent = virtual.parentElement;

    if (parent) {
      const ch = virtual.childNodes;
      assertEqual(children.length, 0, 'children should be empty');
      children.push(...ch);
      parent.removeChild(open);
      children.forEach(child => directRemoveChild(parent, child));
      parent.removeChild(open);
    }
  };

  const appendChild = <T extends Node>(node: T): T => {
    return insertBefore(node, null)
  };

  const insertBeforeTo = (newParent: QwikElement, child: Node | null) => {
    if (qDev) {
      checkIfChildren(child);
    }
    const ch = virtual.childNodes;
    if (virtual.parentElement) {
      console.warn('already attached');
    }
    virtual.parentElement = newParent;
    virtual.isConnected = true;
    newParent.insertBefore(open, child);
    for (const c of ch) {
      newParent.insertBefore(c, child);
    }
    newParent.insertBefore(close, child);
    children.length = 0;
  }

  const appendTo = (newParent: QwikElement) => {
    insertBeforeTo(newParent, null);
  };

  const updateComment = () => {
    open.data = `qv ${attributes.toString()}`;
  }

  const removeChild = (child: Node) => {
    if (qDev) {
      checkIfChildren(child);
    }
    if (virtual.parentElement) {
      virtual.parentElement.removeChild(child);
    } else {
      const index = children.indexOf(child);
      if (index >= 0) {
        children.splice(index, 1);
      }
    }
  }

  const checkIfChildren = (_child: Node | null) => {

  };

  const getAttribute = (prop: string) => {
    return attributes.get(prop);
  }

  const hasAttribute = (prop: string) => {
    return attributes.has(prop);
  }

  const setAttribute = (prop: string, value: string) => {
    attributes.set(prop, value);
    updateComment();
  }

  const removeAttribute = (prop: string) => {
    attributes.delete(prop);
    updateComment();
  }

  const matches = (_: string) => {
    return false;
  }

  const compareDocumentPosition = (other: Node) => {
    return open.compareDocumentPosition(other);
  }

  const closest = (query: string) => {
    const parent = virtual.parentElement;
    if (parent) {
      return parent.closest(query);
    }
    return null;
  }

  const querySelectorAll = (query: string) => {
    const result: QwikElement[] = [];
    virtual.childNodes.forEach((el) => {
      if (isQwikElement(el)) {
        if (el.matches(query)) {
          result.push(el);
        }
        result.concat(Array.from(el.querySelectorAll(query)));
      }
    });
    return result;
  }
  const querySelector = (query: string) => {
    for (const el of virtual.childNodes) {
      if (isQwikElement(el)) {
        if (el.matches(query)) {
          return el;
        }
        const v = el.querySelector(query);
        if (v !== null) {
          return v;
        }
      }
    }
    return null;
  }

  const virtual: VirtualElement = {
    open,
    close,
    appendChild,
    insertBefore,
    appendTo,
    insertBeforeTo,
    closest,
    remove,
    ownerDocument: open.ownerDocument,
    nodeType: 111 as const,
    compareDocumentPosition,
    querySelectorAll,
    querySelector,
    matches,
    setAttribute,
    getAttribute,
    hasAttribute,
    removeChild,
    localName: ':virtual',
    nodeName: ':virtual',
    removeAttribute,
    get firstChild() {
      return open.nextSibling;
    },
    get nextSibling() {
      return close.nextSibling;
    },
    get childNodes() {
      if (!virtual.parentElement) {
        return children;
      }
      const nodes: Node[] = [];
      let node = open.nextSibling;
      while (node) {
        if (node !== close) {
          nodes.push(node);
        } else {
          break;
        }
        node = node.nextSibling;
      }
      return nodes;
    },
    parentElement: null,
    isConnected: false,
  };
  (open as any)[VIRTUAL_SYMBOL] = virtual;

  return virtual;
};

export const processVirtualNodes = (node: Node | null): Node | QwikElement | null => {
  if (node == null) {
    return null;
  }
  const virtual = (node as any)[VIRTUAL_SYMBOL];
  if (virtual) {
    return virtual;
  }
  if (isComment(node) && node.data.startsWith('qv ')) {
    const close = findClose(node);
    return createVirtualElement(node, close);
  }
  return node;
}


const findClose = (open: Comment): Comment => {
  let node = open.nextSibling;
  let stack = 1;
  while(node) {
    if (isComment(node)) {
      if (node.data.startsWith('qv ')) {
        stack++;
      } else if (node.data === '/qv') {
        stack--;
        if (stack === 0) {
          return node;
        }
      }
    }
    node = node.nextSibling;
  }
  throw new Error('close not found');
}

export const isComment = (node: Node): node is Comment => {
  return node.nodeType === 8;
}

export const getRootNode = (node: Node | VirtualElement | null): Node=> {
  if (node == null) {
    return null as any; // TODO
  }
  if (isVirtualElement(node)) {
    return node.open;
  } else {
    return node;
  }
}