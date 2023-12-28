/** @file Public APIs for the SSR */

import type { Container, ContainerElement, VNode, QDocument } from './types';
import { vnode_new } from './vnode';

export function getContainer(element: HTMLElement): Container {
  const qElement = element as ContainerElement;
  let container = qElement.qContainer;
  if (!container) {
    qElement.qContainer = container = new QContainer(qElement);
  }
  return container;
}

class QContainer implements Container {
  public element: ContainerElement;
  public qContainer: string;
  public qVersion: string;
  public qBase: string;
  public qLocale: string;
  public qManifestHash: string;
  public rootVNode: VNode;
  constructor(element: ContainerElement) {
    this.qContainer = element.getAttribute('q:container')!;
    if (!this.qContainer) {
      throw new Error("Element must have 'q:version' attribute.");
    }
    this.qVersion = element.getAttribute('q:version')!;
    this.qBase = element.getAttribute('q:base')!;
    this.qLocale = element.getAttribute('q:locale')!;
    this.qManifestHash = element.getAttribute('q:manifest-hash')!;
    this.element = element;
    this.rootVNode = vnode_new(this.element);
  }
}

export function processVNodeData(document: Document) {
  const qDocument = document as QDocument;
  const vNodeDataMap =
    qDocument.qVNodeData || (qDocument.qVNodeData = new WeakMap<Element, string>());
  const vNodeData = document.querySelectorAll('script[type="qwik/vnode"]');
  const containers = document.querySelectorAll('[q\\:container]');
  const container = containers[0];
  const walker = document.createTreeWalker(container.parentNode!, 1 /* NodeFilter.SHOW_ELEMENT */);
  const currentVNodeData = vNodeData[0].textContent!;
  const currentVNodeDataLength = currentVNodeData.length;
  let elementIdx = 0;
  let vNodeIndex = -1;
  let vNodeDataStart = 0;
  let vNodeDataEnd = 0;
  let ch: number;
  for (let node = walker.firstChild(); node !== null; node = walker.nextNode()) {
    if (vNodeIndex < elementIdx) {
      if (vNodeIndex == -1) {
        vNodeIndex = 0;
      }
      while (isSeparator((ch = currentVNodeData.charCodeAt(vNodeDataStart)))) {
        vNodeIndex += 1 << (ch - 33) /*`!`*/;
        vNodeDataStart++;
        if (vNodeDataEnd >= currentVNodeDataLength) {
          break;
        }
      }
      const shouldStoreRef = ch === 126; /*`~` */
      if (shouldStoreRef) {
        vNodeDataStart++;
        if (vNodeDataEnd < currentVNodeDataLength) {
          ch = currentVNodeData.charCodeAt(vNodeDataEnd);
        } else {
          ch = 33 /* `!` */;
        }
      }
      vNodeDataEnd = vNodeDataStart;
      while (!isSeparator(ch)) {
        if (vNodeDataEnd < currentVNodeDataLength) {
          ch = currentVNodeData.charCodeAt(vNodeDataEnd++);
        } else {
          ch = 33 /* `!` */;
        }
      }
    }
    if (elementIdx === vNodeIndex) {
      vNodeDataMap.set(node as Element, currentVNodeData.substring(vNodeDataStart, vNodeDataEnd));
    }
    elementIdx++;
  }

  function isSeparator(ch: number) {
    return /* `!` */ 33 <= ch && ch <= 47; /* `/` */
  }
}