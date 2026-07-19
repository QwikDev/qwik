import { useSignal as useSignalImpl } from './reactive/public-api';
import type { PublicSignal } from './reactive/public-types';

export { component$ } from './shared/component.public';
export type { Component, OnRenderFn, PropsOf, PublicProps } from './shared/component.public';

export { isBrowser, isDev, isServer } from '@qwik.dev/core/build';

export { $, sync$, type SyncQRL } from './shared/qrl/qrl.public';
export { event$ } from './shared/qrl/qrl.public.dollar';
export { inlinedQrl } from './shared/qrl/qrl';
export type { QRLDev } from './shared/qrl/qrl';
export type { PropFunction, QRL } from './shared/qrl/qrl.public';
export { implicit$FirstArg } from './shared/qrl/implicit_dollar';

export { getClientManifest } from './shared/get-client-manifest';
export { getPlatform } from './shared/platform/platform';
export type { CorePlatform } from './shared/platform/types';

export type {
  ClassList,
  ComponentBaseProps,
  DOMAttributes,
  EventHandler,
  JSXChildren,
  JSXTagName,
  QRLEventHandlerMulti,
  QwikAttributes,
} from './shared/jsx/types/jsx-qwik-attributes';
export type { FunctionComponent, JSXOutput } from './shared/jsx/types/jsx-node';
export type { QwikDOMAttributes, QwikJSX, QwikJSX as JSX } from './shared/jsx/types/jsx-qwik';
export type { QwikIntrinsicElements } from './shared/jsx/types/jsx-qwik-elements';
export type {
  CSSProperties,
  HTMLElementAttrs,
  QwikHTMLElements,
  QwikSVGElements,
  SVGAttributes,
  SVGProps,
} from './shared/jsx/types/jsx-generated';
export type { KnownEventNames, QwikVisibleEvent } from './shared/jsx/types/jsx-qwik-events';

export { noSerialize, NoSerializeSymbol, SerializerSymbol } from './shared/serdes/verify';
export type { NoSerialize } from './shared/serdes/verify';
export type { SerializationStrategy } from './shared/types';
export type { ValueOrPromise } from './shared/utils/types';
export { version } from './version';

export { render } from './csr-render';
export type { RenderOptions, RenderResult, RenderRoot } from './render-types';
export { Slot } from './dom/slot/slot';

export { useAsync$, useComputed$, useConstant, useSerializer$ } from './reactive/public-api';
/** @public */
export const useSignal = useSignalImpl as {
  <T>(): PublicSignal<T | undefined>;
  <T>(value: T): PublicSignal<T>;
};
export type {
  AsyncCtx,
  AsyncSignalOptions,
  ComputedOptions,
  ComputedSignal,
  ComputeCtx,
  PublicSignal as Signal,
  PublicAsyncSignal as AsyncSignal,
  ReadonlySignal,
  SerializerArg,
  SerializerArgObject,
  Tracker,
} from './reactive/public-types';
export { forceStoreEffects, unwrapStore, useStore } from './reactive/store';
export type { Store, UseStoreOptions } from './reactive/store';
export { untrack } from './reactive/tracking';

export { createContextId, useContext, useContextProvider } from './runtime/context';
export type { ContextId, UseContext } from './runtime/context';
export { useId } from './runtime/use-id';
export { getLocale, setLocale, withLocale } from './runtime/use-locale';
export { useOn, useOnDocument, useOnWindow } from './runtime/use-on';
export type { UseOnOptions } from './runtime/use-on';
export { useServerData } from './runtime/use-server-data';
export { useStyles$, useStylesScoped$ } from './runtime/use-styles';
export { useTask$, useVisibleTask$ } from './runtime/task';
export type {
  TaskCtx,
  TaskFn,
  TaskOptions,
  VisibleTaskOptions,
  VisibleTaskStrategy,
} from './runtime/task';
