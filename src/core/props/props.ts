import type { JSXNode } from '../render/jsx/types/jsx-node';
import { QError, qError } from '../error/error';
import { getProxyMap, readWriteProxy } from '../object/q-object';
import { resume } from '../object/store';
import type { RenderContext } from '../render/cursor';
import { getDocument } from '../util/dom';
import { newQObjectMap, QObjectMap } from './props-obj-map';
import { qPropWriteQRL, qPropReadQRL } from './props-on';
import type { QRLInternal } from '../import/qrl-class';
import { QContainerAttr } from '../util/markers';

Error.stackTraceLimit = 9999;

const Q_CTX = '__ctx__';

export function resumeIfNeeded(containerEl: Element): void {
  const isResumed = containerEl.getAttribute(QContainerAttr);
  if (isResumed === 'paused') {
    resume(containerEl);
  }
}

export interface QContextEvents {
  [eventName: string]: QRLInternal | undefined;
}

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
  renderQrl: QRLInternal | undefined;
  component: ComponentCtx | undefined;
}

export function getContext(element: Element): QContext {
  let ctx: QContext = (element as any)[Q_CTX];
  if (!ctx) {
    const cache = new Map();
    (element as any)[Q_CTX] = ctx = {
      element,
      cache,
      refMap: newQObjectMap(element),
      dirty: false,
      props: undefined,
      renderQrl: undefined,
      component: undefined,
    };
  }
  return ctx;
}

const PREFIXES = ['onWindow', 'onWindow', 'on'];
export function normalizeOnProp(prop: string) {
  let scope = 'on';
  for (const prefix of PREFIXES) {
    if (prop.startsWith(prefix)) {
      scope = prefix;
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

export function getEvent(ctx: QContext, prop: string): any {
  return qPropReadQRL(ctx, normalizeOnProp(prop));
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
