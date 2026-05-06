/** @file Public APIs for the SSR */

import { isDev } from '@qwik.dev/core/build';
import type { QRLInternal } from '../../server/qwik-types';
import { assertTrue } from '../shared/error/assert';
import { QError, qError } from '../shared/error/error';
import { ERROR_CONTEXT, isRecoverable } from '../shared/error/error-handling';
import { mergeExternalRootEffects } from '../control-flow/suspense-utils';
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
  QSegmentEffectsAttr,
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
import { processVNodeData } from './process-vnode-data';
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
  private $processedStatePatchScripts$: WeakSet<Element> = new WeakSet();
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
    document.qProcessVNodeData = processVNodeData;
    if (__EXPERIMENTAL__.suspense) {
      document.qProcessOOOS ||= (doc: Document) => {
        processVNodeData(doc);
        const containers = doc.querySelectorAll(QContainerSelector);
        for (let i = 0; i < containers.length; i++) {
          (containers[i] as ContainerElement).qContainer?.$processSegmentStateScripts$();
        }
      };
    }
    this.$qFuncs$ = getQFuncs(document, this.$instanceHash$) || EMPTY_ARRAY;
    this.$setServerData$();
    element.setAttribute(QContainerAttr, QContainerValue.RESUMED);
    element.qContainer = this;
    (element as any).qDestroy = () => this.$destroy$();
    this.$processRootStateScript$();
    if (__EXPERIMENTAL__.suspense) {
      this.$processSegmentStateScripts$();
    }
    this.$hoistStyles$();
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
      el.qSegmentVnodeOffsets = undefined;
    }
    el.removeAttribute(QContainerAttr);
    const document = el.ownerDocument as QDocument;
    const hasContainers = document.querySelector(QContainerSelector) !== null;
    if (!hasContainers) {
      document.qVNodeData = undefined!;
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

  $processSegmentStateScripts$(): void {
    if (!__EXPERIMENTAL__.suspense) {
      return;
    }
    const qwikStates = this.element.querySelectorAll(
      `${this.$stateScriptSelector$()}${QStatePatchAttrSelector}`
    );
    for (let i = 0; i < qwikStates.length; i++) {
      const stateScript = qwikStates[i];
      if (this.$processedStatePatchScripts$.has(stateScript)) {
        continue;
      }
      this.$processedStatePatchScripts$.add(stateScript);
      this.$processStatePatch$(
        stateScript.textContent,
        stateScript.getAttribute(QSegmentEffectsAttr)
      );
    }
  }

  private $processStatePatch$(
    textContent: string | null,
    externalRootEffectsIndex: string | null
  ): void {
    if (!__EXPERIMENTAL__.suspense) {
      return;
    }
    if (textContent) {
      const [rootStart, rawStateData, forwardRefs] = JSON.parse(textContent) as [
        number,
        unknown[],
        Array<number | string> | undefined,
      ];
      this.$appendStatePatchRoots$(rootStart, rawStateData);
      this.$mergeForwardRefs$(forwardRefs);
    }
    mergeExternalRootEffects(this, this.$stateData$, externalRootEffectsIndex);
  }

  private $appendStatePatchRoots$(rootStart: number, rawStateData: unknown[]): void {
    const currentRootCount = this.$rawStateData$.length / 2;
    if (rootStart !== currentRootCount) {
      if (qDev) {
        throw new Error(
          `Invalid Qwik state patch root start: expected ${currentRootCount}, received ${rootStart}.`
        );
      }
      return;
    }
    for (let i = 0; i < rawStateData.length; i++) {
      this.$rawStateData$[rootStart * 2 + i] = rawStateData[i];
    }
    preprocessState(this.$rawStateData$, this, undefined, rootStart * 2);
    this.$stateData$ = wrapDeserializerProxy(this, this.$rawStateData$) as unknown[];
    this.$stateData$.length = this.$rawStateData$.length / 2;
    this.$rootForwardRefs$ = this.$forwardRefs$;
  }

  private $mergeForwardRefs$(forwardRefs: Array<number | string> | undefined): void {
    if (!forwardRefs) {
      return;
    }
    const rootForwardRefs = (this.$rootForwardRefs$ ||= []);
    for (let i = 0; i < forwardRefs.length; i++) {
      const ref = forwardRefs[i];
      if (ref !== -1 && ref !== undefined) {
        rootForwardRefs[i] = ref;
      }
    }
    this.$forwardRefs$ = rootForwardRefs;
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

  $setRawState$(id: number | string, vParent: VNode, _segmentId?: string | null): void {
    let stateId: number;

    if (typeof id === 'string') {
      stateId = Number(id);
    } else {
      stateId = id;
    }

    this.$stateData$[stateId] = vParent;
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

  $getForwardRef$(id: number | string): number | string | undefined {
    return this.$rootForwardRefs$?.[Number(id)];
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
