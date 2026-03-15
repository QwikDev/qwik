import { isDev } from '@qwik.dev/core/build';
import { VNodeDataFlag, type StreamWriter } from '../../../server/types';
import type { VNodeData } from '../../../server/vnode-data';
import { vnode_isVNode } from '../../client/vnode-utils';
import { AsyncSignalImpl } from '../../reactive-primitives/impl/async-signal-impl';
import { ComputedSignalImpl } from '../../reactive-primitives/impl/computed-signal-impl';
import { SerializerSignalImpl } from '../../reactive-primitives/impl/serializer-signal-impl';
import { SignalImpl } from '../../reactive-primitives/impl/signal-impl';
import { getStoreHandler, getStoreTarget, isStore } from '../../reactive-primitives/impl/store';
import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { SubscriptionData } from '../../reactive-primitives/subscription-data';
import {
  EffectSubscription,
  NEEDS_COMPUTATION,
  SerializationSignalFlags,
  SignalFlags,
  STORE_ALL_PROPS,
  type SerializerArg,
} from '../../reactive-primitives/types';
import { isSerializerObj } from '../../reactive-primitives/utils';
import { Task } from '../../use/use-task';
import { isQwikComponent, SERIALIZABLE_STATE } from '../component.public';
import { qError, QError } from '../error/error';
import { isJSXNode } from '../jsx/jsx-node';
import { Fragment, type Props } from '../jsx/jsx-runtime';
import { isPropsProxy } from '../jsx/props-proxy';
import { Slot } from '../jsx/slot.public';
import type { QRLInternal } from '../qrl/qrl-class';
import { isQrl } from '../qrl/qrl-utils';
import { _OWNER, _PROPS_HANDLER, _UNINITIALIZED } from '../utils/constants';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../utils/flyweight';
import { ELEMENT_ID, ELEMENT_PROPS, QBackRefs } from '../utils/markers';
import { isPromise, maybeThen } from '../utils/promises';
import { fastSkipSerialize, SerializerSymbol } from './verify';
import { Constants, TypeIds } from './constants';
import { qrlToString } from './qrl-to-string';
import {
  SerializationBackRef,
  type SeenRef,
  type SerializationContext,
} from './serialization-context';
import { isObjectEmpty } from '../utils/objects';
import {
  BRACKET_CLOSE,
  BRACKET_OPEN,
  CLOSE_TAG,
  COMMA,
  ESCAPED_CLOSE_TAG,
  QUOTE,
} from '../ssr-const';
import { _EFFECT_BACK_REF } from '../../reactive-primitives/backref';

/**
 * Format:
 *
 * - This encodes the $roots$ array.
 * - The output is a string of comma separated JSON values.
 * - Even values are always numbers, specifying the type of the next value.
 * - Odd values are numbers, strings (JSON stringified with `</` escaping) or arrays (same format).
 * - Therefore root indexes need to be doubled to get the actual index.
 */
export class Serializer {
  private $rootIdx$ = 0;
  private $forwardRefs$: number[] = [];
  private $forwardRefsId$ = 0;
  private $promises$: Set<Promise<unknown>> = new Set();
  private $s11nWeakRefs$ = new Map<unknown, number>();
  private $parent$: SeenRef | undefined;
  private $qrlMap$ = new Map<string, QRLInternal>();
  private $writer$: StreamWriter;

  constructor(public $serializationContext$: SerializationContext) {
    this.$writer$ = $serializationContext$.$writer$;
  }

  async serialize(): Promise<void> {
    await this.outputRoots();
  }

  /** Helper to output an array */
  private outputArray(
    value: unknown[],
    keepUndefined: boolean,
    writeFn: (value: unknown, idx: number) => void
  ) {
    this.$writer$.write(BRACKET_OPEN);
    let separator = false;
    let length;
    if (keepUndefined) {
      length = value.length;
    } else {
      length = value.length - 1;
      while (length >= 0 && value[length] === undefined) {
        length--;
      }
      length++;
    }
    for (let i = 0; i < length; i++) {
      if (separator) {
        this.$writer$.write(COMMA);
      } else {
        separator = true;
      }
      writeFn(value[i], i);
    }
    this.$writer$.write(BRACKET_CLOSE);
  }

  /** Whether a string needs JSON escaping (quote, backslash, or control chars). */
  private stringNeedsJsonEscape$(str: string): boolean {
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 32 || c === 34 || c === 92) {
        return true;
      }
    }
    return false;
  }

  /** Output a type,value pair. If the value is an array, it calls writeValue on each item. */
  private output(type: number, value: number | string | any[], keepUndefined?: boolean) {
    if (typeof value === 'number') {
      this.$writer$.write(type + COMMA + value);
    } else if (typeof value === 'string') {
      const s = this.stringNeedsJsonEscape$(value) ? JSON.stringify(value) : QUOTE + value + QUOTE;
      this.$writer$.write(type + COMMA);
      let angleBracketIdx: number = -1;
      let lastIdx = 0;
      while ((angleBracketIdx = s.indexOf(CLOSE_TAG, lastIdx)) !== -1) {
        this.$writer$.write(s.slice(lastIdx, angleBracketIdx));
        this.$writer$.write(ESCAPED_CLOSE_TAG);
        lastIdx = angleBracketIdx + 2;
      }
      this.$writer$.write(lastIdx === 0 ? s : s.slice(lastIdx));
    } else {
      this.$writer$.write(type + COMMA);
      this.outputArray(value, !!keepUndefined, (valueItem, idx) => {
        this.writeValue(valueItem, idx);
      });
    }
  }

  private getSeenRefOrOutput(
    value: unknown,
    index: number,
    keepWeak?: boolean
  ): SeenRef | undefined {
    let seen = this.$serializationContext$.getSeenRef(value);

    const forwardRefIdx = !keepWeak && this.$s11nWeakRefs$.get(value);

    if (!seen) {
      if (keepWeak) {
        // we're testing a weakref, so don't mark it as seen yet
        return true as unknown as SeenRef;
      }
      // Maybe it's a weakref and that should count as seen
      if (typeof forwardRefIdx === 'number') {
        // Yes, no longer a weakref
        seen = this.$serializationContext$.$addRoot$(value, true);
      } else {
        return this.$serializationContext$.$markSeen$(value, this.$parent$, index);
      }
    }

    // Now that we saw it a second time, make sure it's a root
    if (seen.$parent$) {
      // Note, this means it was output before so we always need a backref
      // Special case: we're a root so instead of adding a backref, we replace ourself
      if (!this.$parent$) {
        this.$serializationContext$.$promoteToRoot$(seen, index);
        value = this.$serializationContext$.$roots$[index];
      } else {
        this.$serializationContext$.$promoteToRoot$(seen);
      }
    }

    // Check if there was a weakref to us
    if (typeof forwardRefIdx === 'number') {
      this.$forwardRefs$[forwardRefIdx] = seen.$index$;
      this.$s11nWeakRefs$.delete(value);
    }

    // Now we know it's a root and we should output a RootRef
    const rootIdx = value instanceof SerializationBackRef ? value.$path$ : seen.$index$;

    // But make sure we do output ourselves
    if (!this.$parent$ && rootIdx === index) {
      return seen;
    }
    this.output(TypeIds.RootRef, rootIdx);
  }

  // First check for scalars, then do objects with seen checks
  // Make sure to only get the SeenRef once, it's expensive
  private writeValue(value: unknown, index: number) {
    if (fastSkipSerialize(value)) {
      this.output(TypeIds.Constant, Constants.Undefined);
    } else {
      switch (typeof value) {
        case 'undefined':
          this.output(TypeIds.Constant, Constants.Undefined);
          break;
        case 'boolean':
          this.output(TypeIds.Constant, value ? Constants.True : Constants.False);
          break;
        case 'number':
          if (Number.isNaN(value)) {
            this.output(TypeIds.Constant, Constants.NaN);
          } else if (!Number.isFinite(value)) {
            this.output(
              TypeIds.Constant,
              value < 0 ? Constants.NegativeInfinity : Constants.PositiveInfinity
            );
          } else if (value === Number.MAX_SAFE_INTEGER) {
            this.output(TypeIds.Constant, Constants.MaxSafeInt);
          } else if (value === Number.MAX_SAFE_INTEGER - 1) {
            this.output(TypeIds.Constant, Constants.AlmostMaxSafeInt);
          } else if (value === Number.MIN_SAFE_INTEGER) {
            this.output(TypeIds.Constant, Constants.MinSafeInt);
          } else {
            this.output(TypeIds.Plain, value);
          }
          break;
        case 'string':
          if (value.length === 0) {
            this.output(TypeIds.Constant, Constants.EmptyString);
          } else {
            // If the string is short, we output directly
            // Very short strings add overhead to tracking
            if (value.length < 4 || this.getSeenRefOrOutput(value, index)) {
              this.output(TypeIds.Plain, value);
            }
          }
          break;
        case 'bigint':
          if ((value < 10000 && value > -1000) || this.getSeenRefOrOutput(value, index)) {
            this.output(TypeIds.BigInt, value.toString());
          }
          break;
        case 'symbol':
          if (value === NEEDS_COMPUTATION) {
            this.output(TypeIds.Constant, Constants.NEEDS_COMPUTATION);
          } else if (value === STORE_ALL_PROPS) {
            this.output(TypeIds.Constant, Constants.STORE_ALL_PROPS);
          } else if (value === _UNINITIALIZED) {
            this.output(TypeIds.Constant, Constants.UNINITIALIZED);
          }
          break;
        case 'function':
          if (value === Slot) {
            this.output(TypeIds.Constant, Constants.Slot);
          } else if (value === Fragment) {
            this.output(TypeIds.Constant, Constants.Fragment);
          } else if (isQrl(value)) {
            if (this.getSeenRefOrOutput(value, index)) {
              const [chunk, symbol, captures] = qrlToString(
                this.$serializationContext$,
                value,
                true
              );
              let data: string | number;
              if (chunk !== '') {
                // not a sync QRL, replace all parts with string references
                data = `${this.$serializationContext$.$addRoot$(chunk)}#${this.$serializationContext$.$addRoot$(symbol)}${captures ? '#' + captures : ''}`;
                // Since we map QRLs to strings, we need to keep track of this secondary mapping
                const existing = this.$qrlMap$.get(data);
                if (existing) {
                  // We encountered the same QRL again, make it a root
                  const ref = this.$serializationContext$.$addRoot$(existing);
                  this.output(TypeIds.RootRef, ref);
                  return;
                } else {
                  this.$qrlMap$.set(data, value);
                }
              } else {
                // sync QRL
                data = Number(symbol);
              }

              this.output(TypeIds.QRL, data);
            }
          } else if (isQwikComponent(value)) {
            const [qrl]: [QRLInternal] = (value as any)[SERIALIZABLE_STATE];
            this.$serializationContext$.$renderSymbols$.add(qrl.$symbol$);
            this.output(TypeIds.Component, [qrl]);
          } else {
            throw qError(QError.serializeErrorCannotSerializeFunction, [value.toString()]);
          }
          break;
        case 'object':
          if (value === EMPTY_ARRAY) {
            this.output(TypeIds.Constant, Constants.EMPTY_ARRAY);
          } else if (value === EMPTY_OBJ) {
            this.output(TypeIds.Constant, Constants.EMPTY_OBJ);
          } else if (value === null) {
            this.output(TypeIds.Constant, Constants.Null);
          } else if (value instanceof SerializationBackRef) {
            this.output(TypeIds.RootRef, value.$path$);
          } else {
            const newSeenRef = this.getSeenRefOrOutput(value, index);
            if (newSeenRef) {
              const oldParent = this.$parent$;
              this.$parent$ = newSeenRef;
              // separate function for readability
              this.writeObjectValue(value);
              this.$parent$ = oldParent;
            }
          }
          break;
        default:
          throw qError(QError.serializeErrorUnknownType, [typeof value]);
      }
    }
  }

  private writeObjectValue(value: {}) {
    if (isPropsProxy(value)) {
      const owner = value[_OWNER];
      this.output(TypeIds.PropsProxy, [
        _serializationWeakRef(owner),
        owner.varProps,
        owner.constProps,
        value[_PROPS_HANDLER].$effects$,
      ]);
    } else if (value instanceof SubscriptionData) {
      this.output(TypeIds.SubscriptionData, [
        value.data.$scopedStyleIdPrefix$,
        value.data.$isConst$,
      ]);
    } else if (value instanceof EffectSubscription) {
      this.output(TypeIds.EffectSubscription, [value.consumer, value.property, value.data]);
    } else if (isStore(value)) {
      const storeHandler = getStoreHandler(value)!;
      const storeTarget = getStoreTarget(value);
      const flags = storeHandler.$flags$;
      const effects = storeHandler.$effects$;

      // We need to retain the nested stores too, they won't be found from the target
      const innerStores = [];
      for (const prop in storeTarget) {
        const propValue = (storeTarget as any)[prop];
        const innerStore = this.$serializationContext$.$storeProxyMap$.get(propValue);
        if (innerStore) {
          innerStores.push(innerStore);
        }
      }

      const out = [storeTarget, flags, effects, ...innerStores];
      while (out[out.length - 1] === undefined) {
        out.pop();
      }
      this.output(TypeIds.Store, out);
    } else if (isSerializerObj(value)) {
      const result = value[SerializerSymbol](value);
      if (isPromise(result)) {
        const forwardRef = this.resolvePromise(result, (resolved, resolvedValue) => {
          return new PromiseResult(
            TypeIds.SerializerSignal,
            resolved,
            resolvedValue,
            undefined,
            undefined
          );
        });
        this.output(TypeIds.ForwardRef, forwardRef);
      } else {
        // We replace ourselves with this value
        const index = this.$parent$!.$index$;
        this.$parent$ = this.$parent$!.$parent$!;
        this.writeValue(result, index);
      }
    } else if (isObjectLiteral(value)) {
      if (Array.isArray(value)) {
        this.output(TypeIds.Array, value);
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
        this.output(TypeIds.Object, out.length ? out : 0);
      }
    } else if (this.$serializationContext$.$isDomRef$(value)) {
      value.$ssrNode$.vnodeData[0] |= VNodeDataFlag.SERIALIZE;
      this.output(TypeIds.RefVNode, value.$ssrNode$.id);
    } else if (value instanceof SignalImpl) {
      if (value instanceof SerializerSignalImpl) {
        const maybeValue = getCustomSerializerPromise(value, value.$untrackedValue$);
        if (isPromise(maybeValue)) {
          const forwardRefId = this.resolvePromise(maybeValue, (resolved, resolvedValue) => {
            return new PromiseResult(
              TypeIds.SerializerSignal,
              resolved,
              resolvedValue,
              value.$effects$,
              value.$computeQrl$
            );
          });
          this.output(TypeIds.ForwardRef, forwardRefId);
        } else {
          this.output(TypeIds.SerializerSignal, [value.$computeQrl$, value.$effects$, maybeValue]);
        }
        return;
      }

      if (value instanceof WrappedSignalImpl) {
        this.output(TypeIds.WrappedSignal, [
          ...serializeWrappingFn(this.$serializationContext$, value),
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
        const isAsync = value instanceof AsyncSignalImpl;
        const interval = isAsync && value.$interval$ > 0 ? value.$interval$ : undefined;
        const concurrency = isAsync && value.$concurrency$ !== 1 ? value.$concurrency$ : undefined;
        const timeout = isAsync && value.$timeoutMs$ !== 0 ? value.$timeoutMs$ : undefined;

        // Send the flags but remove the serialization bits and default to 0 when undefined
        const asyncFlags =
          (isAsync && value.$flags$ & ~SerializationSignalFlags.SERIALIZATION_ALL_STRATEGIES) ||
          undefined;

        if (isInvalid || isSkippable) {
          v = NEEDS_COMPUTATION;
        } else if (shouldAlwaysSerialize) {
          v = value.$untrackedValue$;
        } else if (shouldNeverSerialize) {
          v = NEEDS_COMPUTATION;
        }

        const out: unknown[] = [value.$computeQrl$, value.$effects$];
        if (isAsync) {
          // After SSR, the signal is never loading, so no need to send it
          out.push(value.$loadingEffects$, value.$errorEffects$, value.$untrackedError$);
          out.push(asyncFlags || undefined);
        }

        let keepUndefined = false;

        if (
          v !== NEEDS_COMPUTATION ||
          interval !== undefined ||
          concurrency !== undefined ||
          timeout !== undefined
        ) {
          out.push(v);

          if (v === undefined) {
            /**
             * If value is undefined, we need to keep it in the output. If we don't do that, later
             * during resuming, the value will be set to symbol(invalid) with flag invalid, and
             * thats is incorrect.
             */
            keepUndefined = true;
          }
        }
        if (isAsync) {
          out.push(interval);
          out.push(concurrency);
          out.push(timeout);
        }
        this.output(isAsync ? TypeIds.AsyncSignal : TypeIds.ComputedSignal, out, keepUndefined);
      } else {
        const v = value.$untrackedValue$;
        const keepUndefined = v === undefined;
        const out = [v];
        if (value.$effects$) {
          out.push(...value.$effects$);
        }
        this.output(TypeIds.Signal, out, keepUndefined);
      }
    } else if (value instanceof URL) {
      this.output(TypeIds.URL, value.href);
    } else if (value instanceof Date) {
      this.output(TypeIds.Date, Number.isNaN(value.valueOf()) ? '' : value.valueOf());
    } else if (value instanceof RegExp) {
      this.output(TypeIds.Regex, value.toString());
    } else if (value instanceof Error) {
      const out: any[] = [value.message];
      // flatten gives us the right output
      out.push(...Object.entries(value).flat());
      /// In production we don't want to leak the stack trace.
      if (isDev) {
        out.push('stack', value.stack);
      }
      this.output(TypeIds.Error, out);
    } else if (this.$serializationContext$.$isSsrNode$(value)) {
      const rootIndex = this.$serializationContext$.$addRoot$(value);
      this.$serializationContext$.$setProp$(value, ELEMENT_ID, String(rootIndex));
      // we need to output before the vnode overwrites its values
      this.output(TypeIds.VNode, value.id);
      const vNodeData = value.vnodeData;
      if (vNodeData) {
        discoverValuesForVNodeData(vNodeData, (vNodeDataValue) =>
          this.$serializationContext$.$addRoot$(vNodeDataValue)
        );
        vNodeData[0] |= VNodeDataFlag.SERIALIZE;
      }
      if (value.children) {
        // can be static, but we need to save vnode data structure + discover the back refs
        const childrenLength = value.children.length;
        for (let i = 0; i < childrenLength; i++) {
          const child = value.children[i];
          const childVNodeData = child.vnodeData;
          if (childVNodeData) {
            // add all back refs to the roots
            for (let i = 0; i < childVNodeData.length; i++) {
              const value = childVNodeData[i];
              if (isSsrAttrs(value)) {
                const backRefs = tryGetBackRefs(value);
                if (backRefs) {
                  this.$serializationContext$.$addRoot$(backRefs);
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
      for (const [k, v] of value.entries()) {
        if (typeof v === 'string') {
          array.push(k, v);
        }
      }
      this.output(TypeIds.FormData, array);
    } else if (value instanceof URLSearchParams) {
      this.output(TypeIds.URLSearchParams, value.toString());
    } else if (value instanceof Set) {
      this.output(TypeIds.Set, [...value.values()]);
    } else if (value instanceof Map) {
      const combined = [];
      for (const [k, v] of value.entries()) {
        combined.push(k, v);
      }
      this.output(TypeIds.Map, combined);
    } else if (isJSXNode(value)) {
      const out = [
        value.type,
        value.key,
        value.varProps,
        value.constProps,
        value.children,
        value.toSort || undefined,
      ];
      while (out[out.length - 1] === undefined) {
        out.pop();
      }
      this.output(TypeIds.JSXNode, out);
    } else if (value instanceof Task) {
      const out: unknown[] = [value.$qrl$, value.$flags$, value.$index$, value.$el$, value.$state$];
      while (out[out.length - 1] === undefined) {
        out.pop();
      }
      this.output(TypeIds.Task, out);
    } else if (isPromise(value)) {
      const forwardRefId = this.resolvePromise(value, (resolved, resolvedValue) => {
        return new PromiseResult(TypeIds.Promise, resolved, resolvedValue);
      });
      this.output(TypeIds.ForwardRef, forwardRefId);
    } else if (value instanceof PromiseResult) {
      if (value.$type$ === TypeIds.SerializerSignal) {
        if (value.$qrl$) {
          this.output(TypeIds.SerializerSignal, [value.$qrl$, value.$effects$, value.$value$]);
        } else if (value.$resolved$) {
          // We replace ourselves with this value
          const index = this.$parent$!.$index$;
          this.$parent$ = this.$parent$!.$parent$!;
          this.writeValue(value.$value$, index);
        } else {
          console.error(value.$value$);
          throw qError(QError.serializerSymbolRejectedPromise);
        }
      } else {
        this.output(TypeIds.Promise, [value.$resolved$, value.$value$]);
      }
    } else if (value instanceof Uint8Array) {
      let buf = '';
      const length = value.length;
      for (let i = 0; i < length; i++) {
        buf += String.fromCharCode(value[i]);
      }
      const out = btoa(buf).replace(/=+$/, '');
      this.output(TypeIds.Uint8Array, out);
    } else if (value instanceof SerializationWeakRef) {
      const obj = value.$obj$;
      // This will return a fake SeenRef if it's not been seen before
      if (this.getSeenRefOrOutput(obj, this.$parent$!.$index$, true)) {
        let forwardRefId = this.$s11nWeakRefs$.get(obj);
        if (forwardRefId === undefined) {
          forwardRefId = this.$forwardRefsId$++;
          this.$s11nWeakRefs$.set(obj, forwardRefId);
          this.$forwardRefs$[forwardRefId] = -1;
        }
        this.output(TypeIds.ForwardRef, forwardRefId);
      }
    } else if (vnode_isVNode(value)) {
      this.output(TypeIds.Constant, Constants.Undefined);
    } else {
      throw qError(QError.serializeErrorUnknownType, [typeof value]);
    }
  }

  private resolvePromise(
    promise: Promise<unknown>,
    classCreator: (didResolve: boolean, resolvedValue: unknown) => PromiseResult
  ) {
    const forwardRefId = this.$forwardRefsId$++;
    promise
      .then((resolvedValue) => {
        this.$promises$.delete(promise);
        this.$forwardRefs$[forwardRefId] = this.$serializationContext$.$addRoot$(
          classCreator(true, resolvedValue)
        ) as number;
      })
      .catch((err) => {
        this.$promises$.delete(promise);
        this.$forwardRefs$[forwardRefId] = this.$serializationContext$.$addRoot$(
          classCreator(false, err)
        ) as number;
      });

    this.$promises$.add(promise);

    return forwardRefId;
  }

  private async outputRoots() {
    this.$writer$.write(BRACKET_OPEN);
    const { $roots$ } = this.$serializationContext$;
    while (this.$rootIdx$ < $roots$.length || this.$promises$.size) {
      if (this.$rootIdx$ !== 0) {
        this.$writer$.write(COMMA);
      }

      let separator = false;
      for (; this.$rootIdx$ < $roots$.length; this.$rootIdx$++) {
        if (separator) {
          this.$writer$.write(COMMA);
        } else {
          separator = true;
        }
        this.writeValue($roots$[this.$rootIdx$], this.$rootIdx$);
      }

      if (this.$promises$.size) {
        try {
          await Promise.race(this.$promises$);
        } catch {
          // ignore rejections, they will be serialized as rejected promises
        }
      }
    }

    if (this.$forwardRefs$.length) {
      let lastIdx = this.$forwardRefs$.length - 1;
      while (lastIdx >= 0 && this.$forwardRefs$[lastIdx] === -1) {
        lastIdx--;
      }
      if (lastIdx >= 0) {
        this.$writer$.write(COMMA);
        this.$writer$.write(TypeIds.ForwardRefs + COMMA);
        const out =
          lastIdx === this.$forwardRefs$.length - 1
            ? this.$forwardRefs$
            : this.$forwardRefs$.slice(0, lastIdx + 1);
        // We could also implement RLE of -1 values
        this.outputArray(out, true, (value) => {
          this.$writer$.write(String(value));
        });
      }
    }

    this.$writer$.write(BRACKET_CLOSE);
  }
}

export class PromiseResult {
  constructor(
    public $type$: number,
    public $resolved$: boolean,
    public $value$: unknown,
    public $effects$:
      | Map<string | symbol, Set<EffectSubscription>>
      | Set<EffectSubscription>
      | undefined = undefined,
    public $qrl$: QRLInternal | undefined = undefined
  ) {}
}
function getCustomSerializerPromise<T, S>(signal: SerializerSignalImpl<T, S>, value: any) {
  if (value === NEEDS_COMPUTATION) {
    return value;
  }
  return maybeThen(
    (signal.$computeQrl$.resolved || signal.$computeQrl$.resolve()) as any as SerializerArg<
      unknown,
      unknown
    >,
    (arg) => {
      let data;
      if (typeof arg === 'function') {
        arg = arg();
      }
      if (arg.serialize) {
        data = (arg as any).serialize(value);
      } else if (typeof value === 'object' && SerializerSymbol in value) {
        data = (value as any)[SerializerSymbol](value);
      }
      if (data === undefined) {
        data = NEEDS_COMPUTATION;
      }
      return data;
    }
  );
}

const discoverValuesForVNodeData = (vnodeData: VNodeData, callback: (value: unknown) => void) => {
  const length = vnodeData.length;
  for (let i = 0; i < length; i++) {
    const value = vnodeData[i];
    if (isSsrAttrs(value)) {
      for (const key in value) {
        const attrValue = value[key];
        if (
          attrValue == null ||
          typeof attrValue === 'string' ||
          (key === ELEMENT_PROPS && isObjectEmpty(attrValue as Record<string, unknown>))
        ) {
          continue;
        }
        callback(attrValue);
      }
    }
  }
};

const isSsrAttrs = (value: number | Props): value is Props =>
  typeof value === 'object' && value !== null && !isObjectEmpty(value);

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

function tryGetBackRefs(props: Props): Map<string, EffectSubscription> | undefined {
  return Object.prototype.hasOwnProperty.call(props, QBackRefs)
    ? (props[QBackRefs] as Map<string, EffectSubscription>)
    : undefined;
}

class SerializationWeakRef {
  constructor(public $obj$: unknown) {}
}

/** @internal */
export const _serializationWeakRef = (obj: unknown) => new SerializationWeakRef(obj);
