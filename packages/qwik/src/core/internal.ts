import type { ContainerContext } from './runtime/container-context';
import { getActiveInvokeContext } from './runtime/invoke-context';

export { isDev, isServer } from '@qwik.dev/core/build';
export { getPlatform, setPlatform } from './shared/platform/platform';
export { getAsyncLocalStorage as _getAsyncLocalStorage } from './shared/platform/async-local-storage';
export { _deserialize, _serialize } from './shared/serdes/standalone';
export {
  SerializerSymbol,
  verifySerializable as _verifySerializable,
} from './shared/serdes/verify';
export { _UNINITIALIZED } from './shared/utils/constants';
export { QContainerSelector } from './shared/utils/markers';
export type { SerializationStrategy } from './shared/types';
export type { StreamWriter } from './shared/utils/stream-writer';
export type { ValueOrPromise } from './shared/utils/types';
export type { JSXOutput } from './shared/jsx/types/jsx-node';
export type { QwikSymbolEvent } from './shared/jsx/types/jsx-qwik-events';
export type { PublicAsyncSignal as AsyncSignal } from './reactive/public-types';
export { AsyncSignal as _AsyncSignal } from './reactive/async-signal';
export { useContext as _resolveContext } from './runtime/context';
export { getActiveInvokeContextOrNull } from './runtime/invoke-context';
export {
  forceStoreEffects,
  hasStoreEffects as _hasStoreEffects,
  unwrapStore,
} from './reactive/store';
export { renderCompiled as _renderCompiled } from './csr-render';
export type { CsrRenderRoot as _CsrRenderRoot } from './csr-render';
export { createContainerContext, getOrCreateContainerContext } from './runtime/container-context';
export type {
  ContainerContext,
  ContainerContext as ClientContainer,
  ContainerContext as DomContainer,
  ContainerContext as _Container,
} from './runtime/container-context';
export { Scheduler } from './runtime/scheduler';

/** @internal */
export const _getContextContainer = (): ContainerContext | undefined =>
  getActiveInvokeContext().container;

/** @internal */
export const _waitUntilRendered = (container: ContainerContext): Promise<void> =>
  container.scheduler.flushInteraction();
