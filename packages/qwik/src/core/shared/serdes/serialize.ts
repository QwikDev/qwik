import { isDev, isServer } from '@qwik.dev/core/build';
import { NEEDS_COMPUTATION } from '../../reactive/constants';
import { EffectKind } from '../../dom/effect/effect-kind.enum';
import { SSRBranchSubscription as SsrBranchSubscription } from '../../dom/branch/branch';
import { SSRContentSubscription as SsrContentSubscription } from '../../dom/content/content';
import { SSRForBlockSubscription as SsrForBlockSubscription } from '../../dom/effect/ssr-effect';
import {
  EffectTargetKind,
  SsrAttrEffect,
  SsrAttrExpressionEffect,
  SsrDomSubscription,
  type SsrScalarDomEffect,
  type SsrDomEffect,
} from '../../dom/effect/ssr-effect';
import { ComputedFlags } from '../../reactive/flags';
import { AsyncSignal } from '../../reactive/async-signal';
import { Computed, isAsyncComputed } from '../../reactive/computed';
import { ComputedQrl } from '../../reactive/computed-qrl';
import { SerializerSignal } from '../../reactive/serializer-signal';
import { Signal } from '../../reactive/signal';
import {
  getStoreSources,
  isDeepStore,
  isStore,
  StorePropSource,
  unwrapStore,
} from '../../reactive/store';
import { isLazySerialized } from '../../reactive/lazy-serialized';
import type { Source, SourceSubs } from '../../reactive/source';
import { isContextScope } from '../../runtime/context-scope';
import { TaskSubscription } from '../../runtime/task';
import { isProjection, isSlotScope, type Projection, type SlotScope } from '../../dom/slot/slot';
import { Owner } from '../../runtime/owner';
import type { Subscriber } from '../../runtime/subscriber';
import type { RuntimeInvokeContext } from '../../runtime/invoke-context';
import type { SerdesWriter, SsrWriteChunk } from './writer';
import { qError, QError } from '../error/error';
import type { QRLInternal } from '../qrl/qrl-class';
import { isQrl } from '../qrl/qrl-utils';
import {
  BRACKET_CLOSE,
  BRACKET_OPEN,
  CLOSE_TAG,
  COMMA,
  ESCAPED_CLOSE_TAG,
  QUOTE,
} from '../ssr-const';
import { _UNINITIALIZED } from '../utils/constants';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../utils/flyweight';
import { isPromise, maybeThen } from '../utils/promises';
import { Constants, EMPTY_OBJECT_PAYLOAD, explicitUndefined, TypeIds } from './constants';
import { qrlToString } from './qrl-to-string';
import { SerializationBackRef } from './serialization-back-ref';
import type { SeenRef, SerializationContext } from './serialization-context';
import { fastSkipSerialize, SerializerSymbol } from './verify';

const MAX_INLINE_ARRAY_ITEMS = 64;

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
  private $forwardRefs$: Array<number | string | number[]> = [];
  private $forwardRefsId$ = 0;
  private $promises$: Set<Promise<unknown>> = new Set();
  private $s11nWeakRefs$ = new Map<unknown, number>();
  private $parent$: SeenRef | undefined;
  private $qrlMap$ = new Map<string, QRLInternal>();
  private $streamedRootLimit$ = 0;
  private $writer$: SerdesWriter;
  /** Polyfills may not be loaded when this module initializes. */
  private $hasTemporal$ = typeof Temporal !== 'undefined';

  constructor(public $serializationContext$: SerializationContext) {
    this.$writer$ = $serializationContext$.$writer$;
  }

  async serialize(): Promise<void> {
    const previousStreamedRootLimit = this.$streamedRootLimit$;
    this.$streamedRootLimit$ = 0;
    try {
      await this.outputRoots();
    } finally {
      this.$streamedRootLimit$ = previousStreamedRootLimit;
    }
  }

  async serializePatch(
    rootStart: number,
    rootIds: number[],
    extraRootId?: number | string | number[],
    streamedRootLimit = rootStart
  ): Promise<void> {
    const previousStreamedRootLimit = this.$streamedRootLimit$;
    this.$streamedRootLimit$ = streamedRootLimit;
    this.$writer$.write(BRACKET_OPEN);
    this.$serializationContext$.$serializedForwardRefCount$ = 0;
    try {
      this.$writer$.write(String(rootStart));
      this.$writer$.write(COMMA);
      this.$writer$.write(BRACKET_OPEN);
      await this.outputSelectedRoots(rootIds);
      this.$writer$.write(BRACKET_CLOSE);
      const forwardRefs = this.getForwardRefsPayload();
      this.$serializationContext$.$serializedForwardRefCount$ = forwardRefs?.length ?? 0;
      if (forwardRefs || extraRootId !== undefined) {
        this.$writer$.write(COMMA);
        if (forwardRefs) {
          this.outputForwardRefsArray(forwardRefs);
        } else {
          this.$writer$.write('0');
        }
      }
      if (extraRootId !== undefined) {
        this.$writer$.write(COMMA);
        if (typeof extraRootId === 'number') {
          this.writeRootRef(extraRootId);
        } else if (typeof extraRootId === 'string') {
          this.outputString(extraRootId);
        } else {
          this.$writer$.write(QUOTE);
          this.writeRootRefPath(extraRootId);
          this.$writer$.write(QUOTE);
        }
      }
    } finally {
      this.$streamedRootLimit$ = previousStreamedRootLimit;
    }
    this.$writer$.write(BRACKET_CLOSE);
  }

  $setWriter$(writer: SerdesWriter): void {
    this.$writer$ = writer;
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

  private maybeNumericObjectKey$(key: string): string | number {
    if (key.length === 0 || key.length >= 8) {
      return key;
    }

    let i = 0;
    if (key.charCodeAt(0) === 45) {
      if (key.length === 1) {
        return key;
      }
      i = 1;
    }

    const first = key.charCodeAt(i);
    if (first < 49 || first > 57) {
      return key;
    }

    for (i++; i < key.length; i++) {
      const c = key.charCodeAt(i);
      if (c < 48 || c > 57) {
        return key;
      }
    }

    return Number(key);
  }

  private outputShortStringConstant$(value: string): boolean {
    switch (value) {
      case ':':
        this.output(TypeIds.Constant, Constants.Colon);
        return true;
      case '.':
        this.output(TypeIds.Constant, Constants.Dot);
        return true;
      case 'id':
        this.output(TypeIds.Constant, Constants.Id);
        return true;
      case 'ref':
        this.output(TypeIds.Constant, Constants.Ref);
        return true;
      default:
        return false;
    }
  }

  private outputString(value: string): void {
    const s = this.stringNeedsJsonEscape$(value) ? JSON.stringify(value) : QUOTE + value + QUOTE;
    let angleBracketIdx: number = -1;
    let lastIdx = 0;
    while ((angleBracketIdx = s.indexOf(CLOSE_TAG, lastIdx)) !== -1) {
      this.$writer$.write(s.slice(lastIdx, angleBracketIdx));
      this.$writer$.write(ESCAPED_CLOSE_TAG);
      lastIdx = angleBracketIdx + 2;
    }
    this.$writer$.write(lastIdx === 0 ? s : s.slice(lastIdx));
  }

  private writeRootRef(id: number): void {
    this.$writer$.writeRootRef(id);
  }

  private writeRootRefPath(path: number[]): void {
    this.$writer$.writeRootRefPath(path);
  }

  private outputStringChunks(chunks: SsrWriteChunk[]): void {
    this.$writer$.write(QUOTE);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (typeof chunk === 'string') {
        this.$writer$.write(chunk);
      } else if (typeof chunk === 'number') {
        this.writeRootRef(chunk);
      } else {
        this.writeRootRefPath(chunk.path);
      }
    }
    this.$writer$.write(QUOTE);
  }

  /** Output a type,value pair. If the value is an array, it calls writeValue on each item. */
  private output(type: number, value: number | string | any[], keepUndefined?: boolean) {
    if (type === TypeIds.RootRef) {
      this.$writer$.write(type + COMMA);
      if (typeof value === 'number') {
        this.writeRootRef(value);
      } else if (typeof value === 'string') {
        this.outputString(value);
      } else {
        this.$writer$.write(QUOTE);
        this.writeRootRefPath(value as number[]);
        this.$writer$.write(QUOTE);
      }
    } else if (type === TypeIds.QRL && Array.isArray(value)) {
      this.$writer$.write(type + COMMA);
      this.outputStringChunks(value as SsrWriteChunk[]);
    } else if (typeof value === 'number') {
      this.$writer$.write(type + COMMA + value);
    } else if (typeof value === 'string') {
      this.$writer$.write(type + COMMA);
      this.outputString(value);
    } else {
      this.$writer$.write(type + COMMA);
      const shouldFlattenArrayItems = type === TypeIds.BigArray;
      this.outputArray(value, !!keepUndefined, (valueItem, idx) => {
        if (shouldFlattenArrayItems && this.shouldFlattenArrayItem(valueItem)) {
          this.output(TypeIds.RootRef, this.$serializationContext$.$addRoot$(valueItem));
        } else {
          this.writeValue(valueItem, idx);
        }
      });
    }
  }

  private shouldFlattenArrayItem(value: unknown): value is object {
    return (
      typeof value === 'object' &&
      value !== null &&
      value !== EMPTY_ARRAY &&
      value !== EMPTY_OBJ &&
      !(value instanceof SerializationBackRef) &&
      isObjectLiteral(value)
    );
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
    } else if (seen.$parent$ && this.isSeenInStreamedRoot(seen)) {
      seen = this.$serializationContext$.$addDuplicateRoot$(value);
    }

    // Now that we saw it a second time, make sure it's a root
    if (seen.$parent$) {
      // Note, this means it was output before so we always need a backref
      // Special case: we're a root so instead of adding a backref, we replace ourself
      if (!this.$parent$) {
        this.$serializationContext$.$promoteToRoot$(seen, value, index);
        value = this.$serializationContext$.$roots$[index];
      } else {
        this.$serializationContext$.$promoteToRoot$(seen, value);
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

  private isSeenInStreamedRoot(ref: SeenRef): boolean {
    while (ref.$parent$) {
      ref = ref.$parent$;
    }
    return ref.$index$ < this.$streamedRootLimit$;
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
          } else if (this.outputShortStringConstant$(value)) {
            break;
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
          } else if (value === _UNINITIALIZED) {
            this.output(TypeIds.Constant, Constants.UNINITIALIZED);
          } else if (value === explicitUndefined) {
            this.output(TypeIds.Constant, Constants.Undefined);
          } else {
            throw qError(QError.serializeErrorUnknownType, [typeof value]);
          }
          break;
        case 'function':
          if (isQrl(value)) {
            if (this.getSeenRefOrOutput(value, index)) {
              const [chunk, symbol, captureIds] = qrlToString(
                this.$serializationContext$,
                value,
                true
              );
              let data: string | number | SsrWriteChunk[];
              if (chunk !== '') {
                // not a sync QRL, replace all parts with string references
                const chunkRootId = this.$serializationContext$.$addRoot$(chunk);
                const symbolRootId = this.$serializationContext$.$addRoot$(symbol);
                data = [chunkRootId, '#', symbolRootId];
                if (captureIds) {
                  data.push('#');
                  const ids = captureIds.split(' ');
                  for (let i = 0; i < ids.length; i++) {
                    if (i > 0) {
                      data.push(' ');
                    }
                    data.push(Number(ids[i]));
                  }
                }
                // Since we map QRLs to strings, we need to keep track of this secondary mapping
                const qrlKey = `${chunkRootId}#${symbolRootId}${captureIds ? '#' + captureIds : ''}`;
                const existing = this.$qrlMap$.get(qrlKey);
                if (existing) {
                  // We encountered the same QRL again, make it a root
                  const ref = this.$serializationContext$.$addRoot$(existing);
                  this.output(TypeIds.RootRef, ref);
                  return;
                } else {
                  this.$qrlMap$.set(qrlKey, value);
                }
              } else {
                // sync QRL
                data = Number(symbol);
              }

              this.output(TypeIds.QRL, data);
            }
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
    if (value instanceof SerializerSignal) {
      const maybeValue = getSerializerSignalValue(value);
      if (isPromise(maybeValue)) {
        const forwardRefId = this.resolvePromise(maybeValue, (resolved, resolvedValue) => {
          return new PromiseResult(TypeIds.SerializerSignal, resolved, resolvedValue, value);
        });
        this.output(TypeIds.ForwardRef, forwardRefId);
      } else {
        this.output(TypeIds.SerializerSignal, serializeSerializerSignal(value, maybeValue));
      }
    } else if (value instanceof ComputedQrl) {
      this.output(
        isAsyncComputed(value) ? TypeIds.AsyncSignal : TypeIds.ComputedSignal,
        isAsyncComputed(value) ? serializeAsyncSignal(value) : serializeComputed(value)
      );
    } else if (value instanceof AsyncSignal) {
      this.output(TypeIds.AsyncSignal, serializeAsyncSignal(value));
    } else if (value instanceof Signal) {
      this.output(TypeIds.Signal, serializeSignal(value));
    } else if (isStore(value)) {
      this.output(TypeIds.Store, this.serializeStore(value));
    } else if (value instanceof StorePropSource) {
      this.output(TypeIds.StoreProp, this.serializeStoreProp(value));
    } else if (
      value instanceof SsrDomSubscription ||
      value instanceof SsrBranchSubscription ||
      value instanceof SsrForBlockSubscription ||
      value instanceof SsrContentSubscription
    ) {
      this.output(TypeIds.EffectSubscription, serializeEffectSubscription(value));
    } else if (value instanceof TaskSubscription) {
      this.output(TypeIds.Task, serializeTaskSubscription(value));
    } else if (isContextScope(value)) {
      const out: unknown[] = [value.parent ?? null];
      const values = value.values;
      for (const [key, value] of values) {
        out.push(key, value === undefined ? explicitUndefined : value);
      }
      this.output(TypeIds.ContextScope, out);
    } else if (isSlotScope(value)) {
      this.output(TypeIds.SlotScope, serializeSlotScope(value));
    } else if (isProjection(value)) {
      this.output(TypeIds.Projection, serializeProjection(value));
    } else if (this.$serializationContext$.$isDomRef$(value)) {
      this.output(TypeIds.RefVNode, value.$nodeId$);
    } else if (isObjectLiteral(value)) {
      if (Array.isArray(value)) {
        this.output(
          this.shouldSerializeAsBigArray(value) ? TypeIds.BigArray : TypeIds.Array,
          value
        );
      } else {
        const out: any[] = [];
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            const subVal = (value as any)[key];
            if (!fastSkipSerialize(subVal)) {
              out.push(this.maybeNumericObjectKey$(key), subVal);
            }
          }
        }
        this.output(TypeIds.Object, out.length ? out : EMPTY_OBJECT_PAYLOAD);
      }
    } else if (value instanceof URL) {
      this.output(TypeIds.URL, value.href);
    } else if (value instanceof Date) {
      this.output(TypeIds.Date, Number.isNaN(value.valueOf()) ? '' : value.valueOf());
    } else if (this.$hasTemporal$ && value instanceof Temporal.Duration) {
      this.output(TypeIds.TemporalDuration, value.toJSON());
    } else if (this.$hasTemporal$ && value instanceof Temporal.Instant) {
      this.output(TypeIds.TemporalInstant, value.toJSON());
    } else if (this.$hasTemporal$ && value instanceof Temporal.PlainDate) {
      this.output(TypeIds.TemporalPlainDate, value.toJSON());
    } else if (this.$hasTemporal$ && value instanceof Temporal.PlainDateTime) {
      this.output(TypeIds.TemporalPlainDateTime, value.toJSON());
    } else if (this.$hasTemporal$ && value instanceof Temporal.PlainMonthDay) {
      this.output(TypeIds.TemporalPlainMonthDay, value.toJSON());
    } else if (this.$hasTemporal$ && value instanceof Temporal.PlainTime) {
      this.output(TypeIds.TemporalPlainTime, value.toJSON());
    } else if (this.$hasTemporal$ && value instanceof Temporal.PlainYearMonth) {
      this.output(TypeIds.TemporalPlainYearMonth, value.toJSON());
    } else if (this.$hasTemporal$ && value instanceof Temporal.ZonedDateTime) {
      this.output(TypeIds.TemporalZonedDateTime, value.toJSON());
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
    } else if (isPromise(value)) {
      const forwardRefId = this.resolvePromise(value, (resolved, resolvedValue) => {
        return new PromiseResult(TypeIds.Promise, resolved, resolvedValue);
      });
      this.output(TypeIds.ForwardRef, forwardRefId);
    } else if (value instanceof PromiseResult) {
      if (value.$type$ === TypeIds.SerializerSignal) {
        if (!value.$resolved$) {
          throw qError(QError.serializerSymbolRejectedPromise);
        }
        this.output(
          TypeIds.SerializerSignal,
          serializeSerializerSignal(value.$signal$!, value.$value$)
        );
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
        this.output(TypeIds.ForwardRef, this.getForwardRefId(forwardRefId));
      }
    } else {
      throw qError(QError.serializeErrorUnknownType, [typeof value]);
    }
  }

  private serializeStore(store: object): unknown[] {
    const raw = unwrapStore(store);
    const records: unknown[] = [];
    const deep = isDeepStore(store);
    collectStoreSourceRecords(raw, records, [], deep);
    if (!deep) {
      return [raw, records.length > 0 ? records : null, false];
    }
    return records.length > 0 ? [raw, records] : [raw];
  }

  private serializeStoreProp(source: StorePropSource): unknown[] {
    return [this.$serializationContext$.$addRoot$(source.target), source.prop as string | number];
  }

  private shouldSerializeAsBigArray(value: unknown[]): boolean {
    if (value.length <= MAX_INLINE_ARRAY_ITEMS) {
      return false;
    }
    for (let i = 0; i < value.length; i++) {
      if (this.shouldFlattenArrayItem(value[i])) {
        return true;
      }
    }
    return false;
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
        );
      })
      .catch((err) => {
        this.$promises$.delete(promise);
        this.$forwardRefs$[forwardRefId] = this.$serializationContext$.$addRoot$(
          classCreator(false, err)
        );
      });

    this.$promises$.add(promise);

    return this.getForwardRefId(forwardRefId);
  }

  private getForwardRefId(localId: number): number {
    return this.$serializationContext$.$forwardRefOffset$ + localId;
  }

  private async outputPendingRoots(): Promise<number> {
    let rootsWritten = 0;
    const { $roots$ } = this.$serializationContext$;
    while (this.$rootIdx$ < $roots$.length || this.$promises$.size) {
      let separator = rootsWritten > 0;
      for (; this.$rootIdx$ < $roots$.length; this.$rootIdx$++) {
        if (separator) {
          this.$writer$.write(COMMA);
        } else {
          separator = true;
        }
        this.writeValue($roots$[this.$rootIdx$], this.$rootIdx$);
        rootsWritten++;
      }

      if (this.$promises$.size) {
        try {
          await Promise.race(this.$promises$);
        } catch {
          // ignore rejections, they will be serialized as rejected promises
        }
      }
    }
    return rootsWritten;
  }

  private async outputSelectedRoots(rootIds: number[]): Promise<void> {
    let separator = false;
    let i = 0;
    while (i < rootIds.length || this.$promises$.size) {
      if (i < rootIds.length) {
        if (separator) {
          this.$writer$.write(COMMA);
        } else {
          separator = true;
        }
        const rootId = rootIds[i++];
        this.writeValue(this.$serializationContext$.$roots$[rootId], rootId);
        continue;
      }

      try {
        await Promise.race(this.$promises$);
      } catch {
        // ignore rejections, they will be serialized as rejected promises
      }
    }
  }

  private getForwardRefsPayload(): Array<number | string | number[]> | null {
    let lastIdx = this.$forwardRefs$.length - 1;
    while (lastIdx >= 0 && this.$forwardRefs$[lastIdx] === -1) {
      lastIdx--;
    }
    if (lastIdx < 0) {
      return null;
    }
    return lastIdx === this.$forwardRefs$.length - 1
      ? this.$forwardRefs$
      : this.$forwardRefs$.slice(0, lastIdx + 1);
  }

  private outputForwardRefsArray(forwardRefs: Array<number | string | number[]>): void {
    this.outputArray(forwardRefs, true, (value) => {
      if (typeof value === 'string') {
        this.outputString(value);
      } else if (Array.isArray(value)) {
        this.$writer$.write(QUOTE);
        this.writeRootRefPath(value as number[]);
        this.$writer$.write(QUOTE);
      } else {
        this.writeRootRef(value as number);
      }
    });
  }

  private async outputRoots(): Promise<void> {
    this.$writer$.write(BRACKET_OPEN);
    const rootsWritten = await this.outputPendingRoots();

    const forwardRefs = this.getForwardRefsPayload();
    this.$serializationContext$.$rootStateRootCount$ = this.$serializationContext$.$roots$.length;
    this.$serializationContext$.$hasRootStateForwardRefs$ = !!forwardRefs;
    const forwardRefCount = forwardRefs?.length ?? 0;
    if (forwardRefs) {
      if (rootsWritten > 0) {
        this.$writer$.write(COMMA);
      }
      this.$writer$.write(TypeIds.ForwardRefs + COMMA);
      this.outputForwardRefsArray(forwardRefs);
    }

    this.$writer$.write(BRACKET_CLOSE);
    this.$serializationContext$.$serializedRootCount$ =
      this.$serializationContext$.$roots$.length +
      (this.$serializationContext$.$hasRootStateForwardRefs$ ? 1 : 0);
    this.$serializationContext$.$serializedForwardRefCount$ = forwardRefCount;
  }
}

export class PromiseResult {
  constructor(
    public $type$: number,
    public $resolved$: boolean,
    public $value$: unknown,
    public $signal$?: SerializerSignal<unknown, unknown>
  ) {}
}

function serializeSignal(signal: Signal<unknown>): unknown[] {
  return [
    signal.v === undefined ? explicitUndefined : signal.v,
    ...serializeSubscribers(signal.subs),
  ];
}

function collectStoreSourceRecords(
  raw: object,
  records: unknown[],
  path: Array<string | number>,
  recursive = true,
  seen = new WeakSet<object>()
) {
  if (seen.has(raw)) {
    return;
  }
  seen.add(raw);

  // eslint-disable-next-line qwik-local/loop-style
  for (const source of getStoreSources(raw)) {
    if (source.subs !== null) {
      records.push([
        path.slice(),
        source.prop as string | number,
        ...serializeSubscribers(source.subs),
      ]);
    }
  }

  if (!recursive) {
    return;
  }

  const proto = Object.getPrototypeOf(raw);
  if (!Array.isArray(raw) && proto !== Object.prototype && proto !== null) {
    return;
  }
  const entries = Array.isArray(raw) ? raw.entries() : Object.entries(raw);
  // eslint-disable-next-line qwik-local/loop-style
  for (const [key, value] of entries) {
    if (value !== null && typeof value === 'object') {
      path.push(key);
      collectStoreSourceRecords(unwrapStore(value) as object, records, path, true, seen);
      path.pop();
    }
  }
}

function serializeComputed(computed: ComputedQrl<unknown>): unknown[] {
  const hasCachedValue = !!(computed.flags & ComputedFlags.HasValue);
  const needsComputation =
    computed.options?.serializationStrategy === 'never' ||
    !hasCachedValue ||
    !!(computed.flags & ComputedFlags.Dirty) ||
    fastSkipSerialize(computed.v);
  const value = needsComputation
    ? NEEDS_COMPUTATION
    : computed.v === undefined
      ? explicitUndefined
      : computed.v;

  return [
    computed.computeQrl,
    serializeDeps(computed.deps),
    value,
    ...serializeSubscribers(computed.subs),
  ];
}

function serializeSerializerSignal(
  signal: SerializerSignal<unknown, unknown>,
  value: unknown
): unknown[] {
  const initialized = value !== NEEDS_COMPUTATION;
  return [
    signal.argQrl,
    serializeDeps(signal.deps),
    value === undefined ? explicitUndefined : value,
    initialized,
    ...serializeSubscribers(signal.subs),
  ];
}

function getSerializerSignalValue(signal: SerializerSignal<unknown, unknown>): unknown {
  if (
    !signal.didInitialize ||
    !!(signal.flags & ComputedFlags.Dirty) ||
    fastSkipSerialize(signal.v)
  ) {
    return NEEDS_COMPUTATION;
  }

  const value = signal.v;
  const localArg = signal.arg;
  if (localArg !== null) {
    return getSerializedSerializerValue(localArg, value);
  }

  const argQrl = signal.argQrl;
  if (argQrl === null) {
    return NEEDS_COMPUTATION;
  }
  const arg = argQrl.resolved ?? argQrl.resolve(signal.container);
  return maybeThen(arg, (arg) => getSerializedSerializerValue(arg, value));
}

function getSerializedSerializerValue(arg: unknown, value: unknown): unknown {
  const serializerArg = typeof arg === 'function' ? (arg as () => any)() : (arg as any);
  let data = serializerArg.serialize?.(value);
  if (
    data === undefined &&
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as any)[SerializerSymbol] === 'function'
  ) {
    data = (value as { [SerializerSymbol]: (value: unknown) => unknown })[SerializerSymbol](value);
  }
  return maybeThen(data, (data) => (data === undefined ? NEEDS_COMPUTATION : data));
}

function serializeAsyncSignal(signal: Computed<unknown>): unknown[] {
  const hasCachedValue = !!(signal.flags & ComputedFlags.HasValue);
  const needsComputation =
    signal.options?.serializationStrategy === 'never' ||
    !hasCachedValue ||
    !!(signal.flags & ComputedFlags.Dirty) ||
    fastSkipSerialize(signal.v);
  const value = needsComputation
    ? NEEDS_COMPUTATION
    : signal.v === undefined
      ? explicitUndefined
      : signal.v;

  return [
    signal.computeQrl,
    serializeDeps(signal.deps),
    value,
    serializeAsyncSignalOptions(signal),
    ...serializeSubscribers(signal.subs),
  ];
}

function serializeAsyncSignalOptions(signal: Computed<unknown>): Record<string, unknown> | null {
  const options: Record<string, unknown> = {};
  if (signal.options?.clientOnly) {
    options.clientOnly = true;
  }
  if (signal.options?.allowStale === false) {
    options.allowStale = false;
  }
  if (signal.options?.timeout) {
    options.timeout = signal.options.timeout;
  }
  if (signal.options?.concurrency !== undefined) {
    options.concurrency = signal.options.concurrency;
  }
  if (signal.options?.eagerCleanup) {
    options.eagerCleanup = true;
  }
  if (signal.options?.serializationStrategy) {
    options.serializationStrategy = signal.options.serializationStrategy;
  }
  if (signal.expires) {
    options.expires = signal.expires;
  }
  if (!signal.poll) {
    options.poll = false;
  }
  return Object.keys(options).length === 0 ? null : options;
}

function serializeEffectSubscription(
  subscription:
    | SsrDomSubscription
    | SsrBranchSubscription
    | SsrForBlockSubscription
    | SsrContentSubscription
): unknown[] {
  if (subscription instanceof SsrBranchSubscription) {
    return serializeBranchSubscription(subscription);
  }
  if (subscription instanceof SsrForBlockSubscription) {
    return serializeForBlockSubscription(subscription);
  }
  if (subscription instanceof SsrContentSubscription) {
    return serializeContentSubscription(subscription);
  }

  return serializeDomSubscription(subscription);
}

function serializeTaskSubscription(subscription: TaskSubscription): unknown[] {
  return [subscription.task.phase, subscription.task.qrl, serializeDeps(subscription.deps)];
}

function serializeBranchSubscription(subscription: SsrBranchSubscription): unknown[] {
  const effect = subscription.effect;

  return [
    EffectKind.Branch,
    effect.rangeId,
    effect.currentBranch,
    serializeDeps(subscription.deps),
    effect.conditionQrl,
    effect.thenQrl,
    effect.elseQrl ?? null,
    getSsrOwnedSubscribers(subscription.effect.currentOwner),
    effect.invokeContext?.slotScope ?? null,
    effect.useOnRoot ? serializeUseOnScopes(effect.invokeContext) : null,
    effect.idBase,
  ];
}

function getSsrOwnedSubscribers(owner: Owner | null): readonly Subscriber[] {
  const items = owner?.items;
  if (items === null || items === undefined) {
    return EMPTY_ARRAY;
  }

  const subscribers: Subscriber[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!(item instanceof Owner)) {
      subscribers.push(item);
    }
  }
  return subscribers;
}

function serializeContentSubscription(subscription: SsrContentSubscription): unknown[] {
  const content = subscription.content;
  return [
    EffectKind.Content,
    content.rangeId,
    serializeDeps(subscription.deps),
    content.args,
    content.qrl,
    getSsrOwnedSubscribers(content.currentOwner),
    content.invokeContext?.slotScope ?? null,
    content.useOnRoot ? serializeUseOnScopes(content.invokeContext) : null,
  ];
}

function serializeForBlockSubscription(subscription: SsrForBlockSubscription): unknown[] {
  const effect = subscription.effect;

  return [
    EffectKind.ForBlock,
    effect.rangeId,
    serializeDeps(subscription.deps),
    effect.keyQrl,
    effect.renderQrl,
    effect.usesIndexSignal,
    effect.invokeContext?.slotScope ?? null,
    null,
    effect.indexSignals,
    effect.idBase,
    effect.rowShape,
  ];
}

function serializeUseOnScopes(context: RuntimeInvokeContext | null): unknown {
  if (context === null) {
    return null;
  }
  const scopes = [
    ...(context.useOnEvents === undefined ? [] : [context.useOnEvents]),
    ...(context.inheritedUseOnEvents ?? []),
  ];
  return scopes.length === 0 ? null : scopes;
}

function serializeSlotScope(scope: SlotScope): unknown[] {
  const out: unknown[] = [];
  for (const [name, projections] of scope.slots) {
    out.push(name, projections);
  }
  return out;
}

function serializeProjection(projection: Projection): unknown[] {
  return [projection.renderQrl, projection.slotScope, projection.idBase];
}

function serializeDomSubscription(subscription: SsrDomSubscription): unknown[] {
  const effect = subscription.effect;
  const deps = serializeDeps(subscription.deps);

  if (effect.kind === EffectKind.DomBatch) {
    return [
      effect.kind,
      deps,
      effect.effects.map((scalarEffect) => serializeSsrScalarDomEffect(scalarEffect)),
    ];
  }

  return serializeSsrScalarDomEffect(effect, deps);
}

function serializeSsrScalarDomEffect(
  effect: SsrScalarDomEffect,
  deps?: readonly Source[]
): unknown[] {
  const target = effect.target;
  const serializedDeps = deps ?? serializeSsrScalarDomEffectDeps(effect);

  switch (effect.kind) {
    case EffectKind.TextNode:
      return target.kind === EffectTargetKind.RangeText
        ? [effect.kind, target.kind, target.id, target.markerIndex, serializedDeps]
        : [effect.kind, target.kind, target.id, serializedDeps];
    case EffectKind.TextExpression:
      return target.kind === EffectTargetKind.RangeText
        ? [
            effect.kind,
            target.kind,
            target.id,
            target.markerIndex,
            serializedDeps,
            effect.args,
            effect.qrl,
          ]
        : [effect.kind, target.kind, target.id, serializedDeps, effect.args, effect.qrl];
    case EffectKind.Attr:
      if (effect instanceof SsrAttrExpressionEffect) {
        return [
          effect.kind,
          target.kind,
          target.id,
          serializedDeps,
          effect.name,
          effect.args,
          effect.qrl,
          effect.styleScopedId,
        ];
      }
      return [
        effect.kind,
        target.kind,
        target.id,
        serializedDeps,
        effect.name,
        effect.styleScopedId,
      ];
    case EffectKind.Props:
      return [
        effect.kind,
        target.kind,
        target.id,
        serializedDeps,
        effect.args,
        effect.qrl,
        effect.styleScopedId,
      ];
  }

  return assertNeverSsrDomEffect(effect);
}

function serializeSsrScalarDomEffectDeps(effect: SsrScalarDomEffect): readonly Source[] {
  switch (effect.kind) {
    case EffectKind.TextNode:
      return effect.source === undefined ? EMPTY_ARRAY : [effect.source];
    case EffectKind.Attr:
      return effect instanceof SsrAttrEffect && effect.source !== undefined
        ? [effect.source]
        : EMPTY_ARRAY;
    default:
      return EMPTY_ARRAY;
  }
}

function serializeDeps(deps: Source[] | null): readonly Source[] {
  return deps ?? EMPTY_ARRAY;
}

function serializeSubscribers(subs: SourceSubs): readonly Subscriber[] {
  if (!isServer || subs === null) {
    return EMPTY_ARRAY;
  }

  let subscribers: Subscriber[] | null = null;
  for (let i = 0; i < subs.length; i++) {
    const subscriber = subs[i];
    if (isLazySerialized(subscriber)) {
      subscribers ??= subs.slice(0, i) as Subscriber[];
    } else if (subscribers !== null) {
      subscribers.push(subscriber);
    }
  }
  return subscribers ?? (subs as Subscriber[]);
}

function assertNeverSsrDomEffect(effect: never): never {
  throw qError(QError.serializeErrorUnknownType, [(effect as SsrDomEffect).kind]);
}

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

class SerializationWeakRef {
  constructor(public $obj$: unknown) {}
}

/** @internal */
export const _serializationWeakRef = (obj: unknown) => new SerializationWeakRef(obj);
