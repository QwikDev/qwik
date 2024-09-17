import type { JSXOutput } from '../../render/jsx/types/jsx-node';
import { createSubscriptionManager, type SubscriptionManager } from '../../state/common';
import type { Signal } from '../../state/signal';
import type { ContextId } from '../../use/use-context';
import { trackSignal2 } from '../../use/use-core';
import type { ValueOrPromise } from '../../util/types';
import { version } from '../../version';
import type { Effect } from '../signal/v2-signal';
import type { StreamWriter, SymbolToChunkResolver } from '../ssr/ssr-types';
import type { Scheduler } from './scheduler';
import { createScheduler } from './scheduler';
import { createSerializationContext, type SerializationContext } from './shared-serialization';
import type { Container2, HostElement, fixMeAny } from './types';

/** @internal */
export abstract class _SharedContainer implements Container2 {
  readonly $version$: string;
  readonly $scheduler$: Scheduler;
  readonly $subsManager$: SubscriptionManager;
  /// Current language locale
  readonly $locale$: string;
  /// Retrieve Object from paused serialized state.
  readonly $getObjectById$: (id: number | string) => any;
  $serverData$: Record<string, any>;
  $currentUniqueId$ = 0;
  $instanceHash$: string | null = null;

  constructor(
    scheduleDrain: () => void,
    journalFlush: () => void,
    serverData: Record<string, any>,
    locale: string
  ) {
    this.$serverData$ = serverData;
    this.$locale$ = locale;
    this.$version$ = version;
    this.$getObjectById$ = (id: number | string) => {
      throw Error('Not implemented');
    };

    this.$subsManager$ = createSubscriptionManager(this as fixMeAny);
    this.$scheduler$ = createScheduler(this, scheduleDrain, journalFlush);
  }

  trackSignalValue<T>(signal: Signal, subscriber: Effect, property: string, data: any): T {
    return trackSignal2(() => signal.value, subscriber, property, this, data);
  }

  serializationCtxFactory(
    NodeConstructor: SerializationContext['$NodeConstructor$'] | null,
    symbolToChunkResolver: SymbolToChunkResolver,
    writer?: StreamWriter
  ): SerializationContext {
    return createSerializationContext(
      NodeConstructor,
      symbolToChunkResolver,
      this.setHostProp.bind(this),
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
