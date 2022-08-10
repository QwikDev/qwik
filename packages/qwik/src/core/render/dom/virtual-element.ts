import { assertEqual, assertTrue } from '../../assert/assert';
import { isElement, isQwikElement, isVirtualElement } from '../../util/element';
import { qDev } from '../../util/qdev';
import { getChildren } from './visitor';

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
  readonly previousSibling: Node | null;
  readonly nextSibling: Node | null;
  readonly remove: () => void;
  readonly closest: (query: string) => Element | null;
  readonly hasAttribute: (prop: string) => boolean;
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
  readonly isConnected: boolean;
  readonly parentElement: Element | null;
}

export type QwikElement = Element | VirtualElement;

export const newVirtualElement = (doc: Document): VirtualElement => {
  const open = doc.createComment('qv ');
  const close = doc.createComment('/qv');
  return createVirtualElement(open, close);
};

export const parseVirtualAttributes = (str: string) => {
  if (!str) {
    return new Map();
  }
  const attributes = str.split(' ');
  return new Map(
    attributes.map((attr) => {
      const index = attr.indexOf('=');
      if (index >= 0) {
        return [attr.slice(0, index), unescape(attr.slice(index + 1))];
      } else {
        return [attr, ''];
      }
    })
  );
};

export const serializeVirtualAttributes = (map: Map<string, string>) => {
  const attributes: string[] = [];
  map.forEach((value, key) => {
    if (!value) {
      attributes.push(`${key}`);
    } else {
      attributes.push(`${key}=${escape(value)}`);
    }
  });
  return attributes.join(' ');
};

const SHOW_COMMENT = 128;
const FILTER_ACCEPT = 1;
const FILTER_REJECT = 2;

export const walkerVirtualByAttribute = (el: Element, prop: string, value: string) => {
  return el.ownerDocument.createTreeWalker(el, SHOW_COMMENT, {
    acceptNode(c) {
      const virtual = getVirtualElement(c as Comment);
      if (virtual) {
        return virtual.getAttribute(prop) === value ? FILTER_ACCEPT : FILTER_REJECT;
      }
      return FILTER_REJECT;
    },
  });
};

export const queryVirtualByAttribute = (el: Element, prop: string, value: string) => {
  const walker = walkerVirtualByAttribute(el, prop, value);
  const open = walker.firstChild();
  if (open) {
    return getVirtualElement(open as Comment);
  }
  return null;
};

export const queryAllVirtualByAttribute = (el: Element, prop: string, value: string) => {
  const walker = walkerVirtualByAttribute(el, prop, value);
  const pars: VirtualElement[] = [];
  let currentNode: Node | null = null;
  while ((currentNode = walker.nextNode())) {
    pars.push(getVirtualElement(currentNode as Comment)!);
  }
  return pars;
};

export const escape = (s: string) => {
  return s.replace(/ /g, '+');
};

export const unescape = (s: string) => {
  return s.replace(/\+/g, ' ');
};

export const createVirtualElement = (open: Comment, close: Comment): VirtualElement => {
  // const children: Node[] = [];
  const doc = open.ownerDocument;
  const template = doc.createElement('template');
  assertTrue(open.data.startsWith('qv '), 'comment is not a qv');

  const attributes = parseVirtualAttributes(open.data.slice(3));
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
      template.insertBefore(node, ref);
    }
    return node;
  };

  const remove = () => {
    const parent = virtual.parentElement;
    if (parent) {
      const ch = Array.from(virtual.childNodes);
      assertEqual(template.childElementCount, 0, 'children should be empty');
      parent.removeChild(open);
      template.append(...ch);
      parent.removeChild(close);
    }
  };

  const appendChild = <T extends Node>(node: T): T => {
    return insertBefore(node, null);
  };

  const insertBeforeTo = (newParent: QwikElement, child: Node | null) => {
    if (qDev) {
      checkIfChildren(child);
    }
    const ch = Array.from(virtual.childNodes);
    if (virtual.parentElement) {
      console.warn('already attached');
    }
    newParent.insertBefore(open, child);
    for (const c of ch) {
      newParent.insertBefore(c, child);
    }
    newParent.insertBefore(close, child);
    assertEqual(template.childElementCount, 0, 'children should be empty');
  };

  const appendTo = (newParent: QwikElement) => {
    insertBeforeTo(newParent, null);
  };

  const updateComment = () => {
    open.data = `qv ${serializeVirtualAttributes(attributes)}`;
  };

  const removeChild = (child: Node) => {
    if (qDev) {
      checkIfChildren(child);
    }
    if (virtual.parentElement) {
      virtual.parentElement.removeChild(child);
    } else {
      template.removeChild(child);
    }
  };

  const checkIfChildren = (_child: Node | null) => {};

  const getAttribute = (prop: string) => {
    return attributes.get(prop) ?? null;
  };

  const hasAttribute = (prop: string) => {
    return attributes.has(prop);
  };

  const setAttribute = (prop: string, value: string) => {
    attributes.set(prop, value);
    updateComment();
  };

  const removeAttribute = (prop: string) => {
    attributes.delete(prop);
    updateComment();
  };

  const matches = (_: string) => {
    return false;
  };

  const compareDocumentPosition = (other: Node) => {
    return open.compareDocumentPosition(other);
  };

  const closest = (query: string) => {
    const parent = virtual.parentElement;
    if (parent) {
      return parent.closest(query);
    }
    return null;
  };

  const querySelectorAll = (query: string) => {
    const result: QwikElement[] = [];
    const ch = getChildren(virtual, 'elements');
    ch.forEach((el) => {
      if (isQwikElement(el)) {
        if (el.matches(query)) {
          result.push(el);
        }
        result.concat(Array.from(el.querySelectorAll(query)));
      }
    });
    return result;
  };
  const querySelector = (query: string) => {
    for (const el of virtual.childNodes) {
      if (isElement(el)) {
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
  };

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
      if (virtual.parentElement) {
        const first = open.nextSibling;
        if (first === close) {
          return null;
        }
        return first;
      } else {
        return template.firstChild;
      }
    },
    get nextSibling() {
      return close.nextSibling;
    },
    get previousSibling() {
      return open.previousSibling;
    },
    get childNodes() {
      if (!virtual.parentElement) {
        return template.childNodes as any;
      }
      const nodes: Node[] = [];
      let node: Node | null = open;
      while ((node = node.nextSibling)) {
        if (node !== close) {
          nodes.push(node);
        } else {
          break;
        }
      }
      return nodes;
    },
    get isConnected() {
      return open.isConnected;
    },
    get parentElement() {
      return open.parentElement;
    },
  };
  (open as any)[VIRTUAL_SYMBOL] = virtual;

  return virtual;
};

export const processVirtualNodes = (node: Node | null): Node | QwikElement | null => {
  if (node == null) {
    return null;
  }

  if (isComment(node)) {
    const virtual = getVirtualElement(node);
    if (virtual) {
      return virtual;
    }
  }
  return node;
};

export const getVirtualElement = (open: Comment): VirtualElement | null => {
  const virtual = (open as any)[VIRTUAL_SYMBOL];
  if (virtual) {
    return virtual;
  }
  if (open.data.startsWith('qv ')) {
    const close = findClose(open);
    return createVirtualElement(open, close);
  }
  return null;
};

const findClose = (open: Comment): Comment => {
  let node = open.nextSibling;
  let stack = 1;
  while (node) {
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
};

export const isComment = (node: Node): node is Comment => {
  return node.nodeType === 8;
};

export const getRootNode = (node: Node | VirtualElement | null): Node => {
  if (node == null) {
    return null as any; // TODO
  }
  if (isVirtualElement(node)) {
    return node.open;
  } else {
    return node;
  }
};
