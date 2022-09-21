import {
  createProxy,
  getProxyTarget,
  QObjectImmutable,
} from '../object/q-object';
import { resumeContainer } from '../object/store';
import { QContainerAttr } from '../util/markers';
import type { OnRenderFn } from '../component/component.public';
import { destroyWatch, SubscriberDescriptor } from '../use/use-watch';
import { pauseContainer } from '../object/store';
import { qSerialize } from '../util/qdev';
import type { QRLInternal } from '../import/qrl-class';
import { directGetAttribute } from '../render/fast-calls';
import { assertDefined, assertTrue } from '../assert/assert';
import type { QRL } from '../import/qrl.public';
import type { StyleAppend } from '../use/use-core';
import { ContainerState, getContainerState, SubscriptionManager } from '../render/container';
import type { ProcessedJSXNode } from '../render/dom/render-dom';
import type { QwikElement, VirtualElement } from '../render/dom/virtual-element';
import { fromCamelToKebabCase } from '../util/case';

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
  $attachedListeners$: boolean;
  $id$: string;
  $mounted$: boolean;
  $props$: Record<string, any> | null;
  $renderQrl$: QRLInternal<OnRenderFn<any>> | null;
  li: Record<string, QRLInternal<any>[]>;
  $seq$: any[] | null;
  $watches$: SubscriberDescriptor[] | null;
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
      $attachedListeners$: false,
      $id$: '',
      $element$: element,
      $refMap$: [],
      li: {},
      $watches$: null,
      $seq$: null,
      $slots$: null,
      $scopeIds$: null,
      $appendStyles$: null,
      $props$: null,
      $vdom$: null,
      $renderQrl$: null,
      $contexts$: null,
      $parent$: null,
    };
  }
  return ctx;
};

export const cleanupContext = (ctx: QContext, subsManager: SubscriptionManager) => {
  const el = ctx.$element$;
  ctx.$watches$?.forEach((watch) => {
    subsManager.$clearSub$(watch);
    destroyWatch(watch);
  });
  if (ctx.$renderQrl$) {
    subsManager.$clearSub$(el);
  }
  ctx.$renderQrl$ = null;
  ctx.$seq$ = null;
  ctx.$watches$ = null;
  ctx.$dirty$ = false;

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
  return scope + ":" + prop;
};

export const createProps = (target: Record<string, any>, containerState: ContainerState) => {
  return createProxy(target, containerState, QObjectImmutable);
};

export const getPropsMutator = (ctx: QContext, containerState: ContainerState) => {
  let props = ctx.$props$;
  if (!props) {
    ctx.$props$ = props = createProps({}, containerState);
  }
  const target = getProxyTarget(props);
  assertDefined(target, `props have to be a proxy, but it is not`, props);
  const manager = containerState.$subsManager$.$getLocal$(target);

  return {
    set(prop: string, value: any) {
      const oldValue = target[prop];
      target[prop] = value;
      if (oldValue !== value) {
        manager.$notifySubs$(prop);
      }
    },
  };
};

export const inflateQrl = (qrl: QRLInternal, elCtx: QContext) => {
  assertDefined(
    qrl.$capture$,
    'invoke: qrl capture must be defined inside useLexicalScope()',
    qrl
  );
  return qrl.$captureRef$ = qrl.$capture$.map((idx) => {
    const int = parseInt(idx, 10);
    const obj = elCtx.$refMap$[int];
    assertTrue(elCtx.$refMap$.length > int, 'out of bounds inflate access', idx);
    return obj;
  });
};
