//////////////////////////////////////////////////////////////////////////////////////////
// Protect against duplicate imports
//////////////////////////////////////////////////////////////////////////////////////////
import { version } from './version';
if ((globalThis as any).__qwik) {
  console.error(
    `==============================================\n` +
      `Qwik version ${(globalThis as any).__qwik} already imported while importing ${version}.\n` +
      `This can lead to issues due to duplicated shared structures.\n` +
      `Verify that the Qwik libraries you're using are in "resolve.noExternal[]" and in "optimizeDeps.exclude".\n` +
      `==============================================\n`
  );
}
(globalThis as any).__qwik = version;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    (globalThis as any).__qwik = undefined;
  });
}

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Core API
//////////////////////////////////////////////////////////////////////////////////////////
export { componentQrl, component$ } from './shared/component.public';

export type { PropsOf, OnRenderFn, Component, PublicProps } from './shared/component.public';

export { isBrowser, isDev, isServer } from '@qwik.dev/core/build';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Event API
//////////////////////////////////////////////////////////////////////////////////////////
export type {
  SnapshotState,
  SnapshotResult,
  SnapshotMeta,
  SnapshotMetaValue,
  SnapshotListener,
  ISsrComponentFrame,
} from './ssr/ssr-types';

//////////////////////////////////////////////////////////////////////////////////////////
// Internal Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { $, sync$, _qrlSync, type SyncQRL } from './shared/qrl/qrl.public';
export { eventQrl } from './shared/qrl/qrl.public';
export { event$ } from './shared/qrl/qrl.public.dollar';

export { qrl, inlinedQrl, inlinedQrlDEV, qrlDEV } from './shared/qrl/qrl';
export type { QRL, PropFunction } from './shared/qrl/qrl.public';
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
export type {
  SSRStreamProps,
  SSRHintProps,
  SSRStreamChildren,
  SSRStreamWriter,
} from './shared/jsx/utils.public';
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
export type {
  JSXOutput,
  FunctionComponent,
  JSXNode,
  JSXNodeInternal,
  DevJSX,
} from './shared/jsx/types/jsx-node';
export type { QwikDOMAttributes, QwikJSX, QwikJSX as JSX } from './shared/jsx/types/jsx-qwik';

export type { QwikIntrinsicElements } from './shared/jsx/types/jsx-qwik-elements';
export type {
  CSSProperties,
  QwikHTMLElements,
  QwikSVGElements,
  SVGAttributes,
  HTMLElementAttrs,
  SVGProps,
} from './shared/jsx/types/jsx-generated';
export { render } from './client/dom-render';
export { getDomContainer, _getQContainerElement } from './client/dom-container';
export type { StreamWriter, RenderSSROptions } from './ssr/ssr-types';
export type { RenderOptions, RenderResult } from './client/types';
export type { SerializationStrategy } from './shared/types';

//////////////////////////////////////////////////////////////////////////////////////////
// use API
//////////////////////////////////////////////////////////////////////////////////////////
export { useLexicalScope } from './use/use-lexical-scope.public';
export { useStore, unwrapStore, forceStoreEffects } from './use/use-store.public';
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
export type { ComputedFn, ComputedReturnType } from './use/use-computed';
export { useComputedQrl } from './use/use-computed';
export { useSerializerQrl, useSerializer$ } from './use/use-serializer';
export type { OnVisibleTaskOptions, VisibleTaskStrategy } from './use/use-visible-task';
export { useVisibleTaskQrl } from './use/use-visible-task';
export type { TaskCtx, TaskFn, Tracker } from './use/use-task';
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
export { useComputed$ } from './use/use-computed';
export type { AsyncComputedFn, AsyncComputedReturnType } from './use/use-async-computed';
export { useAsyncComputedQrl, useAsyncComputed$ } from './use/use-async-computed';
export { useErrorBoundary } from './use/use-error-boundary';
export type { ErrorBoundaryStore } from './shared/error/error-handling';
export {
  type ReadonlySignal,
  type AsyncComputedReadonlySignal,
  type Signal,
  type ComputedSignal,
} from './reactive-primitives/signal.public';
export {
  isSignal,
  createSignal,
  createComputedQrl,
  createComputed$,
  createSerializerQrl,
  createSerializer$,
  createAsyncComputedQrl,
  createAsyncComputed$,
} from './reactive-primitives/signal.public';
export type { ComputedOptions } from './reactive-primitives/types';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Low-Level API
//////////////////////////////////////////////////////////////////////////////////////////
export type { ValueOrPromise } from './shared/utils/types';
export {
  noSerialize,
  NoSerializeSymbol,
  SerializerSymbol,
  type NoSerialize,
} from './shared/serdes/verify';
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
} from './shared/jsx/types/jsx-qwik-events';

//////////////////////////////////////////////////////////////////////////////////////////
// Components
//////////////////////////////////////////////////////////////////////////////////////////
export { PrefetchServiceWorker, PrefetchGraph } from './shared/prefetch-service-worker/prefetch';

//////////////////////////////////////////////////////////////////////////////////////////
// INTERNAL
//////////////////////////////////////////////////////////////////////////////////////////
export * from './internal';
