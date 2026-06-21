import { isDev, isServer } from '@qwik.dev/core/build';
import { NEEDS_COMPUTATION } from '../../reactive-primitives/types';
import { EffectKind } from '../../vdomless/dom/effect/effect-kind.enum';
import { SSRBranchSubscription as SsrBranchSubscription } from '../../vdomless/dom/branch/branch';
import {
  EffectTargetKind,
  SsrDomSubscription,
  type SsrDomEffect,
} from '../../vdomless/dom/effect/ssr-effect';
import { ComputedFlags } from '../../vdomless/reactive/flags';
import { ComputedQrl } from '../../vdomless/reactive/computed-qrl';
import { Signal } from '../../vdomless/reactive/signal';
import type { Dependency } from '../../vdomless/reactive/source';
import { isContextScope } from '../../vdomless/runtime/context-scope';
import { Owner } from '../../vdomless/runtime/owner';
import type { Subscriber } from '../../vdomless/runtime/subscriber';
import type { SSRInternalStreamWriter, SSRWriteChunk } from '../../ssr/ssr-types';
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
import { isPromise } from '../utils/promises';
import { Constants, explicitUndefined, TypeIds } from './constants';
import { qrlToString } from './qrl-to-string';
import {
  SerializationBackRef,
  type SeenRef,
  type SerializationContext,
} from './serialization-context';
import { fastSkipSerialize } from './verify';

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
  private $writer$: SSRInternalStreamWriter;
  /** We need to determine this at runtime because polyfills may not be loaded a module load time */
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

  $setWriter$(writer: SSRInternalStreamWriter): void {
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

  private outputStringChunks(chunks: SSRWriteChunk[]): void {
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
      this.outputStringChunks(value as SSRWriteChunk[]);
    } else if (typeof value === 'number') {
      this.$writer$.write(type + COMMA + value);
    } else if (typeof value === 'string') {
      this.$writer$.write(type + COMMA);
      this.outputString(value);
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
          }
          break;
        case 'function':
          if (isQrl(value)) {
            if (this.getSeenRefOrOutput(value, index)) {
              const [chunk, symbol, captures] = qrlToString(
                this.$serializationContext$,
                value,
                true
              );
              let data: string | number | SSRWriteChunk[];
              if (chunk !== '') {
                // not a sync QRL, replace all parts with string references
                data = [
                  this.$serializationContext$.$addRoot$(chunk),
                  '#',
                  this.$serializationContext$.$addRoot$(symbol),
                ];
                if (captures) {
                  const captureIds = captures.split(' ');
                  data.push('#');
                  for (let i = 0; i < captureIds.length; i++) {
                    if (i > 0) {
                      data.push(' ');
                    }
                    data.push(Number(captureIds[i]));
                  }
                }
                // Since we map QRLs to strings, we need to keep track of this secondary mapping
                const qrlKey = data.join('');
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
    if (value instanceof Signal) {
      this.output(TypeIds.Signal, serializeSignal(value));
    } else if (value instanceof ComputedQrl) {
      this.output(TypeIds.ComputedSignal, serializeComputed(value));
    } else if (value instanceof SsrDomSubscription || value instanceof SsrBranchSubscription) {
      this.output(TypeIds.EffectSubscription, serializeEffectSubscription(value));
    } else if (isContextScope(value)) {
      const out: unknown[] = [value.parent ?? null];
      const values = value.values;
      for (const [key, value] of values) {
        out.push(key, value === undefined ? explicitUndefined : value);
      }
      this.output(TypeIds.ContextScope, out);
    } else if (isObjectLiteral(value)) {
      if (Array.isArray(value)) {
        this.output(TypeIds.Array, value);
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
        this.output(TypeIds.Object, out.length ? out : 0);
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
      this.output(TypeIds.Promise, [value.$resolved$, value.$value$]);
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
    public $value$: unknown
  ) {}
}

function serializeSignal(signal: Signal<unknown>): unknown[] {
  return [
    signal.v === undefined ? explicitUndefined : signal.v,
    ...serializeSubscribers(signal.subs),
  ];
}

function serializeComputed(computed: ComputedQrl<unknown>): unknown[] {
  const hasCachedValue = !!(computed.flags & ComputedFlags.HasValue);
  const needsComputation =
    !hasCachedValue || !!(computed.flags & ComputedFlags.Dirty) || fastSkipSerialize(computed.v);
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

function serializeEffectSubscription(
  subscription: SsrDomSubscription | SsrBranchSubscription
): unknown[] {
  if (subscription instanceof SsrBranchSubscription) {
    return serializeBranchSubscription(subscription);
  }

  return serializeDomSubscription(subscription);
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
    getSsrBranchOwnedSubscribers(subscription),
  ];
}

function getSsrBranchOwnedSubscribers(subscription: SsrBranchSubscription): readonly Subscriber[] {
  const items = subscription.effect.currentOwner?.items;
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

function serializeDomSubscription(subscription: SsrDomSubscription): unknown[] {
  const effect = subscription.effect;
  const deps = serializeDeps(subscription.deps);
  const target = effect.target;

  switch (effect.kind) {
    case EffectKind.TextNode:
      return target.kind === EffectTargetKind.RangeText
        ? [effect.kind, target.kind, target.id, target.markerIndex, deps]
        : [effect.kind, target.kind, target.id, deps];
    case EffectKind.TextExpression:
      return target.kind === EffectTargetKind.RangeText
        ? [effect.kind, target.kind, target.id, target.markerIndex, deps, effect.args, effect.qrl]
        : [effect.kind, target.kind, target.id, deps, effect.args, effect.qrl];
    case EffectKind.Attr:
      return [effect.kind, target.kind, target.id, deps, effect.name];
    case EffectKind.SerializedAttr:
      return [effect.kind, target.kind, target.id, deps, effect.serializer];
  }

  return assertNeverSsrDomEffect(effect);
}

function serializeDeps(deps: Dependency[] | null): readonly Dependency[] {
  return deps ?? EMPTY_ARRAY;
}

function serializeSubscribers(subs: Subscriber[] | null): readonly Subscriber[] {
  return isServer ? (subs ?? EMPTY_ARRAY) : EMPTY_ARRAY;
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
