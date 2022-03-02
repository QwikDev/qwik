import { getPlatform } from '../index';
import { QError, qError } from '../error/error';
import { parseQRL, stringifyQRL } from '../import/qrl';
import { isQrl, QRLInternal } from '../import/qrl-class';
import { qrlImport } from '../import/qrl.public';
import { qDeflate } from '../json/q-json';
import { getInvokeContext, useInvoke } from '../use/use-core';
import { fromCamelToKebabCase } from '../util/case';
import { EMPTY_ARRAY } from '../util/flyweight';
import { isPromise } from '../util/promises';
import { debugStringify } from '../util/stringify';
import type { ValueOrPromise } from '../util/types';
import { invokeWatchFn } from '../watch/watch';
import { getEvents, QContext } from './props';

const ON_PROP_REGEX = /on(Document|Window)?:/;
const ON$_PROP_REGEX = /on(Document|Window)?\$:/;

export function isOnProp(prop: string): boolean {
  return ON_PROP_REGEX.test(prop);
}

export function isOn$Prop(prop: string): boolean {
  return ON$_PROP_REGEX.test(prop);
}

/**
 * In the case of a component, it is necessary to have `on:q-render` value.
 * However the `component` can run when parent component is rendering only to
 * realize that `on:q-render` already exists. This interface exists to solve that
 * problem.
 *
 * A parent component's `component` returns a `qrlFactory` for `on:q-render`. The
 * `getProps` than looks to see if it already has a resolved value, and if so the
 * `qrlFactory` is ignored, otherwise the `qrlFactory` is used to recover the `QRLInternal`.
 */
export interface qrlFactory {
  __brand__: `QRLFactory`;
  (element: Element): Promise<QRLInternal<any>>;
}

function isQrlFactory(value: any): value is qrlFactory {
  return typeof value === 'function' && value.__brand__ === 'QRLFactory';
}

export function qPropReadQRL(
  ctx: QContext,
  prop: string
): ((event: Event) => Promise<any[]>) | null {
  const existingQRLs = getExistingQRLs(ctx, prop);
  if (existingQRLs.length === 0) {
    return null;
  }
  return () => {
    const context = getInvokeContext();
    const qrls = getExistingQRLs(ctx, prop);
    return Promise.all(
      qrls.map(async (qrlOrPromise) => {
        const qrl = await qrlOrPromise;
        const qrlGuard = context.qrlGuard;
        if (qrlGuard && !qrlGuard(qrl)) return;
        if (!qrl.symbolRef) {
          qrl.symbolRef = await qrlImport(ctx.element, qrl);
        }

        context.qrl = qrl;
        if (qrlGuard) {
          return invokeWatchFn(ctx.element, qrl);
        } else {
          return useInvoke(context, qrl.symbolRef);
        }
      })
    );
  };
}

export function qPropWriteQRL(ctx: QContext, prop: string, value: any) {
  if (!value) {
    return;
  }
  prop = prop.replace('$:', ':');
  if (typeof value == 'string') {
    value = parseQRL(value);
  }
  const existingQRLs = getExistingQRLs(ctx, prop);
  if (Array.isArray(value)) {
    value.forEach((value) => qPropWriteQRL(ctx, prop, value));
  } else if (isQrl(value)) {
    const capture = value.capture;
    if (capture == null) {
      // we need to serialize the lexical scope references
      const captureRef = value.captureRef;
      value.capture =
        captureRef && captureRef.length ? captureRef.map((ref) => qDeflate(ref, ctx)) : EMPTY_ARRAY;
    }

    // Important we modify the array as it is cached.
    for (let i = 0; i < existingQRLs.length; i++) {
      const qrl = existingQRLs[i];
      if (
        !isPromise(qrl) &&
        qrl.canonicalChunk === value.canonicalChunk &&
        qrl.symbol === value.symbol
      ) {
        existingQRLs.splice(i, 1);
        i--;
      }
    }
    existingQRLs.push(value);
  } else if (isQrlFactory(value)) {
    if (existingQRLs.length === 0) {
      // if we don't have any than we use the `qrlFactory` to create a QRLInternal
      // (otherwise ignore the factory)
      qPropWriteQRL(ctx, prop, value(ctx.element));
    }
  } else if (isPromise(value)) {
    const writePromise = value.then((qrl: QRLInternal) => {
      existingQRLs.splice(existingQRLs.indexOf(writePromise), 1);
      qPropWriteQRL(ctx, prop, qrl);
      return qrl;
    });
    existingQRLs.push(writePromise);
  } else {
    // TODO(misko): Test/better text
    throw qError(QError.TODO, `Not QRLInternal: prop: ${prop}; value: ` + value);
  }
  if (prop.startsWith('on:q')) {
    getEvents(ctx)[prop] = serializeQRLs(existingQRLs, ctx);
  } else {
    const kebabProp = fromCamelToKebabCase(prop);
    ctx.element.setAttribute(kebabProp, serializeQRLs(existingQRLs, ctx));
  }
}

export function closureRefError(ref: any) {
  return new Error(
    `QWIK-ERROR: A closure can only lexically capture 'QObject' and 'QProp' const references. Got: ` +
      debugStringify(ref)
  );
}

function getExistingQRLs(ctx: QContext, prop: string): ValueOrPromise<QRLInternal>[] {
  let parts = ctx.cache.get(prop) as QRLInternal[];
  if (!parts) {
    if (prop.startsWith('on:q')) {
      parts = [];
      const qrls = getEvents(ctx)[prop];
      if (qrls) {
        qrls.split('\n').forEach((qrl) => {
          if (qrl) {
            parts.push(parseQRL(qrl as any, ctx.element));
          }
        });
        ctx.cache.set(prop, parts);
        return parts;
      }
    }
    const attrName = fromCamelToKebabCase(prop);
    parts = [];
    (ctx.element.getAttribute(attrName) || '').split('\n').forEach((qrl) => {
      if (qrl) {
        parts.push(parseQRL(qrl as any, ctx.element));
      }
    });
    ctx.cache.set(prop, parts);
  }
  return parts;
}

function serializeQRLs(existingQRLs: ValueOrPromise<QRLInternal>[], ctx: QContext): string {
  const platform = getPlatform(ctx.element.ownerDocument);
  const element = ctx.element;
  return existingQRLs
    .map((qrl) => (isPromise(qrl) ? '' : stringifyQRL(qrl, element, platform)))
    .filter((v) => !!v)
    .join('\n');
}
