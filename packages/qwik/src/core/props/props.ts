import { resumeContainer } from '../object/store';
import { QContainerAttr } from '../util/markers';
import type { OnRenderFn } from '../component/component.public';
import { destroyWatch, SubscriberEffect } from '../use/use-watch';
import { pauseContainer } from '../object/store';
import { qSerialize } from '../util/qdev';
import type { QRLInternal } from '../import/qrl-class';
import { directGetAttribute } from '../render/fast-calls';
import { assertDefined, assertTrue } from '../assert/assert';
import type { QRL } from '../import/qrl.public';
import type { StyleAppend } from '../use/use-core';
import { getContainerState, SubscriptionManager } from '../render/container';
import type { ProcessedJSXNode } from '../render/dom/render-dom';
import type { QwikElement, VirtualElement } from '../render/dom/virtual-element';
import { fromCamelToKebabCase } from '../util/case';
import type { Listener } from './props-on';

export const Q_CTX = '_qc_';

export const resumeIfNeeded = (containerEl: Element): void => {
  const isResumed = directGetAttribute(containerEl, QContainerAttr);
  if (isResumed === 'paused') {
    resumeContainer(containerEl);
    if (qSerialize) {
      appendQwikDevTools(containerEl);
    }
  }
};

export const appendQwikDevTools = (containerEl: Element) => {
  (containerEl as any)['qwik'] = {
    pause: () => pauseContainer(containerEl),
    state: getContainerState(containerEl),
  };
};

export interface QContextEvents {
  [eventName: string]: QRL | undefined;
}

export interface QContext {
  $element$: QwikElement;
  $refMap$: any[];
  $dirty$: boolean;
  $needAttachListeners$: boolean;
  $id$: string;
  $mounted$: boolean;
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
  $parent$: QContext | null;
}

export const tryGetContext = (element: QwikElement): QContext | undefined => {
  return (element as any)[Q_CTX];
};

export const getContext = (element: Element | VirtualElement): QContext => {
  let ctx = tryGetContext(element)!;
  if (!ctx) {
    (element as any)[Q_CTX] = ctx = {
      $dirty$: false,
      $mounted$: false,
      $needAttachListeners$: false,
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
      $parent$: null,
    };
  }
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
  elCtx.$dirty$ = false;

  (el as any)[Q_CTX] = undefined;
};

const PREFIXES = ['on', 'window:on', 'document:on'];
const SCOPED = ['on', 'on-window', 'on-document'];

export const normalizeOnProp = (prop: string) => {
  let scope = 'on';
  for (let i = 0; i < PREFIXES.length; i++) {
    const prefix = PREFIXES[i];
    if (prop.startsWith(prefix)) {
      scope = SCOPED[i];
      prop = prop.slice(prefix.length);
      break;
    }
  }
  if (prop.startsWith('-')) {
    prop = fromCamelToKebabCase(prop.slice(1));
  } else {
    prop = prop.toLowerCase();
  }
  return scope + ':' + prop;
};

export const inflateQrl = (qrl: QRLInternal, elCtx: QContext) => {
  assertDefined(qrl.$capture$, 'invoke: qrl capture must be defined inside useLexicalScope()', qrl);
  return (qrl.$captureRef$ = qrl.$capture$.map((idx) => {
    const int = parseInt(idx, 10);
    const obj = elCtx.$refMap$[int];
    assertTrue(elCtx.$refMap$.length > int, 'out of bounds inflate access', idx);
    return obj;
  }));
};
