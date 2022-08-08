import { assertTrue } from "../../assert/assert";
import { isQwikElement, isVirtualElement } from "../../util/element";
import { qDev } from "../../util/qdev";


const VIRTUAL_SYMBOL = '__virtual';


export interface VirtualElement {
  readonly open: Comment;
  readonly close: Comment;
  readonly insertBefore: <T extends Node>(node: T, child: Node | null) => T;
  readonly appendChild: <T extends Node>(node: T) => T;
  readonly insertBeforeTo: (newParent: QwikElement, child: Node | null) => void;
  readonly appendTo: (newParent: QwikElement) => void;
  readonly ownerDocument: Document;
  readonly nodeType: 10;
  readonly children: Node[];
  readonly firstChild: Node | null;
  readonly closest: (query: string) => Element | null;
  readonly hasAttribute: (prop: string) => boolean,
  readonly getAttribute: (prop: string) => string | null;
  readonly removeAttribute: (prop: string) => void;
  readonly querySelector: (query: string) => QwikElement | null;
  readonly querySelectorAll: (query: string) => QwikElement[];
  readonly compareDocumentPosition: (other: Node) => number;
  readonly matches: (query: string) => boolean;
  readonly setAttribute: (prop: string, value: string) => void;
  readonly localName: string;
  readonly nodeName: string;
  isConnected: boolean;
  parentElement: QwikElement | null;
}

export type QwikElement = Element | VirtualElement;

export const newVirtualElement = (doc: Document): VirtualElement => {
  const open = doc.createComment('virtual');
  const close = doc.createComment('/virtual');
  return createVirtualElement(open, close);
}

export const createVirtualElement = (open: Comment, close: Comment): VirtualElement => {
  const children: Node[] = [];
  assertTrue(open.data.startsWith('qv '), 'comment is not a qv');

  const attributes = new URLSearchParams(open.data.slice(3));
  const insertBefore = <T extends Node>(node: T, child: Node | null): T => {
    if (qDev && child) {
      if (!children.includes(child)) {
        throw new Error('child is not part of the virtual element');
      }
    }
    const parent = virtual.parentElement;
    if (parent) {
      const ref = child ? child : close;
      parent.insertBefore(node, ref);
    }
    return node;
  };

  const appendChild = <T extends Node>(node: T): T => {
    return insertBefore(node, null)
  };

  const insertBeforeTo = (newParent: QwikElement, child: Node | null) => {
    virtual.parentElement = newParent;
    virtual.isConnected = true;
    newParent.insertBefore(open, child);
    for (const c of children) {
      newParent.insertBefore(c, child);
    }
    newParent.insertBefore(open, child);
  }

  const appendTo = (newParent: QwikElement) => {
    insertBeforeTo(newParent, null);
  };

  const updateComment = () => {
    open.data = `qv ${attributes.toString()}`;
  }

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
    virtual.children.forEach((el) => {
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
    for (const el of virtual.children) {
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

    ownerDocument: open.ownerDocument,
    nodeType: 10 as const,
    compareDocumentPosition,
    querySelectorAll,
    querySelector,
    matches,
    setAttribute,
    getAttribute,
    hasAttribute,
    localName: 'q:virtual',
    nodeName: 'Q:VIRTUAL',
    removeAttribute,
    get firstChild() {
      return open.nextSibling;
    },
    get children() {
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