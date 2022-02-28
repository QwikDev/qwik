import { qrlImport } from '../index';
import { QError, qError } from '../error/error';
import type { QRLInternal } from '../import/qrl-class';
import { readWriteProxy, _restoreQObject } from '../object/q-object';
import { QStore_hydrate } from '../object/store';
import { getInvokeContext, useInvoke } from '../use/use-core';
import { OnRenderAttr, OnRenderProp } from '../util/markers';
import { newQObjectMap, QObjectMap } from './props-obj-map';
import { qPropWriteQRL, qPropReadQRL, isOnProp, isOn$Prop } from './props-on';
import { then } from '../util/promises';
import { assertEqual } from '../assert/assert';

Error.stackTraceLimit = 9999;

// TODO(misko): For better debugger experience the getProps should never store Proxy, always naked objects to make it easier to traverse in the debugger.

const Q_IS_HYDRATED = '__isHydrated__';
export const Q_CTX = '__ctx__';

export function hydrateIfNeeded(element: Element): void {
  const doc = element.ownerDocument!;
  const isHydrated = (doc as any)[Q_IS_HYDRATED];
  if (!isHydrated) {
    (doc as any)[Q_IS_HYDRATED] = true;
    QStore_hydrate(doc);
  }
}

export interface QContextEvents {
  render?: Function;
  watch?: Function[];
}

export interface QContext {
  cache: Map<string, any>;
  refMap: QObjectMap;
  element: Element;
  id: string | undefined;
  props: Record<string, any> | undefined;
  events?: QContextEvents;
}

export function getContext(element: Element): QContext {
  hydrateIfNeeded(element);

  let ctx: QContext = (element as any)[Q_CTX];
  if (!ctx) {
    const cache = new Map();
    (element as any)[Q_CTX] = ctx = {
      element,
      cache,
      refMap: newQObjectMap(element),
      id: undefined,
      props: undefined,
    };
  }
  return ctx;
}

export function setEvent(ctx: QContext, prop: string, value: any) {
  if (prop === OnRenderProp) {
    const el = ctx.element;
    if (!el.hasAttribute(OnRenderAttr)) {
      el.setAttribute(OnRenderAttr, '');
    }
    const events = getEvents(ctx);
    const promise = then(value(el), (qrl: QRLInternal) => {
      if (!qrl.symbolRef) {
        return qrlImport(el, qrl).then(sym => {
          qrl.symbolRef = sym;
          return qrl;
        });
      }
      return qrl;
    });

    events.render = () => {
      const context = getInvokeContext();
      return then(promise, (qrl) => {
        context.qrl = qrl;
        return useInvoke(context, qrl.symbolRef);
      });
    };
  } else {
    qPropWriteQRL(ctx, prop, value);
  }
}

export function getEvent(ctx: QContext, prop: string): any {
  if (prop.startsWith(OnRenderProp)) {
    return getEvents(ctx).render;
  }
  return qPropReadQRL(ctx.element, ctx.cache, prop);
}

export function getProps(ctx: QContext) {
  // const id = getQObjectId(ctx.element)!.slice(1);
  if (!ctx.props) {
    let props = ctx.refMap.get(0);
    if (!props) {
      assertEqual(ctx.refMap.array.length, 0);
      ctx.props = readWriteProxy({});
      ctx.refMap.add(ctx.props);
    } else {
      ctx.props = props;
    }
  }
  return ctx.props!;
}

export function getEvents(ctx: QContext): QContextEvents {
  if (!ctx.events) {
    ctx.events = {};
    ctx.refMap.add(ctx.events);
  }
  return ctx.events!;
}

export function test_clearPropsCache(_element: Element) {
  // NOTHING
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
