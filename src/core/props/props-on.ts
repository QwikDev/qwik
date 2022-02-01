import { parseQRL, stringifyQRL } from '../import/qrl';
import { qrlImport } from '../import/qrl.public';
import { qDeflate } from '../json/q-json';
import { getInvokeContext, useInvoke } from '../use/use-core';
import { fromCamelToKebabCase } from '../util/case';
import { EMPTY_ARRAY } from '../util/flyweight';
import { isPromise } from '../util/promises';
import { debugStringify } from '../util/stringify';
import type { ValueOrPromise } from '../util/types';
import type { QPropsContext } from './props';
import type { QObjectMap } from './props-obj-map';
import { isQrl, QRLInternal } from '../import/qrl-class';

const ON_PREFIX = 'on:';
const ON_PREFIX_$ = 'on$:';
const ON_DOCUMENT_PREFIX = 'onDocument:';
const ON_DOCUMENT_PREFIX_$ = 'onDocument$:';
const ON_WINDOW_PREFIX = 'onWindow:';
const ON_WINDOW_PREFIX_$ = 'onWindow$:';

export function isOnProp(prop: string): boolean {
  return (
    prop.startsWith(ON_PREFIX) ||
    prop.startsWith(ON_DOCUMENT_PREFIX) ||
    prop.startsWith(ON_WINDOW_PREFIX)
  );
}

export function isOn$Prop(prop: string): boolean {
  return (
    prop.startsWith(ON_PREFIX_$) ||
    prop.startsWith(ON_DOCUMENT_PREFIX_$) ||
    prop.startsWith(ON_WINDOW_PREFIX_$)
  );
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
  cache: QPropsContext & Record<string | symbol, any>,
  map: QObjectMap,
  prop: string
): ((event: Event) => Promise<any[]>) | null {
  const existingQRLs = getExistingQRLs(cache, prop);
  if (existingQRLs.length === 0) return null;
  return () => {
    const context = getInvokeContext();
    const qrls = getExistingQRLs(cache, prop);
    return Promise.all(
      qrls.map(async (qrlOrPromise) => {
        const qrl = await qrlOrPromise;
        context.qrl = qrl;
        if (!qrl.symbolRef) {
          qrl.symbolRef = await qrlImport(cache.__element__, qrl);
        }

        return useInvoke(context, qrl.symbolRef);
      })
    );
  };
}

export function qPropWriteQRL(
  cache: QPropsContext & Record<string | symbol, any>,
  map: QObjectMap,
  prop: string,
  value: any
) {
  if (!value) return;
  prop = prop.replace('$:', ':');
  if (typeof value == 'string') {
    value = parseQRL(value);
  }
  const existingQRLs = getExistingQRLs(cache, prop);
  if (isQrl(value)) {
    const capture = value.capture;
    if (capture == null) {
      // we need to serialize the lexical scope references
      const captureRef = value.captureRef;
      value.capture =
        captureRef && captureRef.length ? captureRef.map((ref) => qDeflate(ref, map)) : EMPTY_ARRAY;
    }

    // Important we modify the array as it is cached.
    for (let i = 0; i < existingQRLs.length; i++) {
      const qrl = existingQRLs[i];
      if (!isPromise(qrl) && qrl.chunk === value.chunk && qrl.symbol === value.symbol) {
        existingQRLs.splice(i, 1);
        i--;
      }
    }
    existingQRLs.push(value);
  } else if (isQrlFactory(value)) {
    if (existingQRLs.length === 0) {
      // if we don't have any than we use the `qrlFactory` to create a QRLInternal
      // (otherwise ignore the factory)
      qPropWriteQRL(cache, map, prop, value(cache.__element__));
    }
  } else if (isPromise(value)) {
    const writePromise = value.then((qrl: QRLInternal) => {
      existingQRLs.splice(existingQRLs.indexOf(writePromise), 1);
      qPropWriteQRL(cache, map, prop, qrl);
      return qrl;
    });
    existingQRLs.push(writePromise);
  } else {
    // TODO(misko): Test/better text
    throw new Error(`Not QRLInternal: prop: ${prop}; value: ` + value);
  }
  const kababProp = fromCamelToKebabCase(prop);
  cache.__element__.setAttribute(kababProp, serializeQRLs(existingQRLs, map));
}

export function closureRefError(ref: any) {
  return new Error(
    `QWIK-ERROR: A closure can only lexically capture 'QObject' and 'QProp' const references. Got: ` +
      debugStringify(ref)
  );
}

function getExistingQRLs(
  cache: QPropsContext & Record<string | symbol, any>,
  prop: string
): ValueOrPromise<QRLInternal>[] {
  if (prop in cache) return cache[prop];
  const kebabProp = fromCamelToKebabCase(prop);
  const parts: QRLInternal[] = [];
  const element = cache.__element__;
  (element.getAttribute(kebabProp) || '').split('\n').forEach((qrl) => {
    if (qrl) {
      parts.push(parseQRL(qrl as any, element));
    }
  });
  return (cache[prop] = parts);
}

function serializeQRLs(existingQRLs: ValueOrPromise<QRLInternal>[], map: QObjectMap): string {
  const element = map.element;
  return existingQRLs
    .map((qrl) => (isPromise(qrl) ? '' : stringifyQRL(qrl, element)))
    .filter((v) => !!v)
    .join('\n');
}
