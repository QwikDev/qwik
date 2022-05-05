import { getPlatform } from '../platform/platform';
import { QError, qError } from '../error/error';
import { parseQRL, qrlImport, stringifyQRL } from '../import/qrl';
import { isQrl, QRLInternal } from '../import/qrl-class';
import { qDeflate } from '../json/q-json';
import { getInvokeContext, useInvoke } from '../use/use-core';
import { fromCamelToKebabCase } from '../util/case';
import { EMPTY_ARRAY } from '../util/flyweight';
import { isPromise } from '../util/promises';
import { debugStringify } from '../util/stringify';
import type { ValueOrPromise } from '../util/types';
import type { QContext } from './props';
import { getDocument } from '../util/dom';
import { RenderContext, setAttribute } from '../render/cursor';
import { emitEvent } from '../util/event';

const ON_PROP_REGEX = /^(window:|document:|)on([A-Z]|-.).*Qrl$/;
const ON$_PROP_REGEX = /^(window:|document:|)on([A-Z]|-.).*\$$/;

export function isOnProp(prop: string): boolean {
  return ON_PROP_REGEX.test(prop);
}

export function isOn$Prop(prop: string): boolean {
  return ON$_PROP_REGEX.test(prop);
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
        if (!qrl.symbolRef) {
          qrl.symbolRef = await qrlImport(ctx.element, qrl);
        }

        context.qrl = qrl;
        emitEvent(ctx.element, 'qSymbol', { name: qrl.symbol }, true);
        return useInvoke(context, qrl.symbolRef);
      })
    );
  };
}

export function qPropWriteQRL(
  rctx: RenderContext | undefined,
  ctx: QContext,
  prop: string,
  value: any
) {
  if (!value) {
    return;
  }
  if (typeof value == 'string') {
    value = parseQRL(value, ctx.element);
  }
  const existingQRLs = getExistingQRLs(ctx, prop);
  if (Array.isArray(value)) {
    value.forEach((value) => qPropWriteQRL(rctx, ctx, prop, value));
  } else if (isQrl(value)) {
    const cp = value.copy();
    cp.setContainer(ctx.element);
    const capture = cp.capture;
    if (capture == null) {
      // we need to serialize the lexical scope references
      const captureRef = cp.captureRef;
      cp.capture =
        captureRef && captureRef.length ? captureRef.map((ref) => qDeflate(ref, ctx)) : EMPTY_ARRAY;
    }

    // Important we modify the array as it is cached.
    for (let i = 0; i < existingQRLs.length; i++) {
      const qrl = existingQRLs[i];
      if (!isPromise(qrl) && qrl.canonicalChunk === cp.canonicalChunk && qrl.symbol === cp.symbol) {
        existingQRLs.splice(i, 1);
        i--;
      }
    }
    existingQRLs.push(cp);
  } else if (isPromise(value)) {
    const writePromise = value.then((qrl: QRLInternal) => {
      existingQRLs.splice(existingQRLs.indexOf(writePromise), 1);
      qPropWriteQRL(rctx, ctx, prop, qrl);
      return qrl;
    });
    existingQRLs.push(writePromise);
  } else {
    // TODO(misko): Test/better text
    throw qError(QError.TODO, `Not QRLInternal: prop: ${prop}; value: ` + value);
  }
  const kebabProp = fromCamelToKebabCase(prop);
  const newValue = serializeQRLs(existingQRLs, ctx);
  if (ctx.element.getAttribute(kebabProp) !== newValue) {
    if (rctx) {
      setAttribute(rctx, ctx.element, kebabProp, newValue);
    } else {
      ctx.element.setAttribute(kebabProp, newValue);
    }
  }
}

export function closureRefError(ref: any) {
  return new Error(
    `QWIK-ERROR: A closure can only lexically capture 'QObject' and 'QProp' const references. Got: ` +
      debugStringify(ref)
  );
}

function getExistingQRLs(ctx: QContext, prop: string): ValueOrPromise<QRLInternal>[] {
  const key = 'event:' + prop;
  let parts = ctx.cache.get(key) as QRLInternal[];
  if (!parts) {
    const attrName = fromCamelToKebabCase(prop);
    parts = [];
    (ctx.element.getAttribute(attrName) || '').split('\n').forEach((qrl) => {
      if (qrl) {
        parts.push(parseQRL(qrl, ctx.element));
      }
    });
    ctx.cache.set(key, parts);
  }
  return parts;
}

function serializeQRLs(existingQRLs: ValueOrPromise<QRLInternal>[], ctx: QContext): string {
  const platform = getPlatform(getDocument(ctx.element));
  const element = ctx.element;
  const opts = {
    platform,
    element,
  };
  return existingQRLs
    .map((qrl) => (isPromise(qrl) ? '' : stringifyQRL(qrl, opts)))
    .filter((v) => !!v)
    .join('\n');
}
