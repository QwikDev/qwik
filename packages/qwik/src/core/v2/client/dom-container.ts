/** @file Public APIs for the SSR */

import { assertTrue } from '../../error/assert';
import { getPlatform } from '../../platform/platform';
import { createSubscriptionManager, type SubscriptionManager } from '../../state/common';
import { throwErrorAndStop } from '../../util/log';
import {
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  OnRenderProp,
  QContainerAttr,
  QContainerSelector,
  QCtxAttr,
} from '../../util/markers';
import { maybeThen, maybeThenMap } from '../../util/promises';
import { deserialize } from '../shared-serialization';
import { executeComponent2 } from '../shared/component-execution';
import type { HostElement, fixMeAny } from '../shared/types';
import type {
  ContainerElement,
  ElementVNode,
  ClientContainer as IClientContainer,
  QDocument,
  VirtualVNode,
} from './types';
import {
  vnode_documentPosition,
  vnode_getClosestParentNode,
  vnode_getParent,
  vnode_getProp,
  vnode_isVirtualVNode,
  vnode_newUnMaterializedElement,
  vnode_setProp,
} from './vnode';
import { vnode_applyJournal, vnode_diff, type VNodeJournalEntry } from './vnode-diff';

export function getDomContainer(element: HTMLElement | ElementVNode): IClientContainer {
  let htmlElement: HTMLElement | null = Array.isArray(element)
    ? (vnode_getClosestParentNode(element) as HTMLElement)
    : element;
  while (htmlElement && !htmlElement.hasAttribute(QContainerAttr)) {
    htmlElement = htmlElement.closest(QContainerSelector);
  }
  if (!htmlElement) {
    throwErrorAndStop('Unable to find q:container.');
  }
  const qElement = htmlElement as ContainerElement;
  let container = qElement.qContainer;
  if (!container) {
    qElement.qContainer = container = new DomContainer(qElement);
  }
  return container;
}

export class DomContainer implements IClientContainer {
  // public readonly containerState: ContainerState;
  public element: ContainerElement;
  public qContainer: string;
  public qVersion: string;
  public qBase: string;
  public $locale$: string;
  public qManifestHash: string;
  public rootVNode: ElementVNode;
  public document: QDocument;
  public $journal$: VNodeJournalEntry[] = [];
  public $subsManager$: SubscriptionManager;
  public renderDone: Promise<void> | null = Promise.resolve();
  public rendering: boolean = false;
  public $rawStateData$: any[];
  private stateData: any[];
  private $renderQueue$: Set<VirtualVNode> = new Set();
  constructor(element: ContainerElement) {
    this.qContainer = element.getAttribute(QContainerAttr)!;
    if (!this.qContainer) {
      throw new Error("Element must have 'q:container' attribute.");
    }
    this.document = element.ownerDocument as QDocument;
    this.element = element;
    this.qVersion = element.getAttribute('q:version')!;
    this.qBase = element.getAttribute('q:base')!;
    // this.containerState = createContainerState(element, this.qBase);
    this.$locale$ = element.getAttribute('q:locale')!;
    this.qManifestHash = element.getAttribute('q:manifest-hash')!;
    this.rootVNode = vnode_newUnMaterializedElement(null, this.element);
    // These are here to initialize all properties at once for single class transition
    this.$rawStateData$ = null!;
    this.stateData = null!;
    const document = this.element.ownerDocument as QDocument;
    if (!document.qVNodeData) {
      processVNodeData(document);
    }
    this.$rawStateData$ = [];
    this.stateData = [];
    const qwikStates = element.querySelectorAll('script[type="qwik/state"]');
    if (qwikStates.length !== 0) {
      const lastState = qwikStates[qwikStates.length - 1];
      this.$rawStateData$ = JSON.parse(lastState.textContent!);
      // NOTE: We want to deserialize the `rawStateData` so that we can cache the deserialized data.
      this.stateData = deserialize(this, this.$rawStateData$);
      // this.containerState.$pauseCtx$ = {
      //   getObject: (id: string) => {
      //     // console.log('getObject', id);
      //     return this.getObjectById(id);
      //   },
      //   meta: loggingProxy('meta', this.$rawStateData$),
      //   refs: loggingProxy('refs', {}),
      // };
    }
    this.$subsManager$ = createSubscriptionManager(this as fixMeAny);
  }
  getParentHost(host: HostElement): HostElement | null {
    let vNode = vnode_getParent(host as any);
    while (vNode) {
      if (vnode_isVirtualVNode(vNode) && vnode_getProp(vNode, OnRenderProp, null) !== null) {
        return vNode as any as HostElement;
      }
      vNode = vnode_getParent(vNode);
    }
    return null;
  }

  setHostProp<T>(host: HostElement, name: string, value: T): void {
    const vNode: VirtualVNode = host as any;
    vnode_setProp(vNode, name, value);
  }

  getHostProp<T>(host: HostElement, name: string): T | null {
    const vNode: VirtualVNode = host as any;
    let getObjectById: ((id: string) => any) | null = null;
    switch (name) {
      case ELEMENT_SEQ:
      case ELEMENT_PROPS:
      case OnRenderProp:
      case QCtxAttr:
        getObjectById = this.getObjectById;
        break;
      case ':seqIdx':
        getObjectById = parseInt;
        break;
    }
    return vnode_getProp(vNode, name, getObjectById);
  }

  markForRender(hostElement: VirtualVNode): void {
    this.$renderQueue$.add(hostElement);
    if (!this.rendering) {
      this.rendering = true;
      this.renderDone = getPlatform().nextTick(() => this.renderMarked());
    }
  }

  private async renderMarked() {
    const components = Array.from(this.$renderQueue$);
    this.$renderQueue$.clear();
    components.sort(vnode_documentPosition);
    maybeThenMap(
      components,
      (host) =>
        maybeThen(executeComponent2(this, host, null, null), (jsx) => vnode_diff(this, jsx, host)),
      () => {
        vnode_applyJournal(this.$journal$);
        this.rendering = false;
      }
    );
  }

  getObjectById = (id: number | string): any => {
    if (typeof id === 'string') {
      id = parseFloat(id);
    }
    assertTrue(id < this.$rawStateData$.length, 'Invalid reference');
    return this.stateData[id];
  };
}

export function processVNodeData(document: Document) {
  const qDocument = document as QDocument;
  const vNodeDataMap =
    qDocument.qVNodeData || (qDocument.qVNodeData = new WeakMap<Element, string>());
  const vNodeData = document.querySelectorAll('script[type="qwik/vnode"]');
  if (vNodeData.length === 0) {
    return;
  }
  const containers = document.querySelectorAll('[q\\:container]');
  const containerElement = containers[0] as ContainerElement;
  const qVNodeRefs = (containerElement.qVNodeRefs = new Map<number, Element | ElementVNode>());
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
        let depth = 0;
        while (true as boolean) {
          // look for the end of VNodeData
          if (vNodeDataEnd < currentVNodeDataLength) {
            ch = currentVNodeData.charCodeAt(vNodeDataEnd);
            if (depth === 0 && isSeparator(ch)) {
              break;
            } else {
              if (ch === 123 /* `{` */) {
                depth++;
              } else if (ch === 125 /* `}` */) {
                depth--;
              }
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

