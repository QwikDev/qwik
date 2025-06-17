//////////////////////////////////////////////////////////////////////////////////////////
// Developer Core API
//////////////////////////////////////////////////////////////////////////////////////////
export { componentQrl, component$ } from './component/component.public';

export type {
  PropsOf,
  OnRenderFn,
  Component,
  PublicProps,
  PropFunctionProps,
  _AllowPlainQrl,
  _Only$,
} from './component/component.public';

export { isBrowser, isDev, isServer } from '@builder.io/qwik/build';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Event API
//////////////////////////////////////////////////////////////////////////////////////////
export type {
  SnapshotState,
  SnapshotResult,
  SnapshotMeta,
  SnapshotMetaValue,
  SnapshotListener,
} from './container/container';

//////////////////////////////////////////////////////////////////////////////////////////
// Internal Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { $, sync$, _qrlSync, type SyncQRL } from './qrl/qrl.public';
export { event$, eventQrl } from './qrl/qrl.public';

export { qrl, inlinedQrl, inlinedQrlDEV, qrlDEV } from './qrl/qrl';
export type { QRL, PropFunction, PropFnInterface } from './qrl/qrl.public';
export { implicit$FirstArg } from './util/implicit_dollar';

//////////////////////////////////////////////////////////////////////////////////////////
// PLATFORM
//////////////////////////////////////////////////////////////////////////////////////////
export { getPlatform, setPlatform } from './platform/platform';
export type { CorePlatform } from './platform/types';

//////////////////////////////////////////////////////////////////////////////////////////
// JSX Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { h, h as createElement } from './render/jsx/factory';
export {
  SSRStreamBlock,
  SSRRaw,
  SSRStream,
  SSRComment,
  SSRHint,
  SkipRender,
} from './render/jsx/utils.public';
export type { SSRStreamProps, SSRHintProps } from './render/jsx/utils.public';
export { Slot } from './render/jsx/slot.public';
export { Fragment, HTMLFragment, RenderOnce, jsx, jsxDEV, jsxs } from './render/jsx/jsx-runtime';
export type * from './render/jsx/types/jsx-generated';
export type {
  DOMAttributes,
  QwikAttributes,
  JSXTagName,
  JSXChildren,
  ComponentBaseProps,
  ClassList,
  CorrectedToggleEvent,
  EventHandler,
  QRLEventHandlerMulti,
} from './render/jsx/types/jsx-qwik-attributes';
export type { JSXOutput, FunctionComponent, JSXNode, DevJSX } from './render/jsx/types/jsx-node';
export type { QwikDOMAttributes, QwikJSX, QwikJSX as JSX } from './render/jsx/types/jsx-qwik';

export type { QwikIntrinsicElements } from './render/jsx/types/jsx-qwik-elements';
export type { QwikHTMLElements, QwikSVGElements } from './render/jsx/types/jsx-generated';
export { render } from './render/dom/render.public';
export type { RenderSSROptions, StreamWriter } from './render/ssr/render-ssr';
export type { RenderOptions, RenderResult } from './render/dom/render.public';

//////////////////////////////////////////////////////////////////////////////////////////
// use API
//////////////////////////////////////////////////////////////////////////////////////////
export { useLexicalScope } from './use/use-lexical-scope.public';
export { useStore } from './use/use-store.public';
export { untrack } from './use/use-core';
export { useId } from './use/use-id';
export { useContext, useContextProvider, createContextId } from './use/use-context';
export { useServerData } from './use/use-env-data';
export { useStylesQrl, useStyles$, useStylesScopedQrl, useStylesScoped$ } from './use/use-styles';
export { useOn, useOnDocument, useOnWindow } from './use/use-on';
export { useSignal, useConstant, createSignal } from './use/use-signal';
export { withLocale, getLocale } from './use/use-locale';

export type { UseStylesScoped } from './use/use-styles';
export type { UseSignal } from './use/use-signal';
export type { ContextId } from './use/use-context';
export type { UseStoreOptions } from './use/use-store.public';
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
  VisibleTaskStrategy,
} from './use/use-task';
export type { ResourceProps, ResourceOptions } from './use/use-resource';
export { useResource$, useResourceQrl, Resource } from './use/use-resource';
export { useTask$, useTaskQrl } from './use/use-task';
export { useVisibleTask$, useVisibleTaskQrl } from './use/use-task';
export { useComputed$, useComputedQrl, createComputed$, createComputedQrl } from './use/use-task';
export { useErrorBoundary } from './use/use-error-boundary';
export type { ErrorBoundaryStore } from './render/error-handling';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Low-Level API
//////////////////////////////////////////////////////////////////////////////////////////
export type { ValueOrPromise } from './util/types';
export type { Signal, ReadonlySignal } from './state/signal';
export type { NoSerialize } from './state/common';
export { noSerialize, unwrapProxy as unwrapStore } from './state/common';
export { isSignal } from './state/signal';
export { version } from './version';

//////////////////////////////////////////////////////////////////////////////////////////
// Qwik Events
//////////////////////////////////////////////////////////////////////////////////////////
export type {
  KnownEventNames,
  QwikSymbolEvent,
  QwikVisibleEvent,
  QwikIdleEvent,
  QwikInitEvent,
  QwikTransitionEvent,
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
  QwikClipboardEvent,
  QwikCompositionEvent,
  QwikDragEvent,
  QwikPointerEvent,
  QwikFocusEvent,
  QwikSubmitEvent,
  QwikInvalidEvent,
  QwikChangeEvent,
  QwikKeyboardEvent,
  QwikMouseEvent,
  QwikTouchEvent,
  QwikUIEvent,
  QwikWheelEvent,
} from './render/jsx/types/jsx-qwik-events';

//////////////////////////////////////////////////////////////////////////////////////////
// Components
//////////////////////////////////////////////////////////////////////////////////////////
export { PrefetchServiceWorker, PrefetchGraph } from './components/prefetch';

//////////////////////////////////////////////////////////////////////////////////////////
// INTERNAL
//////////////////////////////////////////////////////////////////////////////////////////
export * from './internal';
