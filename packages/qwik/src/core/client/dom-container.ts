/** @file Public APIs for the SSR */

// @ts-expect-error we don't have types for the preloader
import { p as preload } from '@qwik.dev/core/preloader';
import { assertTrue } from '../shared/error/assert';
import { QError, qError } from '../shared/error/error';
import { ERROR_CONTEXT, isRecoverable } from '../shared/error/error-handling';
import type { QRL } from '../shared/qrl/qrl.public';
import { wrapDeserializerProxy } from '../shared/serdes/deser-proxy';
import { _inflateQRL, getObjectById, parseQRL, preprocessState } from '../shared/serdes/index';
import { _SharedContainer } from '../shared/shared-container';
import { QContainerValue, type HostElement, type ObjToProxyMap } from '../shared/types';
import { EMPTY_ARRAY } from '../shared/utils/flyweight';
import {
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  ELEMENT_SEQ_IDX,
  OnRenderProp,
  QBackRefs,
  QBaseAttr,
  QContainerAttr,
  QContainerSelector,
  QCtxAttr,
  QInstanceAttr,
  QLocaleAttr,
  QManifestHashAttr,
  QScopedStyle,
  QStyle,
  QStyleSelector,
  QStylesAllSelector,
  Q_PROPS_SEPARATOR,
  USE_ON_LOCAL_SEQ_IDX,
  getQFuncs,
} from '../shared/utils/markers';
import { isSlotProp } from '../shared/utils/prop';
import { qDev, qTest } from '../shared/utils/qdev';
import {
  convertScopedStyleIdsToArray,
  convertStyleIdsToString,
} from '../shared/utils/scoped-styles';
import type { ContextId } from '../use/use-context';
import { processVNodeData } from './process-vnode-data';
import {
  VNodeFlags,
  type ContainerElement,
  type ClientContainer as IClientContainer,
  type QDocument,
} from './types';
import { mapArray_get, mapArray_has, mapArray_set } from './util-mapArray';
import {
  vnode_createErrorDiv,
  vnode_getProp,
  vnode_insertBefore,
  vnode_isElementVNode,
  vnode_isVirtualVNode,
  vnode_locate,
  vnode_newUnMaterializedElement,
  vnode_setProp,
  type VNodeJournal,
} from './vnode-utils';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import type { VNode } from '../shared/vnode/vnode';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import { _jsxSorted } from '../internal';
import { isDev } from '@qwik.dev/core/build';

/** @public */
export function getDomContainer(element: Element): IClientContainer {
  const qContainerElement = _getQContainerElement(element);
  if (!qContainerElement) {
    throw qError(QError.containerNotFound);
  }
  return getDomContainerFromQContainerElement(qContainerElement!);
}

export function getDomContainerFromQContainerElement(qContainerElement: Element): IClientContainer {
  const qElement = qContainerElement as ContainerElement;
  return (qElement.qContainer ||= new DomContainer(qElement));
}

/** @internal */
export function _getQContainerElement(element: Element): Element | null {
  return element.closest(QContainerSelector);
}

export const isDomContainer = (container: any): container is DomContainer => {
  return container instanceof DomContainer;
};

/** @internal */
export class DomContainer extends _SharedContainer implements IClientContainer {
  public element: ContainerElement;
  public qContainer: string;
  public qManifestHash: string;
  public rootVNode: ElementVNode;
  public document: QDocument;
  public $rawStateData$: unknown[];
  public $storeProxyMap$: ObjToProxyMap = new WeakMap();
  public $qFuncs$: Array<(...args: unknown[]) => unknown>;
  public $instanceHash$: string;
  public $forwardRefs$: Array<number> | null = null;
  public vNodeLocate: (id: string | Element) => VNode = (id) => vnode_locate(this.rootVNode, id);

  private $stateData$: unknown[];
  private $styleIds$: Set<string> | null = null;

  constructor(element: ContainerElement) {
    super({}, element.getAttribute(QLocaleAttr)!);
    this.qContainer = element.getAttribute(QContainerAttr)!;
    if (!this.qContainer) {
      throw qError(QError.elementWithoutContainer);
    }
    this.document = element.ownerDocument as QDocument;
    this.element = element;
    this.$buildBase$ = element.getAttribute(QBaseAttr)!;
    this.$instanceHash$ = element.getAttribute(QInstanceAttr)!;
    this.qManifestHash = element.getAttribute(QManifestHashAttr)!;
    this.rootVNode = vnode_newUnMaterializedElement(this.element);
    this.$rawStateData$ = [];
    this.$stateData$ = [];
    const document = this.element.ownerDocument as QDocument;
    if (!document.qVNodeData) {
      processVNodeData(document);
    }
    this.$qFuncs$ = getQFuncs(document, this.$instanceHash$) || EMPTY_ARRAY;
    this.$setServerData$();
    element.setAttribute(QContainerAttr, QContainerValue.RESUMED);
    element.qContainer = this;
    const qwikStates = element.querySelectorAll('script[type="qwik/state"]');
    if (qwikStates.length !== 0) {
      const lastState = qwikStates[qwikStates.length - 1];
      this.$rawStateData$ = JSON.parse(lastState.textContent!);
      preprocessState(this.$rawStateData$, this);
      this.$stateData$ = wrapDeserializerProxy(this, this.$rawStateData$) as unknown[];
    }
    this.$hoistStyles$();
    if (!qTest && element.isConnected) {
      element.dispatchEvent(new CustomEvent('qresume', { bubbles: true }));
    }
  }

  /**
   * The first time we render we need to hoist the styles. (Meaning we need to move all styles from
   * component inline to <head>)
   *
   * We bulk move all of the styles, because the expensive part is for the browser to recompute the
   * styles, (not the actual DOM manipulation.) By moving all of them at once we can minimize the
   * reflow.
   */
  $hoistStyles$(): void {
    const document = this.element.ownerDocument;
    const head = document.head;
    const styles = document.querySelectorAll(QStylesAllSelector);
    for (let i = 0; i < styles.length; i++) {
      head.appendChild(styles[i]);
    }
  }

  $setRawState$(id: number, vParent: VNode): void {
    this.$stateData$[id] = vParent;
  }

  parseQRL<T = unknown>(qrl: string): QRL<T> {
    return _inflateQRL(this, parseQRL(qrl)) as QRL<T>;
  }

  handleError(err: any, host: VNode | null): void {
    if (qDev && host) {
      if (typeof document !== 'undefined') {
        const createErrorWrapper = () => {
          const vHost = host;
          const vHostParent = vHost.parent;
          const vHostNextSibling = vHost.nextSibling as VNode | null;
          const journal: VNodeJournal = [];
          const vErrorDiv = vnode_createErrorDiv(journal, document, vHost, err);
          // If the host is an element node, we need to insert the error div into its parent.
          const insertHost = vnode_isElementVNode(vHost) ? vHostParent || vHost : vHost;
          // If the host is different then we need to insert errored-host in the same position as the host.
          const insertBefore = insertHost === vHost ? null : vHostNextSibling;
          vnode_insertBefore(
            journal,
            insertHost as ElementVNode | VirtualVNode,
            vErrorDiv,
            insertBefore
          );
        };
        this.$renderPromise$ ? this.$renderPromise$.then(createErrorWrapper) : createErrorWrapper();
      }

      if (err && err instanceof Error) {
        if (!('hostElement' in err)) {
          (err as any)['hostElement'] = String(host);
        }
      }
      if (!isRecoverable(err)) {
        throw err;
      }
    }
    const errorStore = host && this.resolveContext(host, ERROR_CONTEXT);
    if (!errorStore) {
      throw err;
    }
    errorStore.error = err;
  }

  setContext<T>(host: VNode, context: ContextId<T>, value: T): void {
    let ctx = this.getHostProp<Array<string | unknown>>(host, QCtxAttr);
    if (ctx == null) {
      this.setHostProp(host, QCtxAttr, (ctx = []));
    }
    mapArray_set(ctx, context.id, value, 0, true);
  }

  resolveContext<T>(host: VNode, contextId: ContextId<T>): T | undefined {
    while (host) {
      const ctx = this.getHostProp<Array<string | unknown>>(host, QCtxAttr);
      if (ctx != null && mapArray_has(ctx, contextId.id, 0)) {
        return mapArray_get(ctx, contextId.id, 0) as T;
      }
      host = this.getParentHost(host)!;
    }
    return undefined;
  }

  getParentHost(host: VNode): VNode | null {
    let vNode: VNode | null = host.parent;
    while (vNode) {
      if (vnode_isVirtualVNode(vNode)) {
        if (vnode_getProp(vNode, OnRenderProp, null) !== null) {
          return vNode;
        }
        vNode =
          vNode.parent ||
          // If virtual node, than it could be a slot so we need to read its parent.
          vNode.slotParent;
      } else {
        vNode = vNode.parent;
      }
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
      case QBackRefs:
        getObjectById = this.$getObjectById$;
        break;
      case ELEMENT_SEQ_IDX:
      case USE_ON_LOCAL_SEQ_IDX:
        getObjectById = parseInt;
        break;
    }
    return vnode_getProp(vNode, name, getObjectById);
  }

  ensureProjectionResolved(vNode: VirtualVNode): void {
    if ((vNode.flags & VNodeFlags.Resolved) === 0) {
      vNode.flags |= VNodeFlags.Resolved;
      const props = vNode.props;
      if (props) {
        for (const prop of Object.keys(props)) {
          if (isSlotProp(prop)) {
            const value = props[prop];
            if (typeof value == 'string') {
              const projection = this.vNodeLocate(value);
              props[prop] = projection;
            }
          }
        }
      }
    }
  }

  $getObjectById$ = (id: number | string): unknown => {
    return getObjectById(id, this.$stateData$);
  };

  getSyncFn(id: number): (...args: unknown[]) => unknown {
    const fn = this.$qFuncs$[id];
    isDev && assertTrue(typeof fn === 'function', 'Invalid reference: ' + id);
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
      this.document.head.appendChild(styleElement);
    }
  }

  // TODO: should be moved to the Qwik Router?
  /** Set the server data for the Qwik Router. */
  private $setServerData$(): void {
    const containerAttributes: Record<string, string> = {};
    const attrs = this.element.attributes;
    if (attrs) {
      for (let index = 0; index < attrs.length; index++) {
        const attr = attrs[index];
        if (attr.name === Q_PROPS_SEPARATOR) {
          continue;
        }
        containerAttributes[attr.name] = attr.value;
      }
    }
    this.$serverData$ = { containerAttributes };
  }
}
