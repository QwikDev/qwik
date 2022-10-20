import { assertEqual, assertTrue } from '../../error/assert';
import { isComment, isElement, isQwikElement, isVirtualElement } from '../../util/element';
import { qSerialize, seal } from '../../util/qdev';
import { directGetAttribute } from '../fast-calls';
import { createElement } from './operations';
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
  readonly namespaceURI: string;
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
  return new VirtualElementImpl(open, close);
};

export const parseVirtualAttributes = (str: string): Map<string, string> => {
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
        return directGetAttribute(virtual, prop) === value ? FILTER_ACCEPT : FILTER_REJECT;
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

export const VIRTUAL = ':virtual';

export class VirtualElementImpl implements VirtualElement {
  ownerDocument: Document;
  _qc_: any = null;

  readonly nodeType = 111 as const;
  readonly localName = VIRTUAL;
  readonly nodeName = VIRTUAL;
  private attributes: Map<string, string>;
  private template: HTMLTemplateElement;

  constructor(public open: Comment, public close: Comment) {
    const doc = (this.ownerDocument = open.ownerDocument);
    this.template = createElement(doc, 'template', false) as HTMLTemplateElement;
    this.attributes = parseVirtualAttributes(open.data.slice(3));
    assertTrue(open.data.startsWith('qv '), 'comment is not a qv');
    (open as any)[VIRTUAL_SYMBOL] = this;
    seal(this);
  }

  insertBefore<T extends Node>(node: T, ref: Node | null): T {
    const parent = this.parentElement;
    if (parent) {
      const ref2 = ref ? ref : this.close;
      parent.insertBefore(node, ref2);
    } else {
      this.template.insertBefore(node, ref);
    }
    return node;
  }

  remove() {
    const parent = this.parentElement;
    if (parent) {
      const ch = Array.from(this.childNodes);
      assertEqual(this.template.childElementCount, 0, 'children should be empty');
      parent.removeChild(this.open);
      this.template.append(...ch);
      parent.removeChild(this.close);
    }
  }

  appendChild<T extends Node>(node: T): T {
    return this.insertBefore(node, null);
  }

  insertBeforeTo(newParent: QwikElement, child: Node | null) {
    const ch = Array.from(this.childNodes);
    // TODO
    // if (this.parentElement) {
    //   console.warn('already attached');
    // }
    newParent.insertBefore(this.open, child);
    for (const c of ch) {
      newParent.insertBefore(c, child);
    }
    newParent.insertBefore(this.close, child);
    assertEqual(this.template.childElementCount, 0, 'children should be empty');
  }

  appendTo(newParent: QwikElement) {
    this.insertBeforeTo(newParent, null);
  }

  get namespaceURI() {
    return this.parentElement?.namespaceURI ?? '';
  }

  removeChild(child: Node) {
    if (this.parentElement) {
      this.parentElement.removeChild(child);
    } else {
      this.template.removeChild(child);
    }
  }

  getAttribute(prop: string) {
    return this.attributes.get(prop) ?? null;
  }

  hasAttribute(prop: string) {
    return this.attributes.has(prop);
  }

  setAttribute(prop: string, value: string) {
    this.attributes.set(prop, value);
    if (qSerialize) {
      this.open.data = updateComment(this.attributes);
    }
  }

  removeAttribute(prop: string) {
    this.attributes.delete(prop);
    if (qSerialize) {
      this.open.data = updateComment(this.attributes);
    }
  }

  matches(_: string) {
    return false;
  }

  compareDocumentPosition(other: Node) {
    return this.open.compareDocumentPosition(other);
  }

  closest(query: string) {
    const parent = this.parentElement;
    if (parent) {
      return parent.closest(query);
    }
    return null;
  }

  querySelectorAll(query: string) {
    const result: QwikElement[] = [];
    const ch = getChildren(this, 'elements');
    ch.forEach((el) => {
      if (isQwikElement(el)) {
        if (el.matches(query)) {
          result.push(el);
        }
        result.concat(Array.from(el.querySelectorAll(query)));
      }
    });
    return result;
  }

  querySelector(query: string) {
    for (const el of this.childNodes) {
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
  }

  get firstChild() {
    if (this.parentElement) {
      const first = this.open.nextSibling;
      if (first === this.close) {
        return null;
      }
      return first;
    } else {
      return this.template.firstChild;
    }
  }
  get nextSibling() {
    return this.close.nextSibling;
  }
  get previousSibling() {
    return this.open.previousSibling;
  }
  get childNodes(): Node[] {
    if (!this.parentElement) {
      return this.template.childNodes as any;
    }
    const nodes: Node[] = [];
    let node: Node | null = this.open;
    while ((node = node.nextSibling)) {
      if (node !== this.close) {
        nodes.push(node);
      } else {
        break;
      }
    }
    return nodes;
  }
  get isConnected() {
    return this.open.isConnected;
  }
  get parentElement() {
    return this.open.parentElement;
  }
}

const updateComment = (attributes: Map<string, string>) => {
  return `qv ${serializeVirtualAttributes(attributes)}`;
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
    return new VirtualElementImpl(open, close);
  }
  return null;
};

export const findClose = (open: Comment): Comment => {
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
