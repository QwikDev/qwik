/** @file Public APIs for the SSR */

import { createContainerState, type ContainerState } from '../../container/container';
import { assertTrue } from '../../error/assert';
import { throwErrorAndStop } from '../../util/log';
import { deserialize } from '../shared-serialization';
import type {
  ClientContainer as IClientContainer,
  ContainerElement,
  VNode,
  QDocument,
  ElementVNode,
} from './types';
import { vnode_newElement } from './vnode';

export function getDomContainer(element: HTMLElement): IClientContainer {
  while (element && !element.hasAttribute('q:container')) {
    element = element.parentElement!;
  }
  if (!element) {
    throwErrorAndStop('Unable to find q:container.');
  }
  const qElement = element as ContainerElement;
  let container = qElement.qContainer;
  if (!container) {
    qElement.qContainer = container = new ClientContainer(qElement);
  }
  return container;
}

export class ClientContainer implements IClientContainer {
  public readonly containerState: ContainerState;
  public element: ContainerElement;
  public qContainer: string;
  public qVersion: string;
  public qBase: string;
  public qLocale: string;
  public qManifestHash: string;
  public rootVNode: ElementVNode;
  private rawStateData: any[];
  private stateData: any[];
  constructor(element: ContainerElement) {
    this.qContainer = element.getAttribute('q:container')!;
    if (!this.qContainer) {
      throw new Error("Element must have 'q:version' attribute.");
    }
    this.element = element;
    this.qVersion = element.getAttribute('q:version')!;
    this.qBase = element.getAttribute('q:base')!;
    this.containerState = createContainerState(element, this.qBase);
    this.qLocale = element.getAttribute('q:locale')!;
    this.qManifestHash = element.getAttribute('q:manifest-hash')!;
    this.rootVNode = vnode_newElement(null, this.element);
    // These are here to initialize all properties at once for single class transition
    this.rawStateData = null!;
    this.stateData = null!;
    const document = this.element.ownerDocument as QDocument;
    if (!document.qVNodeData) {
      processVNodeData(document);
    }
    const qwikStates = element.querySelectorAll('script[type="qwik/state"]');
    const lastState = qwikStates[qwikStates.length - 1];
    this.rawStateData = JSON.parse(lastState.textContent!);
    // NOTE: We want to deserialize the `rawStateData` so that we can cache the deserialized data.
    this.stateData = deserialize(this, this.rawStateData);
    this.containerState.$pauseCtx$ = {
      getObject: (id: string) => {
        console.log('getObject', id);
        return this.getObjectById(id);
      },
      meta: loggingProxy('meta', this.rawStateData),
      refs: loggingProxy('refs', {}),
    };
  }

  getObjectById(id: number | string): any {
    if (typeof id === 'string') {
      id = parseFloat(id);
    }
    assertTrue(id < this.rawStateData.length, 'Invalid reference');
    return this.stateData[id];
  }
}

export function processVNodeData(document: Document) {
  const qDocument = document as QDocument;
  const vNodeDataMap =
    qDocument.qVNodeData || (qDocument.qVNodeData = new WeakMap<Element, string>());
  const vNodeData = document.querySelectorAll('script[type="qwik/vnode"]');
  const containers = document.querySelectorAll('[q\\:container]');
  const containerElement = containers[0] as ContainerElement;
  const qVNodeRefs = (containerElement.qVNodeRefs = new Map<number, Element | VNode>());
  const walker = document.createTreeWalker(
    containerElement.parentNode!,
    1 /* NodeFilter.SHOW_ELEMENT */
  );
  const currentVNodeData = vNodeData[0].textContent!;
  const currentVNodeDataLength = currentVNodeData.length;
  /// Stores the current element index as the TreeWalker traverses the DOM.
  let elementIdx = -1;
  /// Stores the current VNode index as derived from the VNodeData script tag.
  let vNodeElementIndex = -1;
  let vNodeDataStart = 0;
  let vNodeDataEnd = 0;
  let ch: number;
  let needsToStoreRef = -1;
  for (let node = walker.firstChild(); node !== null; node = walker.nextNode()) {
    elementIdx++;
    if (vNodeElementIndex < elementIdx) {
      // VNodeData needs to catch up with the elementIdx
      if (vNodeElementIndex == -1) {
        // Special case for initial catch up
        vNodeElementIndex = 0;
      }
      vNodeDataStart = vNodeDataEnd;
      if (vNodeDataStart < currentVNodeDataLength) {
        while (isSeparator((ch = currentVNodeData.charCodeAt(vNodeDataStart)))) {
          // Keep consuming the separators and incrementing the vNodeIndex
          // console.log('ADVANCE', vNodeElementIndex, ch, ch - 33);
          vNodeElementIndex += 1 << (ch - 33) /*`!`*/;
          vNodeDataStart++;
          if (vNodeDataStart >= currentVNodeDataLength) {
            // we reached the end of the vNodeData stop.
            break;
          }
        }
        const shouldStoreRef = ch === 126; /*`~` */
        if (shouldStoreRef) {
          // if we need to store the ref handle it here.
          needsToStoreRef = vNodeElementIndex;
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
    // console.log('WALK', elementIdx, (node as Element).outerHTML, vNodeElementIndex);

    if (needsToStoreRef === elementIdx) {
      qVNodeRefs.set(elementIdx, node as Element);
    }
    if (elementIdx === vNodeElementIndex) {
      // console.log('MATCH', elementIdx, vNodeElementIndex);
      const instructions = currentVNodeData.substring(vNodeDataStart, vNodeDataEnd);
      // console.log('SET', (node as Element).outerHTML, instructions);
      vNodeDataMap.set(node as Element, instructions);
    }
  }

  function isSeparator(ch: number) {
    return /* `!` */ 33 <= ch && ch <= 47; /* `/` */
  }
}
function loggingProxy(name: string, dst: any): any {
  return new Proxy(dst, {
    get: (target: any, prop: string) => {
      console.log('PROXY.get', name, prop);
      return target[prop];
    },
  }) as any;
}

