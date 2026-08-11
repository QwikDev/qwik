/** @file Public APIs for the SSR */

import { isDev } from '@qwik.dev/core/build';
import type { QRLInternal } from '../../server/qwik-types';
import { assertTrue } from '../shared/error/assert';
import { QError, qError } from '../shared/error/error';
import { ERROR_CONTEXT, isRecoverable } from '../shared/error/error-handling';
import type { QRL } from '../shared/qrl/qrl.public';
import { wrapDeserializerProxy } from '../shared/serdes/deser-proxy';
import { eagerDeserializeStateIterator } from '../shared/serdes/inflate';
import { getObjectById, parseQRL } from '../shared/serdes/index';
import { preprocessStateIterator } from '../shared/serdes/preprocess-state';
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
  QStatePrewarmAttr,
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
import { processSegmentStateScriptsIterator } from './process-segment-state';
import {
  onVNodeDataReady,
  processOutOfOrderSegmentVNodeData,
  processVNodeData,
} from './process-vnode-data';
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
import { ContainerDataProcessState, processContainerStateData } from './process-state-data';
export { onContainerDataReady, whenContainerDataReady } from './process-state-data';

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
    const document = qContainer.element.ownerDocument;
    processOutOfOrderSegmentVNodeData(document, segmentId, content);
    onVNodeDataReady(document, () => {
      qContainer.element.qContainer === qContainer &&
        processContainerStateData(
          qContainer,
          processSegmentStateScriptsIterator(qContainer, segmentId)
        );
    });
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
  public $containerDataProcessState$ = ContainerDataProcessState.NotStarted;
  public $containerStateReadyCallbacks$: Array<() => void> | undefined = undefined;
  public $containerStateDataState$: unknown = undefined;

  private $rawStateData$: unknown[];
  private $stateData$: unknown[];
  private $rootForwardRefs$: Array<number | string> | null = null;
  private $styleIds$: Set<string> | null = null;

  constructor(element: ContainerElement) {
    super({}, element.getAttribute(QLocaleAttr)!);
    this.qContainer = element.getAttribute(QContainerAttr)!;
    if (!this.qContainer) {
      throw qError(QError.elementWithoutContainer);
    }
    const document = element.ownerDocument as QDocument;
    this.document = document;
    this.element = element;
    this.$buildBase$ = element.getAttribute(QBaseAttr)!;
    this.$instanceHash$ = element.getAttribute(QInstanceAttr)!;
    this.qManifestHash = element.getAttribute(QManifestHashAttr)!;
    this.rootVNode = vnode_newUnMaterializedElement(this.element);
    this.$rawStateData$ = [];
    this.$stateData$ = [];
    if (__EXPERIMENTAL__.suspense && document.querySelector('template[q\\:r]')) {
      document.qProcessOOOS ||= getOutOfOrderStreamingScript;
    }
    this.$qFuncs$ = getQFuncs(document, this.$instanceHash$) || EMPTY_ARRAY;
    this.$setServerData$();
    element.qContainer = this;
    element.qDestroy = () => this.$destroy$();
    this.$containerDataProcessState$ = ContainerDataProcessState.ProcessingVNode;
    processVNodeData(document, element);
    onVNodeDataReady(document, () => {
      if (this.$containerDataProcessState$ === ContainerDataProcessState.ProcessingVNode) {
        processContainerStateData(this, this.$processContainerData$());
      }
    });
  }

  *$processContainerData$(): Generator<void, void, void> {
    const element = this.element;
    if (element.qContainer !== this) {
      return;
    }
    const rootState =
      element.querySelector(
        `script[type="qwik/state"][q\\:instance="${this.$instanceHash$}"]:not(${QStatePatchAttrSelector})`
      ) ||
      element.querySelector(
        `script[type="qwik/state"]:not([q\\:instance]):not(${QStatePatchAttrSelector})`
      );
    if (rootState) {
      this.$rawStateData$ = JSON.parse(rootState.textContent!);
      yield* preprocessStateIterator(this.$rawStateData$, this);
      this.$rootForwardRefs$ = this.$forwardRefs$;
      const rootCount = this.$rawStateData$.length / 2;
      const statePrewarm = element.getAttribute(QStatePrewarmAttr);
      if (statePrewarm !== null && rootCount > 0 && rootCount >= Number(statePrewarm)) {
        this.$stateData$ = yield* eagerDeserializeStateIterator(this, this.$rawStateData$);
      } else {
        this.$stateData$ = wrapDeserializerProxy(this, this.$rawStateData$) as unknown[];
      }
    }
    if (__EXPERIMENTAL__.suspense) {
      yield* processSegmentStateScriptsIterator(this);
    }
    this.$hoistStyles$();
    element.setAttribute(QContainerAttr, QContainerValue.RESUMED);
    if (!qTest && element.isConnected) {
      element.dispatchEvent(new CustomEvent('qresume', { bubbles: true }));
    }
  }

  /** Tear down this container so stale references fail gracefully. */
  $destroy$(): void {
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
    this.$containerStateDataState$ = undefined;
    this.$containerDataProcessState$ = ContainerDataProcessState.NotStarted;
    const hasContainers = document.querySelector(QContainerSelector) !== null;
    if (!hasContainers) {
      document.qVNodeData = undefined!;
      document.qVNodeDataStarted = undefined;
      document.qVNodeDataReady = undefined;
      document.qVNodeDataState = undefined;
      document.qVNodeDataCallbacks = undefined;
      document.qVNodeDataProcessed = undefined;
      document.qProcessVNodeDataPatch = undefined;
    }
    if (__EXPERIMENTAL__.suspense) {
      if (!hasContainers) {
        document.qProcessOOOS = undefined;
      }
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
