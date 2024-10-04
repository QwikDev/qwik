//////////////////////////////////////////////////////////////////////////////////////////
// Developer Core API
//////////////////////////////////////////////////////////////////////////////////////////
export { componentQrl, component$ } from './shared/component.public';

export type {
  PropsOf,
  OnRenderFn,
  Component,
  PublicProps,
  PropFunctionProps,
  _AllowPlainQrl,
  _Only$,
} from './shared/component.public';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Event API
//////////////////////////////////////////////////////////////////////////////////////////
export type {
  SnapshotState,
  SnapshotResult,
  SnapshotMeta,
  SnapshotMetaValue,
  SnapshotListener,
} from './ssr/ssr-types';

//////////////////////////////////////////////////////////////////////////////////////////
// Internal Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { $, sync$, _qrlSync, type SyncQRL } from './shared/qrl/qrl.public';
export { eventQrl } from './shared/qrl/qrl.public';
export { event$ } from './shared/qrl/qrl.public.dollar';

export { qrl, inlinedQrl, inlinedQrlDEV, qrlDEV } from './shared/qrl/qrl';
export type { QRL, PropFunction, PropFnInterface } from './shared/qrl/qrl.public';
export { implicit$FirstArg } from './shared/qrl/implicit_dollar';

//////////////////////////////////////////////////////////////////////////////////////////
// PLATFORM
//////////////////////////////////////////////////////////////////////////////////////////
export { getPlatform, setPlatform } from './shared/platform/platform';
export type { CorePlatform } from './shared/platform/types';
export type { ClientContainer } from './client/types';
export type { DomContainer } from './client/dom-container';

//////////////////////////////////////////////////////////////////////////////////////////
// JSX Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export {
  SSRStreamBlock,
  SSRRaw,
  SSRStream,
  SSRComment,
  SkipRender,
} from './shared/jsx/utils.public';
export type { SSRStreamProps, SSRHintProps, SSRStreamChildren } from './shared/jsx/utils.public';
export { Slot } from './shared/jsx/slot.public';
export {
  Fragment,
  RenderOnce,
  jsx,
  jsxDEV,
  jsxs,
  h,
  h as createElement,
} from './shared/jsx/jsx-runtime';
export type * from './shared/jsx/types/jsx-generated';
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
} from './shared/jsx/types/jsx-qwik-attributes';
export type { JSXOutput, FunctionComponent, JSXNode, DevJSX } from './shared/jsx/types/jsx-node';
export type { QwikDOMAttributes, QwikJSX, QwikJSX as JSX } from './shared/jsx/types/jsx-qwik';

export type { QwikIntrinsicElements } from './shared/jsx/types/jsx-qwik-elements';
export type { QwikHTMLElements, QwikSVGElements } from './shared/jsx/types/jsx-generated';
export { render as render } from './client/dom-render';
export { getDomContainer, _getQContainerElement } from './client/dom-container';
export type { StreamWriter, RenderSSROptions } from './ssr/ssr-types';
export type { RenderOptions, RenderResult } from './client/types';

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
export { useSignal, useConstant } from './use/use-signal';
export { withLocale, getLocale } from './use/use-locale';

export type { UseStylesScoped } from './use/use-styles';
export type { UseSignal } from './use/use-signal';
export type { ContextId } from './use/use-context';
export type { UseStoreOptions } from './use/use-store.public';
export type { ComputedFn } from './use/use-computed';
export { useComputedQrl } from './use/use-computed';
export type { OnVisibleTaskOptions, VisibleTaskStrategy } from './use/use-visible-task';
export { useVisibleTaskQrl } from './use/use-visible-task';
export type { EagernessOptions, TaskCtx, TaskFn, Tracker, UseTaskOptions } from './use/use-task';
export type {
  ResourceProps,
  ResourceOptions,
  ResourceCtx,
  ResourceFn,
  ResourcePending,
  ResourceRejected,
  ResourceResolved,
  ResourceReturn,
} from './use/use-resource';
export { useResourceQrl, Resource } from './use/use-resource';
export { useResource$ } from './use/use-resource-dollar';
export { useTaskQrl } from './use/use-task';
export { useTask$ } from './use/use-task-dollar';
export { useVisibleTask$ } from './use/use-visible-task-dollar';
export { useComputed$ } from './use/use-computed-dollar';
export { useErrorBoundary } from './use/use-error-boundary';
export type { ErrorBoundaryStore } from './shared/error/error-handling';
export { type ReadonlySignal, type Signal, type ComputedSignal } from './signal/signal.public';
export { isSignal, createSignal, createComputedQrl, createComputed$ } from './signal/signal.public';
export { EffectData as _EffectData } from './signal/signal';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Low-Level API
//////////////////////////////////////////////////////////////////////////////////////////
export type { ValueOrPromise } from './shared/utils/types';
export { type NoSerialize } from './shared/utils/serialize-utils';
export { noSerialize } from './shared/utils/serialize-utils';
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
  QwikTransitionEvent,
} from './shared/jsx/types/jsx-qwik-events';

//////////////////////////////////////////////////////////////////////////////////////////
// Components
//////////////////////////////////////////////////////////////////////////////////////////
export { PrefetchServiceWorker, PrefetchGraph } from './shared/prefetch-service-worker/prefetch';

//////////////////////////////////////////////////////////////////////////////////////////
// INTERNAL
//////////////////////////////////////////////////////////////////////////////////////////
export * from './internal';
