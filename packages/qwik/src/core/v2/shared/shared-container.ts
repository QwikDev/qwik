import type { ObjToProxyMap } from '../../container/container';
import type { JSXOutput } from '../../render/jsx/types/jsx-node';
import {
  createSubscriptionManager,
  type Subscriber,
  type SubscriptionManager,
} from '../../state/common';
import type { ContextId } from '../../use/use-context';
import type { ValueOrPromise } from '../../util/types';
import type { Scheduler } from './scheduler';
import { createSerializationContext, type SerializationContext } from './shared-serialization';
import type { Container2, fixMeAny, HostElement } from './types';
import { createScheduler } from './scheduler';
import type { StreamWriter, SymbolToChunkResolver } from '../ssr/ssr-types';
import { version } from '../../version';
import { trackSignal } from '../../use/use-core';
import type { Signal } from '../../state/signal';

/** @internal */
export abstract class _SharedContainer implements Container2 {
  readonly $version$: string;
  readonly $scheduler$: Scheduler;
  readonly $subsManager$: SubscriptionManager;
  readonly $proxyMap$: ObjToProxyMap;
  /// Current language locale
  readonly $locale$: string;
  /// Retrieve Object from paused serialized state.
  readonly $getObjectById$: (id: number | string) => any;
  $serverData$: Record<string, any>;

  constructor(scheduleDrain: () => void, serverData: Record<string, any>, locale: string) {
    this.$serverData$ = serverData;
    this.$locale$ = locale;
    this.$version$ = version;
    this.$proxyMap$ = new WeakMap();
    this.$getObjectById$ = (id: number | string) => {
      throw Error('Not implemented');
    };

    this.$subsManager$ = createSubscriptionManager(this as fixMeAny);
    this.$scheduler$ = createScheduler(this, scheduleDrain);
  }

  trackSignalValue<T>(signal: Signal, sub: Subscriber): T {
    return trackSignal(signal, sub);
  }

  serializationCtxFactory(
    NodeConstructor: SerializationContext['$NodeConstructor$'] | null,
    symbolToChunkResolver: SymbolToChunkResolver,
    writer?: StreamWriter
  ): SerializationContext {
    return createSerializationContext(
      NodeConstructor,
      this.$proxyMap$,
      symbolToChunkResolver,
      writer
    );
  }

  abstract ensureProjectionResolved(host: HostElement): void;
  abstract processJsx(host: HostElement, jsx: JSXOutput): ValueOrPromise<void>;
  abstract handleError(err: any, $host$: HostElement): void;
  abstract getParentHost(host: HostElement): HostElement | null;
  abstract setContext<T>(host: HostElement, context: ContextId<T>, value: T): void;
  abstract resolveContext<T>(host: HostElement, contextId: ContextId<T>): T | undefined;
  abstract setHostProp<T>(host: HostElement, name: string, value: T): void;
  abstract getHostProp<T>(host: HostElement, name: string): T | null;
  abstract $appendStyle$(
    content: string,
    styleId: string,
    host: HostElement,
    scoped: boolean
  ): void;
}
