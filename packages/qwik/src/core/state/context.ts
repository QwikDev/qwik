import type { OnRenderFn } from '../component/component.public';
import { destroyTask, type SubscriberEffect } from '../use/use-task';
import type { QRLInternal } from '../qrl/qrl-class';
import type { QRL } from '../qrl/qrl.public';
import type { StyleAppend } from '../use/use-core';
import type { ProcessedJSXNode } from '../render/dom/render-dom';
import type { QwikElement, VirtualElement } from '../render/dom/virtual-element';
import { getProxyTarget, type SubscriptionManager } from './common';
import type { ContainerState } from '../container/container';
import { getDomListeners, type Listener } from './listeners';
import { seal } from '../util/qdev';
import { directGetAttribute } from '../render/fast-calls';
import { isElement } from '../../testing/html';
import { assertQwikElement } from '../error/assert';
import { QScopedStyle } from '../util/markers';
import { createPropsState, createProxy, setObjectFlags } from './store';
import { _IMMUTABLE, _IMMUTABLE_PREFIX, Q_CTX, QObjectImmutable } from './constants';

export interface QContextEvents {
  [eventName: string]: QRL | undefined;
}

export const HOST_FLAG_DIRTY = 1 << 0;
export const HOST_FLAG_NEED_ATTACH_LISTENER = 1 << 1;
export const HOST_FLAG_MOUNTED = 1 << 2;
export const HOST_FLAG_DYNAMIC = 1 << 3;
export const HOST_REMOVED = 1 << 4;

/** Qwik Context of an element. */
export interface QContext {
  /** VDOM element. */
  $element$: QwikElement;
  $refMap$: any[];
  $flags$: number;
  /** QId, for referenced components */
  $id$: string;
  /** Proxy for the component props */
  $props$: Record<string, any> | null;
  /** The QRL if this is `component$`-wrapped component. */
  $componentQrl$: QRLInternal<OnRenderFn<any>> | null;
  /** The event handlers for this element */
  li: Listener[];
  /** Sequential data store for hooks, managed by useSequentialScope. */
  $seq$: any[] | null;
  $tasks$: SubscriberEffect[] | null;
  /** The public contexts defined on this (always Virtual) component, managed by useContextProvider. */
  $contexts$: Map<string, any> | null;
  $appendStyles$: StyleAppend[] | null;
  $scopeIds$: string[] | null;
  $vdom$: ProcessedJSXNode | null;
  $slots$: ProcessedJSXNode[] | null;
  $dynamicSlots$: QContext[] | null;
  /**
   * The Qwik Context of the virtual parent component, null if no parent. For an real element, it's
   * the owner virtual component, and for a virtual component it's the wrapping virtual component.
   */
  $parentCtx$: QContext | null | undefined;
  /**
   * During SSR, separately store the actual parent of slotted components to correctly pause
   * subscriptions
   */
  $realParentCtx$: QContext | undefined;
}

export const tryGetContext = (element: QwikElement): QContext | undefined => {
  return (element as any)[Q_CTX];
};

export const getContext = (el: QwikElement, containerState: ContainerState): QContext => {
  assertQwikElement(el);
  const ctx = tryGetContext(el)!;
  if (ctx) {
    return ctx;
  }
  const elCtx = createContext(el);
  const elementID = directGetAttribute(el, 'q:id');
  if (elementID) {
    const pauseCtx = containerState.$pauseCtx$;
    elCtx.$id$ = elementID;
    if (pauseCtx) {
      const { getObject, meta, refs } = pauseCtx;
      if (isElement(el)) {
        const refMap = refs[elementID];
        if (refMap) {
          elCtx.$refMap$ = refMap.split(' ').map(getObject);
          elCtx.li = getDomListeners(elCtx, containerState.$containerEl$);
        }
      } else {
        const styleIds = el.getAttribute(QScopedStyle);
        elCtx.$scopeIds$ = styleIds ? styleIds.split('|') : null;

        const ctxMeta = meta[elementID];
        if (ctxMeta) {
          const seq = ctxMeta.s;
          const host = ctxMeta.h;
          const contexts = ctxMeta.c;
          const tasks = ctxMeta.w;
          if (seq) {
            elCtx.$seq$ = seq.split(' ').map(getObject);
          }
          if (tasks) {
            elCtx.$tasks$ = tasks.split(' ').map(getObject);
          }
          if (contexts) {
            elCtx.$contexts$ = new Map();
            for (const part of contexts.split(' ')) {
              const [key, value] = part.split('=');
              elCtx.$contexts$.set(key, getObject(value));
            }
          }

          // Restore sequence scoping
          if (host) {
            const [renderQrl, props] = host.split(' ') as [string | undefined, string | undefined];
            elCtx.$flags$ = HOST_FLAG_MOUNTED;
            if (renderQrl) {
              elCtx.$componentQrl$ = getObject(renderQrl);
            }
            if (props) {
              const propsObj = getObject(props);
              elCtx.$props$ = propsObj;
              setObjectFlags(propsObj, QObjectImmutable);
              propsObj[_IMMUTABLE] = getImmutableFromProps(propsObj);
            } else {
              elCtx.$props$ = createProxy(createPropsState(), containerState);
            }
          }
        }
      }
    }
  }

  return elCtx;
};

const getImmutableFromProps = (props: Record<string, any>): Record<string, any> => {
  const immutable: Record<string, any> = {};
  const target = getProxyTarget(props);
  for (const key in target) {
    if (key.startsWith(_IMMUTABLE_PREFIX)) {
      immutable[key.slice(_IMMUTABLE_PREFIX.length)] = target[key];
    }
  }
  return immutable;
};

export const createContext = (element: Element | VirtualElement): QContext => {
  const ctx = {
    $flags$: 0,
    $id$: '',
    $element$: element,
    $refMap$: [],
    li: [],
    $tasks$: null,
    $seq$: null,
    $slots$: null,
    $scopeIds$: null,
    $appendStyles$: null,
    $props$: null,
    $vdom$: null,
    $componentQrl$: null,
    $contexts$: null,
    $dynamicSlots$: null,
    $parentCtx$: undefined,
    $realParentCtx$: undefined,
  } as QContext;
  seal(ctx);
  (element as any)[Q_CTX] = ctx;
  return ctx;
};

export const cleanupContext = (elCtx: QContext, subsManager: SubscriptionManager) => {
  elCtx.$tasks$?.forEach((task) => {
    subsManager.$clearSub$(task);
    destroyTask(task);
  });
  elCtx.$componentQrl$ = null;
  elCtx.$seq$ = null;
  elCtx.$tasks$ = null;
};
