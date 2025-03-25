//////////////////////////////////////////////////////////////////////////////////////////
// Developer Core API
//////////////////////////////////////////////////////////////////////////////////////////
export { component$, componentQrl } from './component/component.public';

export type {
  Component,
  OnRenderFn,
  PropFunctionProps,
  PropsOf,
  PublicProps,
  _AllowPlainQrl,
  _Only$
} from './component/component.public';

export { isBrowser, isDev, isServer } from '@builder.io/qwik/build';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Event API
//////////////////////////////////////////////////////////////////////////////////////////
export type {
  SnapshotListener,
  SnapshotMeta,
  SnapshotMetaValue,
  SnapshotResult,
  SnapshotState
} from './container/container';

//////////////////////////////////////////////////////////////////////////////////////////
// Internal Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { $, _qrlSync, event$, eventQrl, sync$, type SyncQRL } from './qrl/qrl.public';

export { inlinedQrl, inlinedQrlDEV, qrl, qrlDEV } from './qrl/qrl';
export type { PropFnInterface, PropFunction, QRL } from './qrl/qrl.public';
export { implicit$FirstArg } from './util/implicit_dollar';

//////////////////////////////////////////////////////////////////////////////////////////
// PLATFORM
//////////////////////////////////////////////////////////////////////////////////////////
export { getPlatform, setPlatform } from './platform/platform';
export type { CorePlatform } from './platform/types';

//////////////////////////////////////////////////////////////////////////////////////////
// JSX Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { h as createElement, h } from './render/jsx/factory';
export { Fragment, HTMLFragment, RenderOnce, jsx, jsxDEV, jsxs } from './render/jsx/jsx-runtime';
export { Slot } from './render/jsx/slot.public';
export type * from './render/jsx/types/jsx-generated';
export type { DevJSX, FunctionComponent, JSXNode, JSXOutput } from './render/jsx/types/jsx-node';
export type { QwikJSX as JSX, QwikDOMAttributes, QwikJSX } from './render/jsx/types/jsx-qwik';
export type {
  ClassList,
  ComponentBaseProps,
  CorrectedToggleEvent,
  DOMAttributes,
  EventHandler,
  JSXChildren,
  JSXTagName,
  QRLEventHandlerMulti,
  QwikAttributes
} from './render/jsx/types/jsx-qwik-attributes';
export {
  SSRComment,
  SSRHint,
  SSRRaw,
  SSRStream,
  SSRStreamBlock,
  SkipRender
} from './render/jsx/utils.public';
export type { SSRHintProps, SSRStreamProps } from './render/jsx/utils.public';

export { render } from './render/dom/render.public';
export type { RenderOptions, RenderResult } from './render/dom/render.public';
export type { QwikHTMLElements, QwikSVGElements } from './render/jsx/types/jsx-generated';
export type { QwikIntrinsicElements } from './render/jsx/types/jsx-qwik-elements';
export type { RenderSSROptions, StreamWriter } from './render/ssr/render-ssr';

//////////////////////////////////////////////////////////////////////////////////////////
// use API
//////////////////////////////////////////////////////////////////////////////////////////
export { createContextId, useContext, useContextProvider } from './use/use-context';
export { untrack } from './use/use-core';
export { useServerData } from './use/use-env-data';
export { useId } from './use/use-id';
export { useLexicalScope } from './use/use-lexical-scope.public';
export { getLocale, withLocale } from './use/use-locale';
export { useOn, useOnDocument, useOnWindow } from './use/use-on';
export { createSignal, useConstant, useSignal } from './use/use-signal';
export { useStore } from './use/use-store.public';
export { useStyles$, useStylesQrl, useStylesScoped$, useStylesScopedQrl } from './use/use-styles';

export type { ErrorBoundaryStore } from './render/error-handling';
export type { ContextId } from './use/use-context';
export { useErrorBoundary } from './use/use-error-boundary';
export { Resource, useResource$, useResourceQrl } from './use/use-resource';
export type { ResourceOptions, ResourceProps } from './use/use-resource';
export type { UseSignal } from './use/use-signal';
export type { UseStoreOptions } from './use/use-store.public';
export type { UseStylesScoped } from './use/use-styles';
export {
  createComputed$,
  createComputedQrl,
  useComputed$,
  useComputedQrl,
  useTask$,
  useTaskQrl,
  useVisibleTask$,
  useVisibleTaskQrl
} from './use/use-task';
export type {
  ComputedFn,
  EagernessOptions,
  OnVisibleTaskOptions,
  ResourceCtx,
  ResourceFn,
  ResourcePending,
  ResourceRejected,
  ResourceResolved,
  ResourceReturn,
  TaskCtx,
  TaskFn,
  Tracker,
  UseTaskOptions,
  VisibleTaskStrategy
} from './use/use-task';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Low-Level API
//////////////////////////////////////////////////////////////////////////////////////////
export { noSerialize, unwrapProxy as unwrapStore } from './state/common';
export type { NoSerialize } from './state/common';
export { isSignal } from './state/signal';
export type { ReadonlySignal, Signal } from './state/signal';
export type { ValueOrPromise } from './util/types';
export { version } from './version';

//////////////////////////////////////////////////////////////////////////////////////////
// Qwik Events
//////////////////////////////////////////////////////////////////////////////////////////
export type {
  KnownEventNames as KnownEventNames,

  // old
  NativeAnimationEvent,
  NativeClipboardEvent,
  NativeCompositionEvent,
  NativeDragEvent,
  NativeFocusEvent,
  NativeKeyboardEvent,
  NativeMouseEvent,
  NativePointerEvent,
  NativeTouchEvent,
  NativeTransitionEvent,
  NativeUIEvent,
  NativeWheelEvent,
  QwikAnimationEvent,
  QwikChangeEvent,
  QwikClipboardEvent,
  QwikCompositionEvent,
  QwikDragEvent,
  QwikFocusEvent,
  QwikIdleEvent,
  QwikInitEvent,
  QwikInvalidEvent,
  QwikKeyboardEvent,
  QwikMouseEvent,
  QwikPointerEvent,
  QwikSubmitEvent,
  QwikSymbolEvent,
  QwikTouchEvent,
  QwikTransitionEvent,
  QwikUIEvent,
  QwikVisibleEvent,
  QwikWheelEvent
} from './render/jsx/types/jsx-qwik-events';

//////////////////////////////////////////////////////////////////////////////////////////
// Components
//////////////////////////////////////////////////////////////////////////////////////////
export { PrefetchGraph, PrefetchServiceWorker } from './buffering/components/prefetch';

//////////////////////////////////////////////////////////////////////////////////////////
// INTERNAL
//////////////////////////////////////////////////////////////////////////////////////////
export * from './internal';
