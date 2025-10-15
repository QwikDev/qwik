import { isDev } from '@qwik.dev/core/build';
import { VNodeDataFlag } from 'packages/qwik/src/server/types';
import type { VNodeData } from 'packages/qwik/src/server/vnode-data';
import { vnode_isVNode } from '../../client/vnode';
import { _EFFECT_BACK_REF } from '../../internal';
import { AsyncComputedSignalImpl } from '../../reactive-primitives/impl/async-computed-signal-impl';
import { ComputedSignalImpl } from '../../reactive-primitives/impl/computed-signal-impl';
import { SerializerSignalImpl } from '../../reactive-primitives/impl/serializer-signal-impl';
import { SignalImpl } from '../../reactive-primitives/impl/signal-impl';
import { getStoreHandler, getStoreTarget, isStore } from '../../reactive-primitives/impl/store';
import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { SubscriptionData } from '../../reactive-primitives/subscription-data';
import {
  EffectSubscriptionProp,
  NEEDS_COMPUTATION,
  SerializationSignalFlags,
  SignalFlags,
  STORE_ALL_PROPS,
  type EffectSubscription,
  type SerializerArg,
} from '../../reactive-primitives/types';
import { isSerializerObj } from '../../reactive-primitives/utils';
import type { SsrAttrs } from '../../ssr/ssr-types';
import type { ResourceReturnInternal } from '../../use/use-resource';
import { Task } from '../../use/use-task';
import { isQwikComponent, SERIALIZABLE_STATE } from '../component.public';
import { qError, QError } from '../error/error';
import { isJSXNode } from '../jsx/jsx-node';
import { Fragment } from '../jsx/jsx-runtime';
import { isPropsProxy } from '../jsx/props-proxy';
import { Slot } from '../jsx/slot.public';
import type { QRLInternal } from '../qrl/qrl-class';
import { isQrl } from '../qrl/qrl-utils';
import { _OWNER, _UNINITIALIZED } from '../utils/constants';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../utils/flyweight';
import { ELEMENT_ID, ELEMENT_PROPS, QBackRefs } from '../utils/markers';
import { isPromise } from '../utils/promises';
import { fastSkipSerialize, SerializerSymbol } from './verify';
import { Constants, TypeIds } from './constants';
import { qrlToString } from './qrl-to-string';
import { BackRef, type SeenRef, type SerializationContext } from './serialization-context';

/**
 * Format:
 *
 * - This encodes the $roots$ array.
 * - The output is a string of comma separated JSON values.
 * - Even values are always numbers, specifying the type of the next value.
 * - Odd values are numbers, strings (JSON stringified with `</` escaping) or arrays (same format).
 * - Therefore root indexes need to be doubled to get the actual index.
 */
export async function serialize(serializationContext: SerializationContext): Promise<void> {
  const {
    $writer$,
    $isSsrNode$,
    $isDomRef$,
    $storeProxyMap$,
    $addRoot$,
    $promoteToRoot$,
    getSeenRef,
    $markSeen$,
  } = serializationContext;
  let rootIdx = 0;
  const forwardRefs: number[] = [];
  let forwardRefsId = 0;
  const promises: Set<Promise<unknown>> = new Set();
  const preloadQrls = new Set<QRLInternal>();
  const s11nWeakRefs = new Map<unknown, number>();
  let parent: SeenRef | undefined;
  const qrlMap = new Map<string, QRLInternal>();

  /** Helper to output an array */
  const outputArray = (
    value: unknown[],
    keepNulls: boolean,
    writeFn: (value: unknown, idx: number) => void
  ) => {
    $writer$.write('[');
    let separator = false;
    let length;
    if (keepNulls) {
      length = value.length;
    } else {
      length = value.length - 1;
      while (length >= 0 && value[length] === null) {
        length--;
      }
      length++;
    }
    for (let i = 0; i < length; i++) {
      if (separator) {
        $writer$.write(',');
      } else {
        separator = true;
      }
      writeFn(value[i], i);
    }
    $writer$.write(']');
  };

  /** Output a type,value pair. If the value is an array, it calls writeValue on each item. */
  const output = (type: number, value: number | string | any[], keepNulls?: boolean) => {
    $writer$.write(`${type},`);
    if (typeof value === 'number') {
      $writer$.write(value.toString());
    } else if (typeof value === 'string') {
      const s = JSON.stringify(value);
      let angleBracketIdx: number = -1;
      let lastIdx = 0;
      while ((angleBracketIdx = s.indexOf('</', lastIdx)) !== -1) {
        $writer$.write(s.slice(lastIdx, angleBracketIdx));
        $writer$.write('<\\/');
        lastIdx = angleBracketIdx + 2;
      }
      $writer$.write(lastIdx === 0 ? s : s.slice(lastIdx));
    } else {
      outputArray(value, keepNulls!, (valueItem, idx) => {
        writeValue(valueItem, idx);
      });
    }
  };

  const addPreloadQrl = (qrl: QRLInternal) => {
    preloadQrls.add(qrl);
    serializationContext.$addRoot$(qrl);
  };

  const getSeenRefOrOutput = (
    value: unknown,
    index: number,
    keepWeak?: boolean
  ): SeenRef | undefined => {
    let seen = getSeenRef(value);

    const forwardRefIdx = !keepWeak && s11nWeakRefs.get(value);

    if (!seen) {
      if (keepWeak) {
        // we're testing a weakref, so don't mark it as seen yet
        return true as unknown as SeenRef;
      }
      // Maybe it's a weakref and that should count as seen
      if (typeof forwardRefIdx === 'number') {
        // Yes, no longer a weakref
        seen = $addRoot$(value, true);
      } else {
        return $markSeen$(value, parent, index);
      }
    }

    // Now that we saw it a second time, make sure it's a root
    if (seen.$parent$) {
      // Note, this means it was output before so we always need a backref
      // Special case: we're a root so instead of adding a backref, we replace ourself
      if (!parent) {
        $promoteToRoot$(seen, index);
        value = serializationContext.$roots$[index];
      } else {
        $promoteToRoot$(seen);
      }
    }

    // Check if there was a weakref to us
    if (typeof forwardRefIdx === 'number') {
      forwardRefs[forwardRefIdx] = seen.$index$;
      s11nWeakRefs.delete(value);
    }

    // Now we know it's a root and we should output a RootRef
    const rootIdx = value instanceof BackRef ? value.$path$ : seen.$index$;

    // But make sure we do output ourselves
    if (!parent && rootIdx === index) {
      return seen;
    }
    output(TypeIds.RootRef, rootIdx);
  };

  // First check for scalars, then do objects with seen checks
  // Make sure to only get the SeenRef once, it's expensive
  const writeValue = (value: unknown, index: number) => {
    if (fastSkipSerialize(value)) {
      output(TypeIds.Constant, Constants.Undefined);
    } else {
      switch (typeof value) {
        case 'undefined':
          output(TypeIds.Constant, Constants.Undefined);
          break;
        case 'boolean':
          output(TypeIds.Constant, value ? Constants.True : Constants.False);
          break;
        case 'number':
          if (Number.isNaN(value)) {
            output(TypeIds.Constant, Constants.NaN);
          } else if (!Number.isFinite(value)) {
            output(
              TypeIds.Constant,
              value < 0 ? Constants.NegativeInfinity : Constants.PositiveInfinity
            );
          } else if (value === Number.MAX_SAFE_INTEGER) {
            output(TypeIds.Constant, Constants.MaxSafeInt);
          } else if (value === Number.MAX_SAFE_INTEGER - 1) {
            output(TypeIds.Constant, Constants.AlmostMaxSafeInt);
          } else if (value === Number.MIN_SAFE_INTEGER) {
            output(TypeIds.Constant, Constants.MinSafeInt);
          } else {
            output(TypeIds.Plain, value);
          }
          break;
        case 'string':
          if (value.length === 0) {
            output(TypeIds.Constant, Constants.EmptyString);
          } else {
            // If the string is short, we output directly
            // Very short strings add overhead to tracking
            if (value.length < 4 || getSeenRefOrOutput(value, index)) {
              output(TypeIds.Plain, value);
            }
          }
          break;
        case 'bigint':
          if ((value < 10000 && value > -1000) || getSeenRefOrOutput(value, index)) {
            output(TypeIds.BigInt, value.toString());
          }
          break;
        case 'symbol':
          if (value === NEEDS_COMPUTATION) {
            output(TypeIds.Constant, Constants.NEEDS_COMPUTATION);
          } else if (value === STORE_ALL_PROPS) {
            output(TypeIds.Constant, Constants.STORE_ALL_PROPS);
          } else if (value === _UNINITIALIZED) {
            output(TypeIds.Constant, Constants.UNINITIALIZED);
          }
          break;
        case 'function':
          if (value === Slot) {
            output(TypeIds.Constant, Constants.Slot);
          } else if (value === Fragment) {
            output(TypeIds.Constant, Constants.Fragment);
          } else if (isQrl(value)) {
            if (getSeenRefOrOutput(value, index)) {
              const [chunk, symbol, captureIds] = qrlToString(serializationContext, value, true);
              let data: string | number;
              if (chunk !== '') {
                // not a sync QRL, replace all parts with string references
                data = `${$addRoot$(chunk)} ${$addRoot$(symbol)}${captureIds ? ' ' + captureIds.join(' ') : ''}`;
                // Since we map QRLs to strings, we need to keep track of this secondary mapping
                const existing = qrlMap.get(data);
                if (existing) {
                  // We encountered the same QRL again, make it a root
                  const ref = $addRoot$(existing);
                  output(TypeIds.RootRef, ref);
                  return;
                } else {
                  qrlMap.set(data, value);
                }
              } else {
                data = Number(symbol);
              }

              const type = preloadQrls.has(value) ? TypeIds.PreloadQRL : TypeIds.QRL;
              output(type, data);
            }
          } else if (isQwikComponent(value)) {
            const [qrl]: [QRLInternal] = (value as any)[SERIALIZABLE_STATE];
            serializationContext.$renderSymbols$.add(qrl.$symbol$);
            output(TypeIds.Component, [qrl]);
          } else {
            throw qError(QError.serializeErrorCannotSerializeFunction, [value.toString()]);
          }
          break;
        case 'object':
          if (value === EMPTY_ARRAY) {
            output(TypeIds.Constant, Constants.EMPTY_ARRAY);
          } else if (value === EMPTY_OBJ) {
            output(TypeIds.Constant, Constants.EMPTY_OBJ);
          } else if (value === null) {
            output(TypeIds.Constant, Constants.Null);
          } else if (value instanceof BackRef) {
            output(TypeIds.RootRef, value.$path$);
          } else {
            const newSeenRef = getSeenRefOrOutput(value, index);
            if (newSeenRef) {
              const oldParent = parent;
              parent = newSeenRef;
              // separate function for readability
              writeObjectValue(value);
              parent = oldParent;
            }
          }
          break;
        default:
          throw qError(QError.serializeErrorUnknownType, [typeof value]);
      }
    }
  };

  const writeObjectValue = (value: {}) => {
    if (isPropsProxy(value)) {
      const owner = value[_OWNER];
      output(TypeIds.PropsProxy, [_serializationWeakRef(owner), owner.varProps, owner.constProps]);
    } else if (value instanceof SubscriptionData) {
      output(TypeIds.SubscriptionData, [value.data.$scopedStyleIdPrefix$, value.data.$isConst$]);
    } else if (isStore(value)) {
      if (isResource(value)) {
        // let render know about the resource
        serializationContext.$resources$.add(value);
        // TODO the effects include the resource return which has duplicate data
        const forwardRefId = resolvePromise(value.value, $addRoot$, (resolved, resolvedValue) => {
          return new PromiseResult(
            TypeIds.Resource,
            resolved,
            resolvedValue,
            getStoreHandler(value)!.$effects$
          );
        });
        output(TypeIds.ForwardRef, forwardRefId);
      } else {
        const storeHandler = getStoreHandler(value)!;
        const storeTarget = getStoreTarget(value);
        const flags = storeHandler.$flags$;
        const effects = storeHandler.$effects$;

        // We need to retain the nested stores too, they won't be found from the target
        const innerStores = [];
        for (const prop in storeTarget) {
          const propValue = (storeTarget as any)[prop];
          const innerStore = $storeProxyMap$.get(propValue);
          if (innerStore) {
            innerStores.push(innerStore);
          }
        }

        const out = [storeTarget, flags, effects, ...innerStores];
        while (out[out.length - 1] == null) {
          out.pop();
        }
        output(TypeIds.Store, out);
      }
    } else if (isSerializerObj(value)) {
      const result = value[SerializerSymbol](value);
      if (isPromise(result)) {
        const forwardRef = resolvePromise(result, $addRoot$, (resolved, resolvedValue) => {
          return new PromiseResult(TypeIds.SerializerSignal, resolved, resolvedValue, null, null);
        });
        output(TypeIds.ForwardRef, forwardRef);
      } else {
        // We replace ourselves with this value
        const index = parent!.$index$;
        parent = parent!.$parent$!;
        writeValue(result, index);
      }
    } else if (isObjectLiteral(value)) {
      if (Array.isArray(value)) {
        output(TypeIds.Array, value);
      } else {
        const out: any[] = [];
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            const subVal = (value as any)[key];
            if (!fastSkipSerialize(subVal)) {
              out.push(key, subVal);
            }
          }
        }
        output(TypeIds.Object, out.length ? out : 0);
      }
    } else if ($isDomRef$(value)) {
      value.$ssrNode$.vnodeData[0] |= VNodeDataFlag.SERIALIZE;
      output(TypeIds.RefVNode, value.$ssrNode$.id);
    } else if (value instanceof SignalImpl) {
      if (value instanceof SerializerSignalImpl) {
        addPreloadQrl(value.$computeQrl$);
        const forwardRefId = resolvePromise(
          getCustomSerializerPromise(value, value.$untrackedValue$),
          $addRoot$,
          (resolved, resolvedValue) => {
            return new PromiseResult(
              TypeIds.SerializerSignal,
              resolved,
              resolvedValue,
              value.$effects$,
              value.$computeQrl$
            );
          }
        );
        output(TypeIds.ForwardRef, forwardRefId);
        return;
      }

      if (value instanceof WrappedSignalImpl) {
        output(TypeIds.WrappedSignal, [
          ...serializeWrappingFn(serializationContext, value),
          filterEffectBackRefs(value[_EFFECT_BACK_REF]),
          value.$flags$,
          value.$hostElement$,
          ...(value.$effects$ || []),
        ]);
      } else if (value instanceof ComputedSignalImpl) {
        let v = value.$untrackedValue$;
        const shouldAlwaysSerialize =
          value.$flags$ & SerializationSignalFlags.SERIALIZATION_STRATEGY_ALWAYS;
        const shouldNeverSerialize =
          value.$flags$ & SerializationSignalFlags.SERIALIZATION_STRATEGY_NEVER;
        const isInvalid = value.$flags$ & SignalFlags.INVALID;
        const isSkippable = fastSkipSerialize(value.$untrackedValue$);

        if (shouldAlwaysSerialize) {
          v = value.$untrackedValue$;
        } else if (shouldNeverSerialize) {
          v = NEEDS_COMPUTATION;
        } else if (isInvalid || isSkippable) {
          v = NEEDS_COMPUTATION;
        }
        addPreloadQrl(value.$computeQrl$);

        const out: unknown[] = [value.$computeQrl$, value.$effects$];
        const isAsync = value instanceof AsyncComputedSignalImpl;
        if (isAsync) {
          out.push(
            value.$loadingEffects$,
            value.$errorEffects$,
            value.$untrackedLoading$,
            value.$untrackedError$
          );
        }

        if (v !== NEEDS_COMPUTATION) {
          out.push(v);
        }
        output(isAsync ? TypeIds.AsyncComputedSignal : TypeIds.ComputedSignal, out);
      } else {
        output(TypeIds.Signal, [value.$untrackedValue$, ...(value.$effects$ || [])]);
      }
    } else if (value instanceof URL) {
      output(TypeIds.URL, value.href);
    } else if (value instanceof Date) {
      output(TypeIds.Date, Number.isNaN(value.valueOf()) ? '' : value.valueOf());
    } else if (value instanceof RegExp) {
      output(TypeIds.Regex, value.toString());
    } else if (value instanceof Error) {
      const out: any[] = [value.message];
      // flatten gives us the right output
      out.push(...Object.entries(value).flat());
      /// In production we don't want to leak the stack trace.
      if (isDev) {
        out.push('stack', value.stack);
      }
      output(TypeIds.Error, out);
    } else if ($isSsrNode$(value)) {
      const rootIndex = $addRoot$(value);
      serializationContext.$setProp$(value, ELEMENT_ID, String(rootIndex));
      // we need to output before the vnode overwrites its values
      output(TypeIds.VNode, value.id);
      const vNodeData = value.vnodeData;
      if (vNodeData) {
        discoverValuesForVNodeData(vNodeData, (vNodeDataValue) => $addRoot$(vNodeDataValue));
        vNodeData[0] |= VNodeDataFlag.SERIALIZE;
      }
      if (value.children) {
        // can be static, but we need to save vnode data structure + discover the back refs
        for (const child of value.children) {
          const childVNodeData = child.vnodeData;
          if (childVNodeData) {
            // add all back refs to the roots
            for (const value of childVNodeData) {
              if (isSsrAttrs(value)) {
                const backRefKeyIndex = value.findIndex((v) => v === QBackRefs);
                if (backRefKeyIndex !== -1) {
                  $addRoot$(value[backRefKeyIndex + 1]);
                }
              }
            }
            childVNodeData[0] |= VNodeDataFlag.SERIALIZE;
          }
        }
      }
    } else if (typeof FormData !== 'undefined' && value instanceof FormData) {
      // FormData is generally used only once so don't bother with references
      const array: string[] = [];
      value.forEach((value, key) => {
        if (typeof value === 'string') {
          array.push(key, value);
        } else {
          array.push(key, value.name);
        }
      });
      output(TypeIds.FormData, array);
    } else if (value instanceof URLSearchParams) {
      output(TypeIds.URLSearchParams, value.toString());
    } else if (value instanceof Set) {
      output(TypeIds.Set, [...value.values()]);
    } else if (value instanceof Map) {
      const combined = [];
      for (const [k, v] of value.entries()) {
        combined.push(k, v);
      }
      output(TypeIds.Map, combined);
    } else if (isJSXNode(value)) {
      const out = [
        value.type,
        value.key,
        value.varProps,
        value.constProps,
        value.children,
        value.toSort || null,
      ];
      while (out[out.length - 1] == null) {
        out.pop();
      }
      output(TypeIds.JSXNode, out);
    } else if (value instanceof Task) {
      const out: unknown[] = [
        value.$qrl$,
        value.$flags$,
        value.$index$,
        value.$el$,
        value[_EFFECT_BACK_REF],
        value.$state$,
      ];
      while (out[out.length - 1] == null) {
        out.pop();
      }
      output(TypeIds.Task, out);
    } else if (isPromise(value)) {
      const forwardRefId = resolvePromise(value, $addRoot$, (resolved, resolvedValue) => {
        return new PromiseResult(TypeIds.Promise, resolved, resolvedValue);
      });
      output(TypeIds.ForwardRef, forwardRefId);
    } else if (value instanceof PromiseResult) {
      if (value.$type$ === TypeIds.Resource) {
        output(TypeIds.Resource, [value.$resolved$, value.$value$, value.$effects$]);
      } else if (value.$type$ === TypeIds.SerializerSignal) {
        if (value.$qrl$) {
          output(TypeIds.SerializerSignal, [value.$qrl$, value.$effects$, value.$value$]);
        } else if (value.$resolved$) {
          // We replace ourselves with this value
          const index = parent!.$index$;
          parent = parent!.$parent$!;
          writeValue(value.$value$, index);
        } else {
          console.error(value.$value$);
          throw qError(QError.serializerSymbolRejectedPromise);
        }
      } else {
        output(TypeIds.Promise, [value.$resolved$, value.$value$]);
      }
    } else if (value instanceof Uint8Array) {
      let buf = '';
      for (const c of value) {
        buf += String.fromCharCode(c);
      }
      const out = btoa(buf).replace(/=+$/, '');
      output(TypeIds.Uint8Array, out);
    } else if (value instanceof SerializationWeakRef) {
      const obj = value.$obj$;
      // This will return a fake SeenRef if it's not been seen before
      if (getSeenRefOrOutput(obj, parent!.$index$, true)) {
        let forwardRefId = s11nWeakRefs.get(obj);
        if (forwardRefId === undefined) {
          forwardRefId = forwardRefsId++;
          s11nWeakRefs.set(obj, forwardRefId);
          forwardRefs[forwardRefId] = -1;
        }
        output(TypeIds.ForwardRef, forwardRefId);
      }
    } else if (vnode_isVNode(value)) {
      output(TypeIds.Constant, Constants.Undefined);
    } else {
      throw qError(QError.serializeErrorUnknownType, [typeof value]);
    }
  };

  function resolvePromise(
    promise: Promise<unknown>,
    $addRoot$: (obj: unknown) => number,
    classCreator: (resolved: boolean, resolvedValue: unknown) => PromiseResult
  ) {
    const forwardRefId = forwardRefsId++;
    promise
      .then((resolvedValue) => {
        promises.delete(promise);
        forwardRefs[forwardRefId] = $addRoot$(classCreator(true, resolvedValue)) as number;
      })
      .catch((err) => {
        promises.delete(promise);
        forwardRefs[forwardRefId] = $addRoot$(classCreator(false, err)) as number;
      });

    promises.add(promise);

    return forwardRefId;
  }

  const outputRoots = async () => {
    $writer$.write('[');
    const { $roots$ } = serializationContext;
    while (rootIdx < $roots$.length || promises.size) {
      if (rootIdx !== 0) {
        $writer$.write(',');
      }

      let separator = false;
      for (; rootIdx < $roots$.length; rootIdx++) {
        if (separator) {
          $writer$.write(',');
        } else {
          separator = true;
        }
        writeValue($roots$[rootIdx], rootIdx);
      }

      if (promises.size) {
        try {
          await Promise.race(promises);
        } catch {
          // ignore rejections, they will be serialized as rejected promises
        }
      }
    }

    if (forwardRefs.length) {
      let lastIdx = forwardRefs.length - 1;
      while (lastIdx >= 0 && forwardRefs[lastIdx] === -1) {
        lastIdx--;
      }
      if (lastIdx >= 0) {
        $writer$.write(',');
        $writer$.write(TypeIds.ForwardRefs + ',');
        const out =
          lastIdx === forwardRefs.length - 1 ? forwardRefs : forwardRefs.slice(0, lastIdx + 1);
        // We could also implement RLE of -1 values
        outputArray(out, true, (value) => {
          $writer$.write(String(value));
        });
      }
    }

    $writer$.write(']');
  };

  await outputRoots();
}
export class PromiseResult {
  constructor(
    public $type$: number,
    public $resolved$: boolean,
    public $value$: unknown,
    public $effects$:
      | Map<string | symbol, Set<EffectSubscription>>
      | Set<EffectSubscription>
      | null = null,
    public $qrl$: QRLInternal | null = null
  ) {}
}
function getCustomSerializerPromise<T, S>(signal: SerializerSignalImpl<T, S>, value: any) {
  return new Promise((resolve) => {
    (signal.$computeQrl$ as QRLInternal<SerializerArg<T, S>>).resolve().then((arg) => {
      let data;
      if ((arg as any).serialize) {
        data = (arg as any).serialize(value);
      } else if (SerializerSymbol in value) {
        data = (value as any)[SerializerSymbol](value);
      }
      if (data === undefined) {
        data = NEEDS_COMPUTATION;
      }
      resolve(data);
    });
  });
}

const discoverValuesForVNodeData = (vnodeData: VNodeData, callback: (value: unknown) => void) => {
  for (const value of vnodeData) {
    if (isSsrAttrs(value)) {
      for (let i = 1; i < value.length; i += 2) {
        const keyValue = value[i - 1];
        const attrValue = value[i];
        if (
          attrValue == null ||
          typeof attrValue === 'string' ||
          // skip empty props
          (keyValue === ELEMENT_PROPS &&
            Object.keys(attrValue as Record<string, unknown>).length === 0)
        ) {
          continue;
        }
        callback(attrValue);
      }
    }
  }
};

const isSsrAttrs = (value: number | SsrAttrs): value is SsrAttrs =>
  Array.isArray(value) && value.length > 0;

/**
 * When serializing the object we need check if it is URL, RegExp, Map, Set, etc. This is time
 * consuming. So if we could know that this is a basic object literal we could skip the check, and
 * only run the checks for objects which are not object literals.
 *
 * So this function is here for performance to short circuit many checks later.
 *
 * @param obj
 */
function isObjectLiteral(obj: unknown): obj is object {
  // We are an object literal if:
  // - we are a direct instance of object OR
  // - we are an array
  // In all other cases it is a subclass which requires more checks.
  const prototype = Object.getPrototypeOf(obj);
  return prototype == null || prototype === Object.prototype || prototype === Array.prototype;
}

function isResource<T = unknown>(value: object): value is ResourceReturnInternal<T> {
  return '__brand' in value && value.__brand === 'resource';
}

function serializeWrappingFn(
  serializationContext: SerializationContext,
  value: WrappedSignalImpl<any>
) {
  // if value is an object then we need to wrap this in ()
  if (value.$funcStr$ && value.$funcStr$[0] === '{') {
    value.$funcStr$ = `(${value.$funcStr$})`;
  }
  const syncFnId = serializationContext.$addSyncFn$(
    value.$funcStr$,
    value.$args$.length,
    value.$func$
  );
  return [syncFnId, value.$args$] as const;
}

function filterEffectBackRefs(effectBackRef: Map<string, EffectSubscription> | null) {
  let effectBackRefToSerialize: Map<string, EffectSubscription> | null = null;
  if (effectBackRef) {
    for (const [effectProp, effect] of effectBackRef) {
      if (effect[EffectSubscriptionProp.BACK_REF]) {
        effectBackRefToSerialize ||= new Map<string, EffectSubscription>();
        effectBackRefToSerialize.set(effectProp, effect);
      }
    }
  }
  return effectBackRefToSerialize;
}

class SerializationWeakRef {
  constructor(public $obj$: unknown) {}
}

/** @internal */
export const _serializationWeakRef = (obj: unknown) => new SerializationWeakRef(obj);
