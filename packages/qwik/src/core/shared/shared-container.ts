import type { JSXOutput } from './jsx/types/jsx-node';
import type { ContextId } from '../use/use-context';
import { trackSignal } from '../use/use-core';
import type { ValueOrPromise } from './utils/types';
import { version } from '../version';
import type { Effect, EffectData } from '../signal/signal';
import type { Signal } from '../signal/signal.public';
import type { StreamWriter, SymbolToChunkResolver } from '../ssr/ssr-types';
import type { Scheduler } from './scheduler';
import { createScheduler } from './scheduler';
import { createSerializationContext, type SerializationContext } from './shared-serialization';
import type { Container, HostElement, ObjToProxyMap } from './types';

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

  constructor(
    scheduleDrain: () => void,
    journalFlush: () => void,
    serverData: Record<string, any>,
    locale: string
  ) {
    this.$serverData$ = serverData;
    this.$locale$ = locale;
    this.$version$ = version;
    this.$storeProxyMap$ = new WeakMap();
    this.$getObjectById$ = (_id: number | string) => {
      throw Error('Not implemented');
    };

    this.$scheduler$ = createScheduler(this, scheduleDrain, journalFlush);
  }

  trackSignalValue<T>(signal: Signal, subscriber: Effect, property: string, data: EffectData): T {
    return trackSignal(() => signal.value, subscriber, property, this, data);
  }

  serializationCtxFactory(
    NodeConstructor: {
      new (...rest: any[]): { nodeType: number; id: string };
    } | null,
    symbolToChunkResolver: SymbolToChunkResolver,
    writer?: StreamWriter,
    prepVNode?: (vNode: any) => void
  ): SerializationContext {
    return createSerializationContext(
      NodeConstructor,
      symbolToChunkResolver,
      this.getHostProp.bind(this),
      this.setHostProp.bind(this),
      this.$storeProxyMap$,
      writer,
      prepVNode
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
