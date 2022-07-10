import type { ProcessedJSXNode } from '../render/jsx/types/jsx-node';
import {
  createProxy,
  getProxyTarget,
  isMutable,
  QObjectImmutable,
  SubscriptionManager,
} from '../object/q-object';
import { resumeContainer } from '../object/store';
import type { RenderContext } from '../render/cursor';
import { newQObjectMap, QObjectMap } from './props-obj-map';
import { qPropWriteQRL } from './props-on';
import { QContainerAttr } from '../util/markers';
import { $, QRL } from '../import/qrl.public';
import type { OnRenderFn } from '../component/component.public';
import { destroyWatch, SubscriberDescriptor } from '../use/use-watch';
import { pauseContainer } from '../object/store';
import { ContainerState, getContainerState } from '../render/notify-render';
import { qDev } from '../util/qdev';
import { logError } from '../util/log';
import { isQrl, QRLInternal } from '../import/qrl-class';
import { directGetAttribute } from '../render/fast-calls';
import { assertDefined, assertTrue } from '../assert/assert';
import { codeToText, QError_immutableJsxProps } from '../error/error';
import { isArray } from '../util/types';

const Q_CTX = '__ctx__';

export const resumeIfNeeded = (containerEl: Element): void => {
  const isResumed = directGetAttribute(containerEl, QContainerAttr);
  if (isResumed === 'paused') {
    resumeContainer(containerEl);
    if (qDev) {
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

export interface ComponentCtx {
  $hostElement$: Element;
  $styleId$: string | undefined;
  $styleClass$: string | undefined;
  $styleHostClass$: string | undefined;
  $slots$: ProcessedJSXNode[];
}

export interface QContext {
  $cache$: Map<string, any>;
  $refMap$: QObjectMap;
  $element$: Element;
  $dirty$: boolean;
  $props$: Record<string, any> | undefined;
  $renderQrl$: QRLInternal<OnRenderFn<any>> | undefined;
  $component$: ComponentCtx | undefined;
  $listeners$?: Map<string, QRLInternal<any>[]>;
  $seq$: any[];
  $watches$: SubscriberDescriptor[];
  $contexts$?: Map<string, any>;
}

export const tryGetContext = (element: Element): QContext | undefined => {
  return (element as any)[Q_CTX];
};
export const getContext = (element: Element): QContext => {
  let ctx = tryGetContext(element)!;
  if (!ctx) {
    const cache = new Map();
    (element as any)[Q_CTX] = ctx = {
      $element$: element,
      $cache$: cache,
      $refMap$: newQObjectMap(),
      $dirty$: false,
      $seq$: [],
      $watches$: [],
      $props$: undefined,
      $renderQrl$: undefined,
      $component$: undefined,
    };
  }
  return ctx;
};

export const cleanupContext = (ctx: QContext, subsManager: SubscriptionManager) => {
  const el = ctx.$element$;
  ctx.$watches$.forEach((watch) => {
    subsManager.$clearSub$(watch);
    destroyWatch(watch);
  });
  if (ctx.$renderQrl$) {
    subsManager.$clearSub$(el);
  }
  ctx.$component$ = undefined;
  ctx.$renderQrl$ = undefined;
  ctx.$seq$.length = 0;
  ctx.$watches$.length = 0;
  ctx.$cache$.clear();
  ctx.$dirty$ = false;
  ctx.$refMap$.$array$.length = 0;
  (el as any)[Q_CTX] = undefined;
};

const PREFIXES = ['document:on', 'window:on', 'on'];
const SCOPED = ['on-window', 'on-window', 'on'];

export const normalizeOnProp = (prop: string) => {
  let scope = 'on';
  for (let i = 0; i < PREFIXES.length; i++) {
    const prefix = PREFIXES[i];
    if (prop.startsWith(prefix)) {
      scope = SCOPED[i];
      prop = prop.slice(prefix.length);
    }
  }
  if (prop.startsWith('-')) {
    prop = prop.slice(1);
  } else {
    prop = prop.toLowerCase();
  }
  return `${scope}:${prop}`;
};

export const setEvent = (rctx: RenderContext, ctx: QContext, prop: string, value: any) => {
  assertTrue(prop.endsWith('$'), 'render: event property does not end with $');
  const qrl = isArray(value) ? value.map(ensureQrl) : ensureQrl(value);
  qPropWriteQRL(rctx, ctx, normalizeOnProp(prop.slice(0, -1)), qrl);
};

const ensureQrl = (value: any) => {
  return isQrl(value) ? value : ($(value) as QRLInternal);
};

export const createProps = (target: any, containerState: ContainerState) => {
  return createProxy(target, containerState, QObjectImmutable);
};

export const getPropsMutator = (ctx: QContext, containerState: ContainerState) => {
  let props = ctx.$props$;
  if (!ctx.$props$) {
    ctx.$props$ = props = createProps({}, containerState);
  }
  const target = getProxyTarget(props);
  assertDefined(target, `props have to be a proxy, but it is not: ${props}`);
  const manager = containerState.$subsManager$.$getLocal$(target);

  return {
    set(prop: string, value: any) {
      const didSet = prop in target;
      let oldValue = target[prop];
      let mut = false;
      if (isMutable(oldValue)) {
        oldValue = oldValue.v;
      }
      target[prop] = value;
      if (isMutable(value)) {
        value = value.v;
        mut = true;
      }
      if (oldValue !== value) {
        if (qDev) {
          if (didSet && !mut && !isQrl(value)) {
            const displayName = ctx.$renderQrl$?.getSymbol() ?? ctx.$element$.localName;
            logError(
              codeToText(QError_immutableJsxProps),
              `If you need to change a value of a passed in prop, please wrap the prop with "mutable()" <${displayName} ${prop}={mutable(...)}>`,
              '\n - Component:',
              displayName,
              '\n - Prop:',
              prop,
              '\n - Old value:',
              oldValue,
              '\n - New value:',
              value
            );
          }
        }
        manager.$notifySubs$(prop);
      }
    },
  };
};
