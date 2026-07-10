export { ComputedFlags, OwnerFlags, SubscriberFlags } from './reactive/flags';
export { escapeHTML } from '../shared/utils/character-escaping';
export { maybeThen, promiseAll } from '../shared/utils/promises';
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
  useSignal,
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
export { Signal } from './reactive/signal';
export {
  Computed,
  markComputedDirty,
  readComputed,
  readComputedUntracked,
} from './reactive/computed';
export { ComputedQrl, type ComputedQrlFn, type ComputedQrlRef } from './reactive/computed-qrl';
export { AsyncSignal, type AsyncSignalFn, type AsyncSignalQrl } from './reactive/async-signal';
export { SerializerSignal, type SerializerSignalQrl } from './reactive/serializer-signal';
export type { AsyncCtx, AsyncSignalOptions } from '../reactive-primitives/types';
export { useStore, type Store } from './reactive/store';
export { createId } from './use-id';

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
export { useContext, useContextProvider, type ContextId, type UseContext } from './runtime/context';
export {
  Phase,
  Scheduler,
  createScheduler,
  defaultScheduler,
  notifyPhaseSubscriber,
  scheduleFlush,
  type ScheduleFlush,
} from './runtime/scheduler';
export { runTaskSubscriber } from './runtime/run-task';
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
export { ForBlock, ForRange, SSRForBlock, createForBlock, renderSsrForBlock } from './dom/for/for';
export {
  AttrEffect,
  AttrExpressionEffect,
  DomSubscription,
  ForBlockSubscription,
  PropsEffect,
  TextExpressionEffect,
  TextNodeEffect,
  createDomBatchEffect,
  createAttrEffect,
  createAttrExpressionEffect,
  createPropsEffect,
  createTextExpressionEffect,
  createTextNodeEffect,
  patchTextValue,
  readTrackedSourceValue,
  runDomBatchEffect,
  type AttrExpressionFn,
  type DomEffect,
  type TextExpressionFn,
  type TextExpressionValue,
} from './dom/effect/effect';
export {
  applyDomProps,
  renderDomPropsToString,
  patchAttrValue,
  serializeAttrExpressionValue,
} from './dom/effect/dom-props';
export { createCapturedEvent, setEvent } from './dom/event/event';
export {
  createOn,
  createOnDocument,
  createOnWindow,
  recordUseOnEvent,
  type OnHandler,
  type UseOnEvent,
  type UseOnMap,
} from './runtime/use-on';
export { appendScopedStyle, appendStyle } from './runtime/use-styles';
export { createTemplate, type TemplateFactory } from './dom/template/template';
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
export { _qrlWithChunk } from '../shared/qrl/qrl';
export {
  _captures,
  _run,
  _visibleTask,
  _withCaptures,
  createVisibleTaskHandlerQrl,
} from '../../spark/handlers';
export { _res } from '../shared/jsx/bind-handlers';
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
