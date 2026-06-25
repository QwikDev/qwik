export { ComputedFlags, OwnerFlags, SubscriberFlags } from './reactive/flags';
export { escapeHTML } from '../shared/utils/character-escaping';
export {
  isComputedSource,
  peekSourceValue,
  readSourceValue,
  type ComputedSource,
  type Dependency,
  type Source,
} from './reactive/source';
export { cleanupDeps, disposeSubscriber, disposeSubscribers } from './reactive/cleanup';
export {
  addDependency,
  getActiveCollector,
  runWithCollector,
  track,
  untrack,
} from './reactive/tracking';
export { createSignal, Signal } from './reactive/signal';
export {
  Computed,
  createComputed,
  markComputedDirty,
  readComputed,
  readComputedUntracked,
} from './reactive/computed';
export {
  ComputedQrl,
  createComputedQrl,
  createComputed$,
  type ComputedQrlFn,
  type ComputedQrlRef,
} from './reactive/computed-qrl';
export { createStore, type Store } from './reactive/store';

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
  type SlotScope,
} from './runtime/invoke-context';
export { ContextScope, createContextScope, isContextScope } from './runtime/context-scope';
export {
  createContext,
  createContextProvider,
  type ContextId,
  type CreateContext,
} from './runtime/context';
export {
  Phase,
  Scheduler,
  createScheduler,
  defaultScheduler,
  notifyPhaseSubscriber,
  scheduleFlush,
  type ScheduleFlush,
} from './runtime/scheduler';
export {
  Task,
  TaskSubscription,
  VisibleTask,
  VisibleTaskSubscription,
  createTask,
  createTaskQrl,
  createVisibleTask,
  createVisibleTaskQrl,
  type TaskFn,
  type TaskOptions,
  type TaskQrlRef,
  type VisibleTaskOptions,
} from './runtime/task';

export {
  createComponent,
  type ComponentOutput,
  type ComponentOptions,
  type ComponentRenderFn,
  type ComponentRenderOutput,
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
  AttrSerializer,
  AttrEffect,
  AttrExpressionEffect,
  DomSubscription,
  ForBlockSubscription,
  PropsEffect,
  SerializedAttrEffect,
  TextExpressionEffect,
  TextNodeEffect,
  createDomBatchEffect,
  createAttrEffect,
  createAttrExpressionEffect,
  createClassEffect,
  createPropsEffect,
  createStyleEffect,
  createTextExpressionEffect,
  createTextNodeEffect,
  patchAttrValue,
  patchTextValue,
  readTrackedSourceValue,
  runDomBatchEffect,
  serializeAttrExpressionValue,
  type AttrExpressionFn,
  type DomEffect,
  type DomEffectOptions,
  type TextExpressionFn,
  type TextExpressionValue,
} from './dom/effect/effect';
export { applyDomProps, normalizeDomProps, renderDomPropsToString } from './dom/effect/dom-props';
export { createCapturedEvent, setEvent } from './dom/event/event';
export { createTemplate, type TemplateFactory } from './dom/template/template';
export {
  EffectTargetKind,
  SsrAttrEffect,
  SsrAttrExpressionEffect,
  SsrDomSubscription,
  SSRForBlockSubscription,
  SsrPropsEffect,
  SsrSerializedAttrEffect,
  SsrTextExpressionEffect,
  SsrTextNodeEffect,
  createSsrDomBatchEffect,
  createSsrAttrEffect,
  createSsrAttrExpressionEffect,
  createSsrElementTarget,
  createSsrElementTextTarget,
  createSsrRangeTextTarget,
  createSsrPropsEffect,
  createSsrSerializedAttrEffect,
  createSsrTextExpressionEffect,
  createSsrTextNodeEffect,
  renderSsrAttrExpression,
  renderSsrAttr,
  renderSsrClass,
  renderSsrProps,
  renderSsrStyle,
  renderSsrTextExpression,
  renderSsrTextNode,
  type AttrExpressionQrl,
  type DomPropsQrl,
  type SsrDomEffect,
  type SsrEffectTarget,
  type TextExpressionQrl,
} from './dom/effect/ssr-effect';
export { _qrlWithChunk } from '../shared/qrl/qrl';
export { _captures, _run, _withCaptures } from '../../spark/handlers';
export {
  createContainerContext,
  getOrCreateContainerContext,
  type ContainerContext,
  type ContainerState,
  type StateChunk,
} from './runtime/container-context';
