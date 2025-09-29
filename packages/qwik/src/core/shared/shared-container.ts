import type { ContextId } from '../use/use-context';
import { trackSignalAndAssignHost } from '../use/use-core';
import { version } from '../version';
import type { SubscriptionData } from '../reactive-primitives/subscription-data';
import type { Signal } from '../reactive-primitives/signal.public';
import type { StreamWriter, SymbolToChunkResolver } from '../ssr/ssr-types';
import { createScheduler, Scheduler, type Chore } from './scheduler';
import { createSerializationContext, type SerializationContext } from './serdes/index';
import type { Container, HostElement, ObjToProxyMap } from './types';
import { ChoreArray } from '../client/chore-array';

/** @internal */
export abstract class _SharedContainer implements Container {
  readonly $version$: string;
  readonly $scheduler$: Scheduler;
  readonly $storeProxyMap$: ObjToProxyMap;
  /// Current language locale
  readonly $locale$: string;
  /// Retrieve Object from paused serialized state.
  readonly $getObjectById$: (id: number | string) => any;
  $serverData$: Record<string, any>;
  $currentUniqueId$ = 0;
  $instanceHash$: string | null = null;
  $buildBase$: string | null = null;
  $flushEpoch$: number = 0;

  constructor(journalFlush: () => void, serverData: Record<string, any>, locale: string) {
    this.$serverData$ = serverData;
    this.$locale$ = locale;
    this.$version$ = version;
    this.$storeProxyMap$ = new WeakMap();
    this.$getObjectById$ = (_id: number | string) => {
      throw Error('Not implemented');
    };

    const choreQueue = new ChoreArray();
    const blockedChores = new Set<Chore>();
    const runningChores = new Set<Chore>();
    this.$scheduler$ = createScheduler(
      this,
      journalFlush,
      choreQueue,
      blockedChores,
      runningChores
    );
  }

  trackSignalValue<T>(
    signal: Signal,
    subscriber: HostElement,
    property: string,
    data: SubscriptionData
  ): T {
    return trackSignalAndAssignHost(signal, subscriber, property, this, data);
  }

  serializationCtxFactory(
    NodeConstructor: {
      new (...rest: any[]): { __brand__: 'SsrNode' };
    } | null,
    DomRefConstructor: {
      new (...rest: any[]): { __brand__: 'DomRef' };
    } | null,
    symbolToChunkResolver: SymbolToChunkResolver,
    writer?: StreamWriter
  ): SerializationContext {
    return createSerializationContext(
      NodeConstructor,
      DomRefConstructor,
      symbolToChunkResolver,
      this.getHostProp.bind(this),
      this.setHostProp.bind(this),
      this.$storeProxyMap$,
      writer
    );
  }

  abstract ensureProjectionResolved(host: HostElement): void;
  abstract handleError(err: any, $host$: HostElement | null): void;
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
