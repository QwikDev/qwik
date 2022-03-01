import { QError, qError } from '../error/error';
import { readWriteProxy } from '../object/q-object';
import { QStore_hydrate } from '../object/store';
import { newQObjectMap, QObjectMap } from './props-obj-map';
import { qPropWriteQRL, qPropReadQRL } from './props-on';

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
  [eventName: string]: string | undefined;
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
  qPropWriteQRL(ctx, prop, value);
}

export function getEvent(ctx: QContext, prop: string): any {
  return qPropReadQRL(ctx, prop);
}

export function getProps(ctx: QContext) {
  if (!ctx.props) {
    ctx.props = readWriteProxy({});
    ctx.refMap.add(ctx.props);
  }
  return ctx.props!;
}

export function getEvents(ctx: QContext): QContextEvents {
  let events = ctx.events;
  if (!events) {
    events = ctx.events = {};
    ctx.refMap.add(ctx.events);
  }
  return events;
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
