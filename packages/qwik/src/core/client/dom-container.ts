/** @file Public APIs for the SSR */

import { assertTrue } from '../shared/error/assert';
import { getPlatform } from '../shared/platform/platform';
import type { QRL } from '../shared/qrl/qrl.public';
import { ERROR_CONTEXT, isRecoverable } from '../shared/error/error-handling';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import type { ContextId } from '../use/use-context';
import { EMPTY_ARRAY } from '../shared/utils/flyweight';
import { throwErrorAndStop } from '../shared/utils/log';
import {
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  ELEMENT_SEQ_IDX,
  getQFuncs,
  OnRenderProp,
  Q_PROPS_SEPARATOR,
  QBaseAttr,
  QContainerAttr,
  QContainerSelector,
  QCtxAttr,
  QInstanceAttr,
  QScopedStyle,
  QSlotParent,
  QStyle,
  QStyleSelector,
  QSubscribers,
  USE_ON_LOCAL_SEQ_IDX,
} from '../shared/utils/markers';
import { isPromise } from '../shared/utils/promises';
import { isSlotProp } from '../shared/utils/prop';
import { qDev } from '../shared/utils/qdev';
import type { ValueOrPromise } from '../shared/utils/types';
import { ChoreType } from '../shared/scheduler';
import {
  addComponentStylePrefix,
  convertScopedStyleIdsToArray,
  convertStyleIdsToString,
} from '../shared/utils/scoped-styles';
import { _SharedContainer } from '../shared/shared-container';
import { inflateQRL, parseQRL, wrapDeserializerProxy } from '../shared/shared-serialization';
import { type HostElement, type ObjToProxyMap } from '../shared/types';
import { processVNodeData } from './process-vnode-data';
import {
  VNodeFlags,
  VNodeProps,
  type ContainerElement,
  type ElementVNode,
  type ClientContainer as IClientContainer,
  type QDocument,
  type VNode,
  type VirtualVNode,
} from './types';
import {
  VNodeJournalOpCode,
  mapArray_get,
  mapArray_set,
  vnode_applyJournal,
  vnode_getDOMChildNodes,
  vnode_getDomParent,
  vnode_getParent,
  vnode_getProp,
  vnode_getPropStartIndex,
  vnode_insertBefore,
  vnode_isVirtualVNode,
  vnode_locate,
  vnode_newElement,
  vnode_newUnMaterializedElement,
  vnode_setProp,
  type VNodeJournal,
} from './vnode';
import { vnode_diff } from './vnode-diff';

/** @public */
export function getDomContainer(element: Element | VNode): IClientContainer {
  const qContainerElement = _getQContainerElement(element);
  if (!qContainerElement) {
    throwErrorAndStop('Unable to find q:container.');
  }
  return getDomContainerFromQContainerElement(qContainerElement!);
}

export function getDomContainerFromQContainerElement(qContainerElement: Element): IClientContainer {
  const qElement = qContainerElement as ContainerElement;
  let container = qElement.qContainer;
  if (!container) {
    container = new DomContainer(qElement);

    const containerAttributes: Record<string, string> = {};
    if (qElement) {
      const attrs = qElement.attributes;
      if (attrs) {
        for (let index = 0; index < attrs.length; index++) {
          const attr = attrs[index];
          if (attr.name === Q_PROPS_SEPARATOR) {
            continue;
          }
          containerAttributes[attr.name] = attr.value;
        }
      }
    }
    (container as DomContainer).$serverData$ = { containerAttributes };
    qElement.qContainer = container;
  }
  return container;
}

/** @internal */
export function _getQContainerElement(element: Element | VNode): Element | null {
  const qContainerElement: Element | null = Array.isArray(element)
    ? (vnode_getDomParent(element) as Element)
    : element;
  return qContainerElement.closest(QContainerSelector);
}

export const isDomContainer = (container: any): container is DomContainer => {
  return container instanceof DomContainer;
};

/** @internal */
export class DomContainer extends _SharedContainer implements IClientContainer {
  public element: ContainerElement;
  public qContainer: string;
  public qBase: string;
  public qManifestHash: string;
  public rootVNode: ElementVNode;
  public document: QDocument;
  public $journal$: VNodeJournal;
  public renderDone: Promise<void> | null = null;
  public $rawStateData$: unknown[];
  public $storeProxyMap$: ObjToProxyMap = new WeakMap();
  public $qFuncs$: Array<(...args: unknown[]) => unknown>;
  public $instanceHash$: string;

  private stateData: unknown[];
  private $styleIds$: Set<string> | null = null;
  private $vnodeLocate$: (id: string) => VNode = (id) => vnode_locate(this.rootVNode, id);
  private $renderCount$ = 0;

  constructor(element: ContainerElement) {
    super(
      () => this.scheduleRender(),
      () => vnode_applyJournal(this.$journal$),
      {},
      element.getAttribute('q:locale')!
    );
    this.qContainer = element.getAttribute(QContainerAttr)!;
    if (!this.qContainer) {
      throwErrorAndStop("Element must have 'q:container' attribute.");
    }
    this.$journal$ = [
      // The first time we render we need to hoist the styles.
      // (Meaning we need to move all styles from component inline to <head>)
      // We bulk move all of the styles, because the expensive part is
      // for the browser to recompute the styles, (not the actual DOM manipulation.)
      // By moving all of them at once we can minimize the reflow.
      VNodeJournalOpCode.HoistStyles,
      element.ownerDocument,
    ];
    this.document = element.ownerDocument as QDocument;
    this.element = element;
    this.qBase = element.getAttribute(QBaseAttr)!;
    this.$instanceHash$ = element.getAttribute(QInstanceAttr)!;
    // this.containerState = createContainerState(element, this.qBase);
    this.qManifestHash = element.getAttribute('q:manifest-hash')!;
    this.rootVNode = vnode_newUnMaterializedElement(this.element);
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
      this.stateData = wrapDeserializerProxy(this, this.$rawStateData$) as unknown[];
    }
    this.$qFuncs$ = getQFuncs(document, this.$instanceHash$) || EMPTY_ARRAY;
  }

  $setRawState$(id: number, vParent: ElementVNode | VirtualVNode): void {
    this.stateData[id] = vParent;
  }

  parseQRL<T = unknown>(qrl: string): QRL<T> {
    return inflateQRL(this, parseQRL(qrl)) as QRL<T>;
  }

  processJsx(host: HostElement, jsx: JSXOutput): ValueOrPromise<void> {
    // console.log('>>>> processJsx', String(host));
    const styleScopedId = this.getHostProp<string>(host, QScopedStyle);
    return vnode_diff(this, jsx, host as VirtualVNode, addComponentStylePrefix(styleScopedId));
  }

  handleError(err: any, host: HostElement): void {
    if (qDev) {
      // Clean vdom
      if (typeof document !== 'undefined') {
        const vHost = host as VirtualVNode;
        const errorDiv = document.createElement('errored-host');
        if (err && err instanceof Error) {
          (errorDiv as any).props = { error: err };
        }
        errorDiv.setAttribute('q:key', '_error_');
        const journal: VNodeJournal = [];
        vnode_getDOMChildNodes(journal, vHost).forEach((child) => errorDiv.appendChild(child));
        const vErrorDiv = vnode_newElement(errorDiv, 'error-host');
        vnode_insertBefore(journal, vHost, vErrorDiv, null);
        vnode_applyJournal(journal);
      }

      if (err && err instanceof Error) {
        if (!('hostElement' in err)) {
          (err as any)['hostElement'] = host;
        }
      }
      if (!isRecoverable(err)) {
        throw err;
      }
    }
    const errorStore = this.resolveContext(host, ERROR_CONTEXT);
    if (!errorStore) {
      throw err;
    }
    errorStore.error = err;
  }

  setContext<T>(host: HostElement, context: ContextId<T>, value: T): void {
    let ctx = this.getHostProp<Array<string | unknown>>(host, QCtxAttr);
    if (!ctx) {
      this.setHostProp(host, QCtxAttr, (ctx = []));
    }
    mapArray_set(ctx, context.id, value, 0);
  }

  resolveContext<T>(host: HostElement, contextId: ContextId<T>): T | undefined {
    while (host) {
      const ctx = this.getHostProp<Array<string | unknown>>(host, QCtxAttr);
      if (ctx) {
        const value = mapArray_get(ctx, contextId.id, 0) as T;
        if (value) {
          return value as T;
        }
      }
      host = this.getParentHost(host)!;
    }
    return undefined;
  }

  getParentHost(host: HostElement): HostElement | null {
    let vNode = vnode_getParent(host as any);
    while (vNode) {
      if (vnode_isVirtualVNode(vNode)) {
        if (vnode_getProp(vNode, OnRenderProp, null) !== null) {
          return vNode as any as HostElement;
        }
        // If virtual node, than it could be a slot so we need to read its parent.
        const parent = vnode_getProp<VNode>(vNode, QSlotParent, this.$vnodeLocate$);
        if (parent) {
          vNode = parent;
          continue;
        }
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
      case QSubscribers:
        getObjectById = this.$getObjectById$;
        break;
      case ELEMENT_SEQ_IDX:
      case USE_ON_LOCAL_SEQ_IDX:
        getObjectById = parseInt;
        break;
    }
    return vnode_getProp(vNode, name, getObjectById);
  }

  scheduleRender() {
    this.$renderCount$++;
    this.renderDone ||= getPlatform().nextTick(() => this.processChores());
    return this.renderDone;
  }

  private processChores() {
    let renderCount = this.$renderCount$;
    const result = this.$scheduler$(ChoreType.WAIT_FOR_ALL);
    if (isPromise(result)) {
      return result.then(async () => {
        while (renderCount !== this.$renderCount$) {
          renderCount = this.$renderCount$;
          await this.$scheduler$(ChoreType.WAIT_FOR_ALL);
        }
        this.renderDone = null;
      });
    }
    if (renderCount !== this.$renderCount$) {
      this.processChores();
      return;
    }
    this.renderDone = null;
  }

  ensureProjectionResolved(vNode: VirtualVNode): void {
    if ((vNode[VNodeProps.flags] & VNodeFlags.Resolved) === 0) {
      vNode[VNodeProps.flags] |= VNodeFlags.Resolved;
      for (let i = vnode_getPropStartIndex(vNode); i < vNode.length; i = i + 2) {
        const prop = vNode[i] as string;
        if (isSlotProp(prop)) {
          const value = vNode[i + 1];
          if (typeof value == 'string') {
            vNode[i + 1] = this.$vnodeLocate$(value);
          }
        }
      }
    }
  }

  $getObjectById$ = (id: number | string): unknown => {
    if (typeof id === 'string') {
      id = parseFloat(id);
    }
    assertTrue(
      id < this.$rawStateData$.length / 2,
      `Invalid reference: ${id} >= ${this.$rawStateData$.length / 2}`
    );
    return this.stateData[id];
  };

  getSyncFn(id: number): (...args: unknown[]) => unknown {
    const fn = this.$qFuncs$[id];
    assertTrue(typeof fn === 'function', 'Invalid reference: ' + id);
    return fn;
  }

  $appendStyle$(content: string, styleId: string, host: VirtualVNode, scoped: boolean): void {
    if (scoped) {
      const scopedStyleIdsString = this.getHostProp<string>(host, QScopedStyle);
      const scopedStyleIds = new Set(convertScopedStyleIdsToArray(scopedStyleIdsString));
      scopedStyleIds.add(styleId);
      this.setHostProp(host, QScopedStyle, convertStyleIdsToString(scopedStyleIds));
    }

    if (this.$styleIds$ == null) {
      this.$styleIds$ = new Set();
      this.element.querySelectorAll(QStyleSelector).forEach((style) => {
        this.$styleIds$!.add(style.getAttribute(QStyle)!);
      });
    }
    if (!this.$styleIds$.has(styleId)) {
      this.$styleIds$.add(styleId);
      const styleElement = this.document.createElement('style');
      styleElement.setAttribute(QStyle, styleId);
      styleElement.textContent = content;
      this.$journal$.push(VNodeJournalOpCode.Insert, this.document.head, null, styleElement);
    }
  }
}
