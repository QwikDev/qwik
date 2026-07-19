import { QError, qError } from './shared/error/error';
import { version } from './version';

if ((globalThis as any).__qwik) {
  qError(QError.duplicateQwik, [(globalThis as any).__qwik, version]);
}
(globalThis as any).__qwik = version;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    (globalThis as any).__qwik = undefined;
  });
}

export { componentQrl, component$ } from './shared/component.public';
export type { PropsOf, OnRenderFn, Component, PublicProps } from './shared/component.public';

export { isBrowser, isDev, isServer } from '@qwik.dev/core/build';

export { $, sync$, _qrlSync, eventQrl, type SyncQRL } from './shared/qrl/qrl.public';
export { event$ } from './shared/qrl/qrl.public.dollar';
export { createQRL, type QRLInternal } from './shared/qrl/qrl-class';
export {
  qrl,
  inlinedQrl,
  inlinedQrlDEV,
  qrlDEV,
  _noopQrl,
  _noopQrlDEV,
  _qrlWithChunk,
  _qrlWithChunkDEV,
  _regSymbol,
} from './shared/qrl/qrl';
export { isQrl } from './shared/qrl/qrl-utils';
export { qrlToChunks } from './shared/serdes/qrl-to-string';
export type { QRL, PropFunction } from './shared/qrl/qrl.public';
export { implicit$FirstArg } from './shared/qrl/implicit_dollar';

export { getPlatform, setPlatform } from './shared/platform/platform';
export type { CorePlatform } from './shared/platform/types';
export { getClientManifest } from './shared/get-client-manifest';
export { Fragment, jsx, jsxs, jsxDEV } from './shared/jsx/compiler-runtime';

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
export type { JSXOutput, FunctionComponent, DevJSX } from './shared/jsx/types/jsx-node';
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
export type { SerializationStrategy } from './shared/types';

export type {
  KnownEventNames,
  QwikIdleEvent,
  QwikInitEvent,
  QwikResumeEvent,
  QwikSymbolEvent,
  QwikTransitionEvent,
  QwikViewTransitionEvent,
  QwikVisibleEvent,
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

export type { ValueOrPromise } from './shared/utils/types';
export type { StreamWriter } from './shared/utils/stream-writer';
export {
  noSerialize,
  NoSerializeSymbol,
  SerializerSymbol,
  type NoSerialize,
} from './shared/serdes/verify';
export { _deserialize, _serialize } from './shared/serdes/standalone';
export {
  _getAsyncLocalStorage,
  _getContextContainer,
  _hasStoreEffects,
  _renderCompiled,
  _verifySerializable,
  _waitUntilRendered,
  QContainerSelector,
} from './internal';
export { Scheduler } from './runtime/scheduler';
export { _UNINITIALIZED } from './shared/utils/constants';
export { version } from './version';

export { ComputedFlags, OwnerFlags, SubscriberFlags } from './reactive/flags';
export { render } from './csr-render';
export type { RenderOptions, RenderResult, RenderRoot } from './render-types';
export { escapeHTML } from './shared/utils/character-escaping';
export { maybeThen, promiseAll } from './shared/utils/promises';
export {
  isComputedSource,
  peekSourceValue,
  readSourceValue,
  type ComputedSource,
  type Source,
} from './reactive/source';
export { cleanupDeps, disposeSubscriber, disposeSubscribers } from './reactive/cleanup';
export {
  _await,
  addDependency,
  getActiveCollector,
  runWithCollector,
  track,
  untrack,
} from './reactive/tracking';
export {
  _wrapArray,
  useComputed,
  useComputedQrl,
  useComputed$,
  useAsync,
  useAsyncQrl,
  useAsync$,
  useSerializer,
  useSerializerQrl,
  useSerializer$,
} from './reactive/public-api';
export { useConstant, useSignal } from './reactive/signal-api';
export { Signal } from './reactive/signal';
export { Computed, readComputed, readComputedUntracked } from './reactive/computed';
export { markComputedDirty } from './reactive/notify';
export { ComputedQrl, type ComputedQrlFn, type ComputedQrlRef } from './reactive/computed-qrl';
export {
  AsyncSignal,
  AsyncSignal as _AsyncSignal,
  type AsyncSignalFn,
  type AsyncSignalQrl,
} from './reactive/async-signal';
export { SerializerSignal, type SerializerSignalQrl } from './reactive/serializer-signal';
export type {
  AsyncCtx,
  AsyncSignalOptions,
  ComputedOptions,
  ComputedSignal,
  ComputeCtx,
  PublicAsyncSignal as AsyncSignalType,
  SerializerArg,
  SerializerArgObject,
  Tracker,
} from './reactive/public-types';
export {
  forceStoreEffects,
  unwrapStore,
  useStore,
  type Store,
  type UseStoreOptions,
} from './reactive/store';
export { useId } from './runtime/use-id';
export {
  createSsrEventAttr,
  createSsrNodeId,
  createSsrElementRecord,
  createSsrRecord,
  createSsrRootRef,
  createSsrRootRefPath,
  isSsrEventAttrChunk,
  isSsrRecordChunk,
  type SsrChunk,
  type SsrEventAttrChunk,
  type SsrOutput,
  type SsrRecordPart,
  type SsrRecordChunk,
  type SsrReferenceChunk,
} from './ssr/output';
export { SsrOutputWriter } from './ssr/output-writer';
export {
  createSerializationContext,
  type SerializationContext,
} from './shared/serdes/serialization-context';

export {
  SubscriberKind,
  type BranchSubscriber,
  type Collector,
  type CollectorSubscriber,
  type ComputedSubscriber,
  type DomSubscriber,
  type ForBlockSubscriber,
  type IdleJobRecord,
  type IdleSubscriber,
  type PhaseSubscriber,
  type SsrForBlockSubscriber,
  type Subscriber,
  type TaskSubscriber,
  type VisibleTaskSubscriber,
} from './runtime/subscriber';
export {
  createOwner,
  disposeOwner,
  getActiveOwner,
  registerSubscriberToOwner,
  runWithOwner,
  type Owner,
} from './runtime/owner';
export {
  getActiveInvokeContext,
  getActiveInvokeContextOrNull,
  invoke,
  invokeApply,
  newChildInvokeContext,
  newInvokeContext,
  type ChildInvokeContextOptions,
  type NewInvokeContextOptions,
  type RuntimeInvokeContext,
} from './runtime/invoke-context';
export {
  Slot,
  createProjection,
  createSlot,
  createSlotScope,
  isProjection,
  isSlotScope,
  registerProjection,
  renderSsrSlot,
  resolveSlot,
  type Projection,
  type SlotName,
  type SlotScope,
} from './dom/slot/slot';
export { ContextScope, createContextScope, isContextScope } from './runtime/context-scope';
export {
  createContextId,
  useContext as _resolveContext,
  useContext,
  useContextProvider,
  type ContextId,
  type UseContext,
} from './runtime/context';
export { Phase, type TaskScheduler } from './runtime/scheduler';
export {
  Task,
  TaskSubscription,
  VisibleTask,
  VisibleTaskSubscription,
  useTask,
  useTask$,
  useTaskQrl,
  useVisibleTask,
  useVisibleTask$,
  useVisibleTaskQrl,
  type TaskCleanupFn,
  type TaskCtx,
  type TaskFn,
  type TaskOptions,
  type TaskQrlRef,
  type VisibleTaskStrategy,
  type VisibleTaskOptions,
} from './runtime/task';

export {
  createComponent,
  type ComponentOutput,
  type ComponentOptions,
  type ComponentRenderFn,
} from './component/component';
export { mergeProps } from './component/props';

export {
  Branch,
  BranchRange,
  BranchSubscription,
  SSRBranch,
  SSRBranchSubscription,
  createBranch,
  renderSsrBranch,
} from './dom/branch/branch';
export { createContentBlock, renderSsrContent } from './dom/content/content';
export {
  ForBlock,
  ForRange,
  SSRForBlock,
  createForBlock,
  renderSsrForBlock,
  type RowOutputShape,
} from './dom/for/for';
export { createCollection, renderSsrCollection } from './dom/collection/collection';
export {
  AttrEffect,
  AttrExpressionEffect,
  ForBlockSubscription,
  PropsEffect,
  createDomBatchEffect,
  createAttrEffect,
  createAttrExpressionEffect,
  createPropsEffect,
  type AttrExpressionFn,
} from './dom/effect/effect';
export { DomSubscription, type DomEffect } from './dom/effect/dom-subscription';
export {
  TextExpressionEffect,
  TextNodeEffect,
  createTextExpressionEffect,
  createTextNodeEffect,
  patchTextValue,
  readTrackedSourceValue,
  type TextExpressionFn,
  type TextExpressionValue,
} from './dom/effect/text-effect';
export {
  applyDomProps,
  renderDomPropsToString,
  patchAttrValue,
  serializeAttrExpressionValue,
  setRef,
} from './dom/effect/dom-props';
export { createCapturedEvent, setEvent } from './dom/event/event';
export { useStyles, useStyles$, useStylesScoped, useStylesScoped$ } from './runtime/use-styles';
export { useServerData } from './runtime/use-server-data';
export { getLocale, setLocale, withLocale } from './runtime/use-locale';
export {
  useOn,
  useOnDocument,
  useOnWindow,
  type UseOnEvent,
  type UseOnMap,
  type UseOnOptions,
} from './runtime/use-on';
export { createTemplate, type TemplateFactory } from './dom/template/template';
export { toNodes as _toNodes } from './utils/nodes';
export {
  EffectTargetKind,
  SsrAttrEffect,
  SsrAttrExpressionEffect,
  SsrDomSubscription,
  SSRForBlockSubscription,
  SsrPropsEffect,
  SsrTextExpressionEffect,
  SsrTextNodeEffect,
  createSsrDomBatchEffect,
  createSsrAttrEffect,
  createSsrAttrExpressionEffect,
  createSsrElementTarget,
  createSsrElementTextTarget,
  createSsrRangeTextTarget,
  createSsrPropsEffect,
  createSsrTextExpressionEffect,
  createSsrTextNodeEffect,
  renderSsrAttrExpression,
  renderSsrAttr,
  renderSsrProps,
  renderSsrTextExpression,
  renderSsrTextNode,
  type AttrExpressionQrl,
  type DomPropsQrl,
  type SsrDomEffect,
  type SsrEffectTarget,
  type TextExpressionQrl,
} from './dom/effect/ssr-effect';
export {
  _captures,
  _run,
  _visibleTask,
  _withCaptures,
  createVisibleTaskHandlerQrl,
} from './handlers';
export { _chk, _res, _val } from './runtime/bind-handlers';
export type { ServerDataContext } from './runtime/use-server-data';
export {
  createContainerContext,
  getOrCreateContainerContext,
  type ContainerContext,
  type ContainerState,
  type StateChunk,
} from './runtime/container-context';
export {
  fastNextSibling as _next,
  fastPreviousSibling as _prev,
  fastFirstChild as _first,
  fastLastChild as _last,
} from './runtime/fast-getters';
