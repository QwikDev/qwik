import { DomSubscription, ForBlockSubscription } from '../../vdomless/dom/effect/effect';
import { BranchSubscription } from '../../vdomless/dom/branch/branch';
import { EffectKind } from '../../vdomless/dom/effect/effect-kind.enum';
import { ComputedQrl } from '../../vdomless/reactive/computed-qrl';
import { Signal } from '../../vdomless/reactive/signal';
import type { ContainerContext } from '../../vdomless/runtime/container-context';
import { createContextScope } from '../../vdomless/runtime/context-scope';
import { qError, QError } from '../error/error';
import type { QRLInternal } from '../qrl/qrl-class';
import { _UNINITIALIZED } from '../utils/constants';
import { _constants, TypeIds, type Constants } from './constants';
import { createQRLWithBackChannel } from './qrl-to-string';

export const resolvers = new WeakMap<Promise<any>, [Function, Function]>();

export const allocate = async (
  context: ContainerContext,
  typeId: number,
  value: unknown
): Promise<any> => {
  switch (typeId) {
    case TypeIds.Plain:
      return value;
    case TypeIds.RootRef:
      return context.getRoot(value as number);
    case TypeIds.ForwardRef:
      const rootRef = context.forwardRefs?.[value as number];
      if (rootRef === -1 || rootRef === undefined) {
        return _UNINITIALIZED;
      } else {
        return context.getRoot(rootRef);
      }
    case TypeIds.ForwardRefs:
      return value;
    case TypeIds.Constant:
      return _constants[value as Constants];
    case TypeIds.Array:
      return Array((value as any[]).length / 2);
    case TypeIds.Object:
      return {};
    case TypeIds.QRL: {
      let qrl: QRLInternal;
      if (typeof value === 'string') {
        const [chunkId, symbolId, captureIds] = value.split('#');
        const chunk = (await context.getRoot(chunkId)) as string;
        const symbol = (await context.getRoot(symbolId)) as string;
        qrl = createQRLWithBackChannel(chunk, symbol, captureIds || null, context);
      } else {
        // Sync qrl
        qrl = createQRLWithBackChannel('', String(value), null, context);
      }
      return qrl;
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
    case TypeIds.ContextScope:
      return createContextScope(null);
    default:
      throw qError(QError.serializeErrorCannotAllocate, [typeId]);
  }
};
