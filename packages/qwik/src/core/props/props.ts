import type { JSXNode } from '../render/jsx/types/jsx-node';
import { QError, qError } from '../error/error';
import { getProxyMap, readWriteProxy } from '../object/q-object';
import { resumeContainer } from '../object/store';
import type { RenderContext } from '../render/cursor';
import { getDocument } from '../util/dom';
import { newQObjectMap, QObjectMap } from './props-obj-map';
import { qPropWriteQRL } from './props-on';
import { QContainerAttr } from '../util/markers';
import type { QRL } from '../import/qrl.public';
import type { OnRenderFn } from '../component/component.public';
import { destroyWatch, isWatchDescriptor } from '../watch/watch.public';
import { pauseContainer } from '../object/store.public';
import { getRenderingState } from '../render/notify-render';
import { qDev } from '../util/qdev';

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
    renderState: getRenderingState(containerEl),
  };
}

export interface QContextEvents {
  [eventName: string]: QRL | undefined;
}

/**
 * @alpha
 */
export interface ComponentCtx {
  hostElement: HTMLElement;
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
  seq: number[];
  component: ComponentCtx | undefined;
  listeners?: Map<string, QRL<any>[]>;
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
      refMap: newQObjectMap(element),
      dirty: false,
      seq: [],
      props: undefined,
      renderQrl: undefined,
      component: undefined,
    };
  }
  return ctx;
}

export function cleanupContext(ctx: QContext) {
  const el = ctx.element;
  ctx.refMap.array.forEach((obj) => {
    if (isWatchDescriptor(obj)) {
      if (obj.el === el) {
        destroyWatch(obj);
      }
    }
    ctx.component = undefined;
    ctx.renderQrl = undefined;
    ctx.seq = [];
    ctx.cache.clear();
    ctx.dirty = false;
    ctx.refMap.array.length = 0;
  });
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

export function getProps(ctx: QContext) {
  if (!ctx.props) {
    ctx.props = readWriteProxy({}, getProxyMap(getDocument(ctx.element)));
    ctx.refMap.add(ctx.props);
  }
  return ctx.props!;
}

/**
 * Turn an `Array` or object literal into a `class` or `style`
 *
 * @param obj `string`, `Array` or object literal
 * @param isClass `true` if expecting `class` output
 * @returns `string`
 */
export function stringifyClassOrStyle(obj: any, isClass: boolean): string {
  if (obj == null) return '';
  if (typeof obj == 'object') {
    let text = '';
    let sep = '';
    if (Array.isArray(obj)) {
      if (!isClass) {
        throw qError(QError.Render_unsupportedFormat_obj_attr, obj, 'style');
      }
      for (let i = 0; i < obj.length; i++) {
        text += sep + obj[i];
        sep = ' ';
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          text += isClass ? (value ? sep + key : '') : sep + key + ':' + value;
          sep = isClass ? ' ' : ';';
        }
      }
    }
    return text;
  }
  return String(obj);
}
