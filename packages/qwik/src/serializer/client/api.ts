/** @file Public APIs for the SSR */

import { deserialize } from './deserializer';
import type { Container, ContainerElement, VNode, QDocument } from './types';
import { vnode_newElement } from './vnode';

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
  private rawStateData: any[];
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
    this.rootVNode = vnode_newElement(null, this.element);
    const qwikStates = element.querySelectorAll('script[type="qwik/state"]');
    const lastState = qwikStates[qwikStates.length - 1];
    this.rawStateData = JSON.parse(lastState.textContent!);
  }

  getObjectById(id: number): any {
    const value = this.rawStateData[id];
    return deserialize(this.rawStateData, value);
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
      // VNodeData needs to catch up with the elementIdx
      if (vNodeIndex == -1) {
        // Special case for initial catch up
        vNodeIndex = 0;
      }
      vNodeDataStart = vNodeDataEnd;
      if (vNodeDataStart < currentVNodeDataLength) {
        while (isSeparator((ch = currentVNodeData.charCodeAt(vNodeDataStart)))) {
          // Keep consuming the separators and incrementing the vNodeIndex
          vNodeIndex += 1 << (ch - 33) /*`!`*/;
          vNodeDataStart++;
          if (vNodeDataStart >= currentVNodeDataLength) {
            // we reached the end of the vNodeData stop.
            break;
          }
        }
        const shouldStoreRef = ch === 126; /*`~` */
        if (shouldStoreRef) {
          // if we need to store the ref handle it here.
          vNodeDataStart++;
          if (vNodeDataStart < currentVNodeDataLength) {
            ch = currentVNodeData.charCodeAt(vNodeDataEnd);
          } else {
            // assume separator on ond.
            ch = 33 /* `!` */;
          }
        }
        vNodeDataEnd = vNodeDataStart;
        while (true as boolean) {
          // look for the end of VNodeData
          if (vNodeDataEnd < currentVNodeDataLength) {
            ch = currentVNodeData.charCodeAt(vNodeDataEnd);
            if (isSeparator(ch)) {
              break;
            } else {
              vNodeDataEnd++;
            }
          } else {
            break;
          }
        }
      } else {
        elementIdx = Number.MAX_SAFE_INTEGER;
      }
    }
    if (elementIdx === vNodeIndex) {
      const instructions = currentVNodeData.substring(vNodeDataStart, vNodeDataEnd);
      // console.log('SET', (node as Element).outerHTML, instructions);
      vNodeDataMap.set(node as Element, instructions);
    }
    elementIdx++;
  }

  function isSeparator(ch: number) {
    return /* `!` */ 33 <= ch && ch <= 47; /* `/` */
  }
}
