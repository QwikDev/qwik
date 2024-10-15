//////////////////////////////////////////////////////////////////////////////////////////
// Developer Core API
//////////////////////////////////////////////////////////////////////////////////////////
export { component$, componentQrl } from './shared/component.public';

export type {
  Component,
  OnRenderFn,
  PropFunctionProps,
  PropsOf,
  PublicProps,
  _AllowPlainQrl,
  _Only$,
} from './shared/component.public';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Event API
//////////////////////////////////////////////////////////////////////////////////////////
export type {
  ISsrComponentFrame,
  SnapshotListener,
  SnapshotMeta,
  SnapshotMetaValue,
  SnapshotResult,
  SnapshotState,
} from './ssr/ssr-types';

//////////////////////////////////////////////////////////////////////////////////////////
// Internal Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { $, _qrlSync, eventQrl, sync$, type SyncQRL } from './shared/qrl/qrl.public';
export { event$ } from './shared/qrl/qrl.public.dollar';

export { implicit$FirstArg } from './shared/qrl/implicit_dollar';
export { inlinedQrl, inlinedQrlDEV, qrl, qrlDEV } from './shared/qrl/qrl';
export type { PropFnInterface, PropFunction, QRL } from './shared/qrl/qrl.public';

//////////////////////////////////////////////////////////////////////////////////////////
// PLATFORM
//////////////////////////////////////////////////////////////////////////////////////////
export type { DomContainer } from './client/dom-container';
export type { ClientContainer } from './client/types';
export { getPlatform, setPlatform } from './shared/platform/platform';
export type { CorePlatform } from './shared/platform/types';

//////////////////////////////////////////////////////////////////////////////////////////
// JSX Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export {
  Fragment,
  RenderOnce,
  h as createElement,
  h,
  jsx,
  jsxDEV,
  jsxs,
} from './shared/jsx/jsx-runtime';
export { Slot } from './shared/jsx/slot.public';
export type * from './shared/jsx/types/jsx-generated';
export type { DevJSX, FunctionComponent, JSXNode, JSXOutput } from './shared/jsx/types/jsx-node';
export type { QwikJSX as JSX, QwikDOMAttributes, QwikJSX } from './shared/jsx/types/jsx-qwik';
export type {
  ClassList,
  ComponentBaseProps,
  CorrectedToggleEvent,
  DOMAttributes,
  EventHandler,
  JSXChildren,
  JSXTagName,
  QRLEventHandlerMulti,
  QwikAttributes,
} from './shared/jsx/types/jsx-qwik-attributes';
export {
  SSRComment,
  SSRRaw,
  SSRStream,
  SSRStreamBlock,
  SkipRender,
} from './shared/jsx/utils.public';
export type { SSRHintProps, SSRStreamChildren, SSRStreamProps } from './shared/jsx/utils.public';

export { _getQContainerElement, getDomContainer } from './client/dom-container';
export { render as render } from './client/dom-render';
export type { RenderOptions, RenderResult } from './client/types';
export type { QwikHTMLElements, QwikSVGElements } from './shared/jsx/types/jsx-generated';
export type { QwikIntrinsicElements } from './shared/jsx/types/jsx-qwik-elements';
export type { RenderSSROptions, StreamWriter } from './ssr/ssr-types';

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
export { useConstant, useSignal } from './use/use-signal';
export { useStore } from './use/use-store.public';
export { useStyles$, useStylesQrl, useStylesScoped$, useStylesScopedQrl } from './use/use-styles';

export type { ErrorBoundaryStore } from './shared/error/error-handling';
export { EffectData as _EffectData } from './signal/signal';
export {
  createComputed$,
  createComputedQrl,
  createSignal,
  isSignal,
  type ComputedSignal,
  type ReadonlySignal,
  type Signal,
} from './signal/signal.public';
export { useComputedQrl } from './use/use-computed';
export type { ComputedFn } from './use/use-computed';
export { useComputed$ } from './use/use-computed-dollar';
export type { ContextId } from './use/use-context';
export { useErrorBoundary } from './use/use-error-boundary';
export { Resource, useResourceQrl } from './use/use-resource';
export type {
  ResourceCtx,
  ResourceFn,
  ResourceOptions,
  ResourcePending,
  ResourceProps,
  ResourceRejected,
  ResourceResolved,
  ResourceReturn,
} from './use/use-resource';
export { useResource$ } from './use/use-resource-dollar';
export type { UseSignal } from './use/use-signal';
export type { UseStoreOptions } from './use/use-store.public';
export type { UseStylesScoped } from './use/use-styles';
export { useTaskQrl } from './use/use-task';
export type { EagernessOptions, TaskCtx, TaskFn, Tracker, UseTaskOptions } from './use/use-task';
export { useTask$ } from './use/use-task-dollar';
export { useVisibleTaskQrl } from './use/use-visible-task';
export type { OnVisibleTaskOptions, VisibleTaskStrategy } from './use/use-visible-task';
export { useVisibleTask$ } from './use/use-visible-task-dollar';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Low-Level API
//////////////////////////////////////////////////////////////////////////////////////////
export { noSerialize, type NoSerialize } from './shared/utils/serialize-utils';
export type { ValueOrPromise } from './shared/utils/types';
export { version } from './version';

//////////////////////////////////////////////////////////////////////////////////////////
// Qwik Events
//////////////////////////////////////////////////////////////////////////////////////////
export type {
  KnownEventNames,
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
  QwikWheelEvent,
} from './shared/jsx/types/jsx-qwik-events';

//////////////////////////////////////////////////////////////////////////////////////////
// Components
//////////////////////////////////////////////////////////////////////////////////////////
export { PrefetchGraph, PrefetchServiceWorker } from './shared/prefetch-service-worker/prefetch';

export { Insights } from './insights/insights';

//////////////////////////////////////////////////////////////////////////////////////////
// INTERNAL
//////////////////////////////////////////////////////////////////////////////////////////
export * from './internal';
