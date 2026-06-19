/** @file Public APIs for the SSR */

import { isDev } from '@qwik.dev/core/build';
import type { QRLInternal } from '../../server/qwik-types';
import { assertTrue } from '../shared/error/assert';
import { QError, qError } from '../shared/error/error';
import { ERROR_CONTEXT, isRecoverable } from '../shared/error/error-handling';
import type { QRL } from '../shared/qrl/qrl.public';
import { wrapDeserializerProxy } from '../shared/serdes/deser-proxy';
import { getObjectById, parseQRL, preprocessState } from '../shared/serdes/index';
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
  QCursorBoundary,
  QCtxAttr,
  QInstanceAttr,
  QLocaleAttr,
  QManifestHashAttr,
  QScopedStyle,
  QStatePatchAttrSelector,
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
import { setErrorPayload } from '../shared/cursor/chore-execution';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import type { VNode } from '../shared/vnode/vnode';
import type { ContextId } from '../use/use-context';
import { processSegmentStateScripts } from './process-segment-state';
import { processOutOfOrderSegmentVNodeData, processVNodeData } from './process-vnode-data';
import {
  VNodeFlags,
  type ContainerElement,
  type ClientContainer as IClientContainer,
  type QDocument,
} from './types';
import { mapArray_get, mapArray_has, mapArray_set } from './util-mapArray';
import {
  vnode_getProp,
  vnode_isVirtualVNode,
  vnode_locate,
  vnode_newUnMaterializedElement,
  vnode_setProp,
} from './vnode-utils';

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

function getOutOfOrderStreamingScript(boundaryId: number, content: Element | null) {
  const segmentId = String(boundaryId);
  const qContainerElement = content?.closest(QContainerSelector) as ContainerElement | null;
  const qContainer = qContainerElement?.qContainer as DomContainer | undefined;
  if (qContainer) {
    processOutOfOrderSegmentVNodeData(qContainer.element.ownerDocument, segmentId, content);
    processSegmentStateScripts(qContainer, segmentId);
  }
}

/** @internal */
export class DomContainer extends _SharedContainer implements IClientContainer {
  public element: ContainerElement;
  public qContainer: string;
  public qManifestHash: string;
  public rootVNode: ElementVNode;
  public document: QDocument;
  public $storeProxyMap$: ObjToProxyMap = new WeakMap();
  public $qFuncs$: Array<(...args: unknown[]) => unknown>;
  public $instanceHash$: string;
  public $forwardRefs$: Array<number | string> | null = null;
  public vNodeLocate: (id: string | Element) => VNode = (id) => vnode_locate(this.rootVNode, id);

  private $rawStateData$: unknown[];
  private $stateData$: unknown[];
  private $rootForwardRefs$: Array<number | string> | null = null;
  private $styleIds$: Set<string> | null = null;
  private $qErrorHandler$: ((e: Event) => void) | null = null;

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
    if (!document.qVNodeDataProcessed) {
      processVNodeData(document);
    }
    if (__EXPERIMENTAL__.suspense && document.querySelector('template[q\\:r]')) {
      document.qProcessOOOS ||= getOutOfOrderStreamingScript;
    }
    this.$qFuncs$ = getQFuncs(document, this.$instanceHash$) || EMPTY_ARRAY;
    this.$setServerData$();
    element.setAttribute(QContainerAttr, QContainerValue.RESUMED);
    element.qContainer = this;
    (element as any).qDestroy = () => this.$destroy$();
    this.$processRootStateScript$();
    if (__EXPERIMENTAL__.suspense) {
      processSegmentStateScripts(this);
    }
    this.$hoistStyles$();
    // Route async errors (a failed QRL import/handler emits a `qerror` event) to the CLOSEST
    // ErrorBoundary, matching the synchronous render-throw path. Previously each ErrorBoundary
    // listened to the global event and every one of them caught every error regardless of source.
    this.$qErrorHandler$ = (e: Event) => {
      const detail = (e as CustomEvent<{ error: unknown; element?: Element }>).detail;
      const source = detail?.element;
      if (source && this.element.contains(source)) {
        const host = this.vNodeLocate(source);
        if (host) {
          this.handleError(detail.error, host);
        }
      }
    };
    document.addEventListener?.('qerror', this.$qErrorHandler$);
    if (!qTest && element.isConnected) {
      element.dispatchEvent(new CustomEvent('qresume', { bubbles: true }));
    }
  }

  /** Tear down this container so stale references fail gracefully. */
  $destroy$(): void {
    if (this.$qErrorHandler$) {
      this.document.removeEventListener?.('qerror', this.$qErrorHandler$);
      this.$qErrorHandler$ = null;
    }
    this.vNodeLocate = () => null as any;
    this.$rawStateData$.length = 0;
    this.$stateData$.length = 0;
    this.$getObjectById$ = () => undefined;
    const el = this.element;
    el.qContainer = undefined;
    el.qVnodeData = undefined;
    el.qVNodeRefs = undefined;
    if (__EXPERIMENTAL__.suspense) {
      el.qSegmentVnodeData = undefined;
    }
    el.removeAttribute(QContainerAttr);
    const document = el.ownerDocument as QDocument;
    const hasContainers = document.querySelector(QContainerSelector) !== null;
    if (!hasContainers) {
      document.qVNodeData = undefined!;
      document.qVNodeDataProcessed = undefined;
      document.qProcessVNodeDataPatch = undefined;
    }
    if (__EXPERIMENTAL__.suspense) {
      if (!hasContainers) {
        document.qProcessOOOS = undefined;
      }
    }
  }

  private $processRootStateScript$(): void {
    const rootState = this.element.querySelector(
      `${this.$stateScriptSelector$()}:not(${QStatePatchAttrSelector})`
    );
    if (rootState) {
      this.$rawStateData$ = JSON.parse(rootState.textContent!);
      preprocessState(this.$rawStateData$, this);
      this.$rootForwardRefs$ = this.$forwardRefs$;
      this.$stateData$ = wrapDeserializerProxy(this, this.$rawStateData$) as unknown[];
    }
  }

  private $stateScriptSelector$(): string {
    return `script[type="qwik/state"][q\\:instance="${this.$instanceHash$}"]`;
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
    const styles = document.body.querySelectorAll(QStylesAllSelector);
    const styleTagCount = styles.length;
    if (styleTagCount) {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < styleTagCount; i++) {
        fragment.appendChild(styles[i]);
      }
      head.appendChild(fragment);
    }
  }

  $setRawState$(id: number, vParent: VNode): void {
    this.$stateData$[id] = vParent;
  }

  parseQRL<T = unknown>(qrlStr: string): QRL<T> {
    const qrl = parseQRL(qrlStr, this) as QRLInternal<T>;
    return qrl;
  }

  handleError(err: any, host: VNode | null): void {
    const errorStore = host && this.resolveContext(host, ERROR_CONTEXT);
    // Re-entrancy guard: if the closest boundary already holds an error, a further throw — e.g. the
    // boundary's own fallback render failing — must NOT re-trigger it. Otherwise handleError loops
    // forever (set error → re-render → fallback throws → handleError → ...). Propagate instead, so a
    // throwing fallback surfaces (or reaches a parent boundary) rather than hanging the tab.
    // `!= null` covers both store init sentinels: `<ErrorBoundary>` uses `undefined`, the generic
    // ERROR_CONTEXT path uses `null` — neither counts as "already errored".
    if (errorStore && errorStore.error != null) {
      throw err;
    }
    if (qDev && host) {
      if (typeof document !== 'undefined') {
        setErrorPayload(host, err);
        markVNodeDirty(this, host, ChoreBits.ERROR_WRAP);
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
    if (!errorStore) {
      throw err;
    }
    // Distinguish a re-rendering `<ErrorBoundary>` from a generic ERROR_CONTEXT consumer that only
    // captures the error: a boundary's store starts `error: undefined`, the generic path uses `null`
    // (the same init sentinel the re-entrancy guard above relies on). Only the boundary re-renders.
    const isErrorBoundary = errorStore.error === undefined;
    errorStore.error = err;
    // Re-render the boundary so it swaps to its fallback. An in-order boundary already re-renders from
    // the reactive write above (it read `store.error` during render, so it subscribed), but a boundary
    // streamed via out-of-order streaming returned its two-host structure early without reading
    // `store.error`, so the write alone only flips the inline style swap — revealing the still-empty
    // streamed fallback host. Marking the boundary host re-renders it to `fallback$` (a no-op when the
    // reactive write already marked it).
    if (isErrorBoundary && host) {
      const boundaryHost = this.resolveContextHost(host, ERROR_CONTEXT);
      if (boundaryHost) {
        markVNodeDirty(this, boundaryHost, ChoreBits.COMPONENT);
      }
    }
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

  /** Like `resolveContext`, but returns the host that provides the context, not its value. */
  resolveContextHost(host: VNode, contextId: ContextId<unknown>): VNode | null {
    while (host) {
      const ctx = this.getHostProp<Array<string | unknown>>(host, QCtxAttr);
      if (ctx != null && mapArray_has(ctx, contextId.id, 0)) {
        return host;
      }
      host = this.getParentHost(host)!;
    }
    return null;
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
      case QCursorBoundary:
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
        const propKeys = Object.keys(props);
        for (let i = 0; i < propKeys.length; i++) {
          const prop = propKeys[i];
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

  $getForwardRef$(id: number): number | string | undefined {
    return this.$rootForwardRefs$?.[id];
  }

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
      const styleElements = this.document.querySelectorAll(QStyleSelector);
      for (let i = 0; i < styleElements.length; i++) {
        const style = styleElements[i];
        this.$styleIds$.add(style.getAttribute(QStyle)!);
      }
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
