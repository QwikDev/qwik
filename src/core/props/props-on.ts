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
import type { QContext } from './props';

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
  element: Element,
  cache: Map<string, any>,
  prop: string
): ((event: Event) => Promise<any[]>) | null {
  const existingQRLs = getExistingQRLs(element, cache, prop);
  if (existingQRLs.length === 0) {
    return null;
  }
  return () => {
    const context = getInvokeContext();
    const qrls = getExistingQRLs(element, cache, prop);
    return Promise.all(
      qrls.map(async (qrlOrPromise) => {
        const qrl = await qrlOrPromise;
        const qrlGuard = context.qrlGuard;
        if (qrlGuard && !qrlGuard(qrl)) return;
        if (!qrl.symbolRef) {
          qrl.symbolRef = await qrlImport(element, qrl);
        }

        context.qrl = qrl;
        if (qrlGuard) {
          return invokeWatchFn(element, qrl);
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
  const existingQRLs = getExistingQRLs(ctx.element, ctx.cache, prop);
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
    throw new Error(`Not QRLInternal: prop: ${prop}; value: ` + value);
  }
  const kebabProp = fromCamelToKebabCase(prop);
  ctx.element.setAttribute(kebabProp, serializeQRLs(existingQRLs, ctx));
}

export function closureRefError(ref: any) {
  return new Error(
    `QWIK-ERROR: A closure can only lexically capture 'QObject' and 'QProp' const references. Got: ` +
      debugStringify(ref)
  );
}

function getExistingQRLs(
  element: Element,
  cache: Map<string, any>,
  prop: string
): ValueOrPromise<QRLInternal>[] {
  let parts = cache.get(prop) as QRLInternal[];
  if (!parts) {
    const attrName = fromCamelToKebabCase(prop);
    parts = [];
    (element.getAttribute(attrName) || '').split('\n').forEach((qrl) => {
      if (qrl) {
        parts.push(parseQRL(qrl as any, element));
      }
    });
    cache.set(prop, parts);
  }
  return parts;
}

function serializeQRLs(existingQRLs: ValueOrPromise<QRLInternal>[], ctx: QContext): string {
  const element = ctx.element;
  return existingQRLs
    .map((qrl) => (isPromise(qrl) ? '' : stringifyQRL(qrl, element)))
    .filter((v) => !!v)
    .join('\n');
}
