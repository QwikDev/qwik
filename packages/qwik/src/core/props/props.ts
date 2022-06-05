import type { JSXNode } from '../render/jsx/types/jsx-node';
import {
  isMutable,
  LocalSubscriptionManager,
  QOjectAllSymbol,
  QOjectOriginalProxy,
  QOjectSubsSymbol,
  QOjectTargetSymbol,
  readWriteProxy,
  SubscriptionManager,
  TargetType,
} from '../object/q-object';
import { getProxyTarget, resumeContainer } from '../object/store';
import type { RenderContext } from '../render/cursor';
import { newQObjectMap, QObjectMap } from './props-obj-map';
import { qPropWriteQRL } from './props-on';
import { QContainerAttr } from '../util/markers';
import type { QRL } from '../import/qrl.public';
import type { OnRenderFn } from '../component/component.public';
import { destroyWatch, WatchDescriptor } from '../watch/watch.public';
import { pauseContainer } from '../object/store.public';
import { ContainerState, getContainerState } from '../render/notify-render';
import { qDev } from '../util/qdev';
import { logError } from '../util/log';
import { unwrapSubscriber } from '../use/use-subscriber';
import { isQrl } from '../import/qrl-class';

Error.stackTraceLimit = 9999;

const Q_CTX = '__ctx__';

export function resumeIfNeeded(containerEl: Element): void {
  const isResumed = containerEl.getAttribute(QContainerAttr);
  if (isResumed === 'paused') {
    resumeContainer(containerEl);
    if (qDev) {
      appendQwikDevTools(containerEl);
    }
  }
}

export function appendQwikDevTools(containerEl: Element) {
  (containerEl as any)['qwik'] = {
    pause: () => pauseContainer(containerEl),
    state: getContainerState(containerEl),
  };
}

export interface QContextEvents {
  [eventName: string]: QRL | undefined;
}

/**
 * @alpha
 */
export interface ComponentCtx {
  hostElement: Element;
  styleId: string | undefined;
  styleClass: string | undefined;
  styleHostClass: string | undefined;
  slots: JSXNode[];
}

export interface QContext {
  cache: Map<string, any>;
  refMap: QObjectMap;
  element: Element;
  dirty: boolean;
  props: Record<string, any> | undefined;
  renderQrl: QRL<OnRenderFn<any>> | undefined;
  component: ComponentCtx | undefined;
  listeners?: Map<string, QRL<any>[]>;
  seq: any[];
  watches: WatchDescriptor[];
  contexts?: Map<string, any>;
}

export function tryGetContext(element: Element): QContext | undefined {
  return (element as any)[Q_CTX];
}
export function getContext(element: Element): QContext {
  let ctx = tryGetContext(element)!;
  if (!ctx) {
    const cache = new Map();
    (element as any)[Q_CTX] = ctx = {
      element,
      cache,
      refMap: newQObjectMap(),
      dirty: false,
      seq: [],
      watches: [],
      props: undefined,
      renderQrl: undefined,
      component: undefined,
    };
  }
  return ctx;
}

export function cleanupContext(ctx: QContext, subsManager: SubscriptionManager) {
  const el = ctx.element;
  ctx.watches.forEach((watch) => {
    subsManager.clearSub(watch);
    destroyWatch(watch);
  });
  if (ctx.renderQrl) {
    subsManager.clearSub(el);
  }
  ctx.component = undefined;
  ctx.renderQrl = undefined;
  ctx.seq.length = 0;
  ctx.watches.length = 0;
  ctx.cache.clear();
  ctx.dirty = false;
  ctx.refMap.array.length = 0;
  (el as any)[Q_CTX] = undefined;
}

const PREFIXES = ['document:on', 'window:on', 'on'];
const SCOPED = ['on-document', 'on-window', 'on'];

export function normalizeOnProp(prop: string) {
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
}

export function setEvent(rctx: RenderContext, ctx: QContext, prop: string, value: any) {
  qPropWriteQRL(rctx, ctx, normalizeOnProp(prop), value);
}

export function createProps(target: any, el: Element, containerState: ContainerState) {
  const manager = containerState.subsManager.getLocal(target);
  return new Proxy(target, new PropsProxyHandler(el, containerState, manager));
}

export function getPropsMutator(ctx: QContext, containerState: ContainerState) {
  let props = ctx.props;
  if (!ctx.props) {
    ctx.props = props = createProps({}, ctx.element, containerState);
  }
  const target = getProxyTarget(props);
  const manager = containerState.subsManager.getLocal(target);

  return {
    set(prop: string, value: any) {
      const didSet = prop in target;
      let oldValue = target[prop];
      let mut = false;
      if (isMutable(oldValue)) {
        oldValue = oldValue.v;
      }
      value = unwrapSubscriber(value);
      target[prop] = value;
      if (isMutable(value)) {
        value = value.v;
        mut = true;
      }
      if (oldValue !== value) {
        if (qDev) {
          if (didSet && !mut && !isQrl(value)) {
            const displayName = ctx.renderQrl?.getSymbol() ?? ctx.element.localName;
            logError(
              `Props are immutable by default. If you need to change a value of a passed in prop, please wrap the prop with "mutable()" <${displayName} ${prop}={mutable(...)}>`,
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
        manager.notifySubs(prop);
      }
    },
  };
}

class PropsProxyHandler implements ProxyHandler<TargetType> {
  constructor(
    private hostElement: Element,
    private containerState: ContainerState,
    private manager: LocalSubscriptionManager
  ) {}

  get(target: TargetType, prop: string | symbol): any {
    if (typeof prop === 'symbol') {
      return target[prop];
    }
    if (prop === QOjectTargetSymbol) return target;
    if (prop === QOjectSubsSymbol) return this.manager.subs;
    if (prop === QOjectOriginalProxy) return readWriteProxy(target, this.containerState);
    if (prop === QOjectAllSymbol) {
      this.manager.addSub(this.hostElement);
      return target;
    }
    const value = target[prop];
    if (typeof prop === 'symbol') {
      return value;
    }
    if (isMutable(value)) {
      this.manager.addSub(this.hostElement, prop);
      return value.v;
    }
    return value;
  }

  set(): boolean {
    throw new Error('props are inmutable');
  }

  has(target: TargetType, property: string | symbol) {
    if (property === QOjectTargetSymbol) return true;
    if (property === QOjectSubsSymbol) return true;

    return Object.prototype.hasOwnProperty.call(target, property);
  }

  ownKeys(target: TargetType): ArrayLike<string | symbol> {
    const subscriber = this.hostElement;
    this.manager.addSub(subscriber);
    return Object.getOwnPropertyNames(target);
  }
}
