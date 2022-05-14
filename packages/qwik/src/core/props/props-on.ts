import { getPlatform } from '../platform/platform';
import { parseQRL, stringifyQRL } from '../import/qrl';
import { isSameQRL, QRLInternal } from '../import/qrl-class';
import { qDeflate } from '../json/q-json';
import { fromCamelToKebabCase } from '../util/case';
import { EMPTY_ARRAY } from '../util/flyweight';
import { isPromise } from '../util/promises';
import { debugStringify } from '../util/stringify';
import type { ValueOrPromise } from '../util/types';
import type { QContext } from './props';
import { getDocument } from '../util/dom';
import { RenderContext, setAttribute } from '../render/cursor';
import type { QRL } from '../import/qrl.public';

const ON_PROP_REGEX = /^(window:|document:|)on([A-Z]|-.).*Qrl$/;
const ON$_PROP_REGEX = /^(window:|document:|)on([A-Z]|-.).*\$$/;

export function isOnProp(prop: string): boolean {
  return ON_PROP_REGEX.test(prop);
}

export function isOn$Prop(prop: string): boolean {
  return ON$_PROP_REGEX.test(prop);
}

export function qPropWriteQRL(
  rctx: RenderContext | undefined,
  ctx: QContext,
  prop: string,
  value: QRL<any>[] | QRL<any>
) {
  if (!value) {
    return;
  }
  const existingQRLs = getExistingQRLs(ctx, prop);
  const newQRLs = Array.isArray(value) ? value : [value];
  for (const value of newQRLs) {
    const cp = (value as QRLInternal).copy();
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
      if (isSameQRL(qrl, cp)) {
        existingQRLs.splice(i, 1);
        i--;
      }
    }
    existingQRLs.push(cp);
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

export function getExistingQRLs(ctx: QContext, prop: string): QRLInternal[] {
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
