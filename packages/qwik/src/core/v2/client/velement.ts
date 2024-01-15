import type { ProcessedJSXNode } from '../../render/dom/render-dom';
import type { Signal } from '../../state/signal';
import { ELEMENT_ID } from '../../util/markers';
import { VNodeFlags, type VNode } from './types';
import {
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getProp,
  vnode_getText,
  vnode_isElementVNode,
  vnode_isVirtualVNode,
  vnode_isTextVNode,
  vnode_propsToRecord,
  vnode_setText,
  vnode_toString,
} from './vnode';

export class QwikElementAdapter extends Array {
  static createElement(
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null,
    nextSibling: VNode | null,
    firstChild: VNode | null | undefined,
    lastChild: VNode | null | undefined,
    element: Element,
    tag: string | undefined
  ) {
    const vnode = new QwikElementAdapter(flags, parent, previousSibling, nextSibling) as any;
    vnode.push(firstChild, lastChild, element, tag);
    return vnode;
  }

  static createText(
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null,
    nextSibling: VNode | null,
    textNode: Text | null,
    text: string | undefined
  ) {
    const vnode = new QwikElementAdapter(flags, parent, previousSibling, nextSibling) as any;
    vnode.push(textNode, text);
    return vnode;
  }

  static createVirtual(
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null,
    nextSibling: VNode | null,
    firstChild: VNode | null,
    lastChild: VNode | null
  ) {
    const vnode = new QwikElementAdapter(flags, parent, previousSibling, nextSibling) as any;
    vnode.push(firstChild, lastChild);
    return vnode;
  }

  constructor(
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null | undefined,
    nextSibling: VNode | null | undefined
  ) {
    super();
    this.push(flags, parent, previousSibling, nextSibling);
  }

  getAttribute(name: string): string | null {
    return vnode_getProp(this as any as VNode, name);
  }

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) != null;
  }

  get nodeType(): number {
    if (vnode_isElementVNode(this as any)) {
      return 1;
    } else if (vnode_isTextVNode(this as any)) {
      return 3;
    } else {
      return 111;
    }
  }

  get isConnected(): boolean {
    return true;
    // const node = vnode_getNode(this as any as VNode);
    // if (isElement(node)) {
    //   return node.isConnected;
    // }
    // return false;
  }

  insertBefore(newChild: VNode, refChild: VNode | null): void {
    console.log('insertBefore', newChild.outerHTML, refChild?.toString());
  }

  set data(value: string) {
    vnode_setText(this as any, value);
  }

  get data(): string {
    throw new Error('Implement');
  }

  toString(): string {
    const vnode = this as any as VNode;
    return vnode_toString.call(vnode);
  }

  ////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////
  /// EMULATE: ProcessedJSXNode
  ////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////

  get $elm$(): QwikElementAdapter | null {
    return this;
  }

  get $type$() {
    if (vnode_isElementVNode(this as any)) {
      return vnode_getElementName(this as any);
    } else if (vnode_isTextVNode(this as any)) {
      return '#text';
    } else if (vnode_isVirtualVNode(this as any)) {
      return ':virtual';
    }
  }

  get $id$(): string {
    const key = this.$key$;
    return this.$type$ + (key ? ':' + key : '');
  }
  get $flags$(): number {
    return 0;
  }

  get $children$(): ProcessedJSXNode[] {
    const children = [];
    let child = vnode_getFirstChild(this as any);
    while (child) {
      children.push(child);
      child = vnode_getNextSibling(child);
    }
    return children as any;
  }
  get $text$(): string {
    return vnode_getText(this as any);
  }
  get $key$(): string | null {
    return vnode_getProp(this as any, ELEMENT_ID);
  }

  get $props$(): Record<string, any> {
    return vnode_propsToRecord(this as any);
  }
  get $immutableProps$(): Record<string, any> | null {
    throw new Error('Implement');
  }
  get$signal$(): Signal<any> | null {
    throw new Error('Implement');
  }
}
