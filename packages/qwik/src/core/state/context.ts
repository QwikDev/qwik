import type { OnRenderFn } from '../component/component.public';
import { destroyWatch, SubscriberEffect } from '../use/use-task';
import type { QRLInternal } from '../qrl/qrl-class';
import type { QRL } from '../qrl/qrl.public';
import type { StyleAppend } from '../use/use-core';
import type { ProcessedJSXNode } from '../render/dom/render-dom';
import type { QwikElement, VirtualElement } from '../render/dom/virtual-element';
import type { SubscriptionManager } from './common';
import type { ContainerState } from '../container/container';
import { getDomListeners, Listener } from './listeners';
import { seal } from '../util/qdev';
import { directGetAttribute } from '../render/fast-calls';
import { isElement } from '../../testing/html';
import { assertQwikElement } from '../util/element';
import { assertTrue } from '../error/assert';
import { QScopedStyle } from '../util/markers';
import { createPropsState, createProxy } from './store';

export const Q_CTX = '_qc_';

export interface QContextEvents {
  [eventName: string]: QRL | undefined;
}

export const HOST_FLAG_DIRTY = 1 << 0;
export const HOST_FLAG_NEED_ATTACH_LISTENER = 1 << 1;
export const HOST_FLAG_MOUNTED = 1 << 2;
export const HOST_FLAG_DYNAMIC = 1 << 3;

export interface QContext {
  $element$: QwikElement;
  $refMap$: any[];
  $flags$: number;
  $id$: string;
  $props$: Record<string, any> | null;
  $componentQrl$: QRLInternal<OnRenderFn<any>> | null;
  li: Listener[];
  $seq$: any[] | null;
  $watches$: SubscriberEffect[] | null;
  $contexts$: Map<string, any> | null;
  $appendStyles$: StyleAppend[] | null;
  $scopeIds$: string[] | null;
  $vdom$: ProcessedJSXNode | null;
  $slots$: ProcessedJSXNode[] | null;
  $dynamicSlots$: QContext[] | null;
  $parent$: QContext | null;
  $slotParent$: QContext | null;
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
          assertTrue(isElement(el), 'el must be an actual DOM element');
          elCtx.$refMap$ = refMap.split(' ').map(getObject);
          elCtx.li = getDomListeners(elCtx, containerState.$containerEl$);
        }
      } else {
        const ctxMeta = meta[elementID];
        if (ctxMeta) {
          const seq = ctxMeta.s;
          const host = ctxMeta.h;
          const contexts = ctxMeta.c;
          const watches = ctxMeta.w;
          if (seq) {
            elCtx.$seq$ = seq.split(' ').map(getObject);
          }
          if (watches) {
            elCtx.$watches$ = watches.split(' ').map(getObject);
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
            const styleIds = el.getAttribute(QScopedStyle);
            elCtx.$scopeIds$ = styleIds ? styleIds.split(' ') : null;
            elCtx.$flags$ = HOST_FLAG_MOUNTED;
            if (renderQrl) {
              elCtx.$componentQrl$ = getObject(renderQrl);
            }
            if (props) {
              elCtx.$props$ = getObject(props);
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

export const createContext = (element: Element | VirtualElement): QContext => {
  const ctx = {
    $flags$: 0,
    $id$: '',
    $element$: element,
    $refMap$: [],
    li: [],
    $watches$: null,
    $seq$: null,
    $slots$: null,
    $scopeIds$: null,
    $appendStyles$: null,
    $props$: null,
    $vdom$: null,
    $componentQrl$: null,
    $contexts$: null,
    $dynamicSlots$: null,
    $parent$: null,
    $slotParent$: null,
  };
  seal(ctx);
  (element as any)[Q_CTX] = ctx;
  return ctx;
};

export const cleanupContext = (elCtx: QContext, subsManager: SubscriptionManager) => {
  const el = elCtx.$element$;
  elCtx.$watches$?.forEach((watch) => {
    subsManager.$clearSub$(watch);
    destroyWatch(watch);
  });
  if (elCtx.$componentQrl$) {
    subsManager.$clearSub$(el);
  }
  elCtx.$componentQrl$ = null;
  elCtx.$seq$ = null;
  elCtx.$watches$ = null;
  elCtx.$flags$ = 0;

  (el as any)[Q_CTX] = undefined;
};
