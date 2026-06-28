import { DomSubscription, ForBlockSubscription } from '../../vdomless/dom/effect/effect';
import { BranchSubscription } from '../../vdomless/dom/branch/branch';
import { EffectKind } from '../../vdomless/dom/effect/effect-kind.enum';
import { ComputedQrl } from '../../vdomless/reactive/computed-qrl';
import { Signal } from '../../vdomless/reactive/signal';
import { createStore, StorePropSource, unwrapStore } from '../../vdomless/reactive/store';
import type { ContainerContext } from '../../vdomless/runtime/container-context';
import { createContextScope } from '../../vdomless/runtime/context-scope';
import { createProjection, createSlotScope } from '../../vdomless/dom/slot/slot';
import { Task, TaskSubscription } from '../../vdomless/runtime/task';
import { Phase } from '../../vdomless/runtime/scheduler';
import { qError, QError } from '../error/error';
import type { QRLInternal } from '../qrl/qrl-class';
import { _UNINITIALIZED } from '../utils/constants';
import { maybeThen } from '../utils/promises';
import type { ValueOrPromise } from '../utils/types';
import { _constants, TypeIds, type Constants } from './constants';
import { createQRLWithBackChannel } from './qrl-to-string';

export const resolvers = new WeakMap<Promise<any>, [Function, Function]>();
export const pendingStoreTargets = new WeakMap<object, { t: TypeIds; v: unknown }>();

export const allocate = (
  context: ContainerContext,
  typeId: number,
  value: unknown
): ValueOrPromise<any> => {
  switch (typeId) {
    case TypeIds.Plain:
      return value;
    case TypeIds.RootRef:
      return context.getRoot(value as number);
    case TypeIds.ForwardRef: {
      const forwardRefs = context.forwardRefs ?? context.getForwardRefs();
      const rootRef = forwardRefs?.[value as number];
      if (rootRef === -1 || rootRef === undefined) {
        return _UNINITIALIZED;
      } else {
        return context.getRoot(rootRef);
      }
    }
    case TypeIds.ForwardRefs:
      return value;
    case TypeIds.Constant:
      return _constants[value as Constants];
    case TypeIds.Array:
    case TypeIds.BigArray:
      return Array((value as any[]).length / 2);
    case TypeIds.Object:
      return {};
    case TypeIds.QRL: {
      if (typeof value === 'string') {
        const [chunkId, symbolId, captureIds] = value.split('#');
        return maybeThen(context.getRoot(chunkId), (chunk) =>
          maybeThen(context.getRoot(symbolId), (symbol) =>
            createQRLWithBackChannel(chunk as string, symbol as string, captureIds || null, context)
          )
        );
      }
      // Sync qrl
      return createQRLWithBackChannel('', String(value), null, context) as QRLInternal;
    }
    case TypeIds.URL:
      return new URL(value as string);
    case TypeIds.Date:
      return new Date(value as number);
    case TypeIds.TemporalDuration:
      return Temporal.Duration.from(value as string);
    case TypeIds.TemporalInstant:
      return Temporal.Instant.from(value as string);
    case TypeIds.TemporalPlainDate:
      return Temporal.PlainDate.from(value as string);
    case TypeIds.TemporalPlainDateTime:
      return Temporal.PlainDateTime.from(value as string);
    case TypeIds.TemporalPlainMonthDay:
      return Temporal.PlainMonthDay.from(value as string);
    case TypeIds.TemporalPlainTime:
      return Temporal.PlainTime.from(value as string);
    case TypeIds.TemporalPlainYearMonth:
      return Temporal.PlainYearMonth.from(value as string);
    case TypeIds.TemporalZonedDateTime:
      return Temporal.ZonedDateTime.from(value as string);
    case TypeIds.Regex:
      const idx = (value as string).lastIndexOf('/');
      return new RegExp((value as string).slice(1, idx), (value as string).slice(idx + 1));
    case TypeIds.Error:
      return new Error();
    case TypeIds.Signal:
      return new Signal(undefined);
    case TypeIds.ComputedSignal:
      return new ComputedQrl(null!);
    case TypeIds.Store: {
      const data = value as unknown[];
      const t = data[0] as TypeIds;
      const v = data[1];
      return maybeThen(allocate(context, t, v), (raw) => {
        const store = createStore(raw as object);
        const target = unwrapStore(store) as object;
        if (t >= TypeIds.Error || t === TypeIds.Array || t === TypeIds.Object) {
          pendingStoreTargets.set(target, { t, v });
        }
        data[0] = TypeIds.Plain;
        data[1] = target;
        return store;
      });
    }
    case TypeIds.StoreProp:
      return new StorePropSource();
    case TypeIds.URLSearchParams:
      return new URLSearchParams(value as string);
    case TypeIds.FormData:
      return new FormData();
    case TypeIds.BigInt:
      return BigInt(value as string);
    case TypeIds.Set:
      return new Set();
    case TypeIds.Map:
      return new Map();
    case TypeIds.Promise:
      let resolve!: (value: any) => void;
      let reject!: (error: any) => void;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      resolvers.set(promise, [resolve, reject]);
      // Don't leave unhandled promise rejections
      promise.catch(() => {});
      return promise;
    case TypeIds.Uint8Array:
      const encodedLength = (value as string).length;
      const blocks = encodedLength >>> 2;
      const rest = encodedLength & 3;
      const decodedLength = blocks * 3 + (rest ? rest - 1 : 0);
      return new Uint8Array(decodedLength);
    case TypeIds.EffectSubscription: {
      if (Array.isArray(value) && value[1] === EffectKind.Branch) {
        return new BranchSubscription(null!, context.scheduler);
      }
      if (Array.isArray(value) && value[1] === EffectKind.ForBlock) {
        return new ForBlockSubscription(null!, context.scheduler);
      }
      return new DomSubscription(null!, context.scheduler);
    }
    case TypeIds.Task:
      return new TaskSubscription(new Task(undefined, Phase.BlockingTask, undefined, context));
    case TypeIds.ContextScope:
      return createContextScope(null);
    case TypeIds.SlotScope:
      return createSlotScope();
    case TypeIds.Projection:
      return createProjection();
    default:
      throw qError(QError.serializeErrorCannotAllocate, [typeId]);
  }
};
