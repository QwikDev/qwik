import {
  _res,
  createQRL,
  createOwner,
  getActiveInvokeContextOrNull,
  isQrl,
  isSyncQrl,
  isSsrSubscriber,
  isPromise,
  maybeThen,
  isSsrRecordChunk,
  Owner,
  runOwnerCleanups,
  type SsrAttributePatch,
  SsrOutputWriter,
  type SerializationContext,
  type Subscriber,
  type SsrDeferredRange,
  type SsrPublicationChunk,
  type SsrCatchController,
  type RuntimeInvokeContext,
  type SsrOutput,
  type SsrReferenceChunk,
} from '@qwik.dev/core';
import { SubscriberKind, SubscriberFlags, escapeHTML, type ValueOrPromise } from './qwik-copy';
import { createSsrEventAttrParts } from './ssr-event-attr';
import { SsrScriptEmitter } from './ssr-script-emitter';
import { serializeSsrEvent } from './ssr-events';
import { injectStyles, insertAtSection, ensureDocument, splitAtSection } from './ssr-document';
import type { SsrLane } from './ssr-scheduler';

type SsrPublicationScope = object & { catchBoundary?: SsrCatchController };
type RootBoundaries = SsrCatchController | Set<SsrCatchController> | null;

interface SsrPublicationRange extends SsrDeferredRange {
  lane: SsrLane;
}

interface SsrPublicationHost {
  write(frame: string): ValueOrPromise<unknown>;
  reportError(boundary: SsrCatchController | undefined, error: unknown): void;
  throwIfFailed(): void;
  hasDeferredError(): boolean;
  takePatches(blockedBy: number | null): SsrAttributePatch[] | null;
}

export function createSsrPublication(
  serializationCtx: SerializationContext,
  scripts: SsrScriptEmitter,
  instanceHash: string,
  { write, reportError, throwIfFailed, hasDeferredError, takePatches }: SsrPublicationHost
) {
  const emittedSyncFns = new Set<string>();
  const styleIds = new SsrStyles();
  let emittedEvents: Set<string> | undefined;
  const stagedRoots = new WeakMap<object, unknown[]>();
  const ownerStyles = new WeakMap<Owner, Map<string, string>>();
  let hasOwnedStyles = false;
  let materializingBoundary: SsrCatchController | undefined;
  const eagerRoots = new WeakSet<object>();
  const selectedSubscribers = new Set<Subscriber>();
  serializationCtx.$selectedSubscribers$ = selectedSubscribers;
  let preparing:
    | {
        transaction: ReturnType<SerializationContext['$beginTransaction$']>;
        generations?: Map<SsrCatchController, number>;
        record?: SsrPublicationRange;
      }
    | undefined;
  const rememberBoundary = (boundary: SsrCatchController | undefined) => {
    if (preparing === undefined) {
      return;
    }
    while (boundary !== undefined) {
      (preparing.generations ??= new Map()).set(boundary, boundary.generation);
      boundary = boundary.parent;
    }
  };
  const addSelectedRoot = (value: unknown) => {
    if (isSsrSubscriber(value)) {
      if (value.flags & SubscriberFlags.Disposed) {
        return;
      }
      selectedSubscribers.add(value);
    }
    serializationCtx.$addRoot$(value);
  };
  const selectStyles = (owner: Owner | null) => {
    if (!hasOwnedStyles) {
      return;
    }
    const styles = owner === null ? undefined : ownerStyles.get(owner);
    if (styles === undefined) {
      return;
    }
    for (const [id, content] of styles) {
      if (!styleIds.has(id)) {
        if (serializationCtx.$journal$ === undefined) {
          styleIds.set(id, content);
        } else {
          serializationCtx.$journal$.set(styleIds, id, content);
        }
      }
    }
  };
  let bindBoundary:
    | ((value: unknown, boundary: SsrCatchController | undefined, isNew?: boolean) => void)
    | undefined;
  const enableCatch = () => {
    const rootBoundaries = new Map<unknown, RootBoundaries>();
    bindBoundary = (
      value: unknown,
      boundary: SsrCatchController | undefined,
      isNew = true
    ): void => {
      const previous = rootBoundaries.get(value);
      if (
        (previous === undefined && (boundary === undefined || !isNew)) ||
        previous === null ||
        previous === boundary
      ) {
        return;
      }
      let owners: RootBoundaries = boundary ?? null;
      if (boundary !== undefined && previous !== undefined) {
        if (previous instanceof Set) {
          if (serializationCtx.$journal$ === undefined) {
            previous.add(boundary);
          } else {
            serializationCtx.$journal$.add(previous, boundary);
          }
          return;
        }
        owners = new Set([previous, boundary]);
      }
      if (serializationCtx.$journal$ === undefined) {
        rootBoundaries.set(value, owners);
      } else {
        serializationCtx.$journal$.set(rootBoundaries, value, owners);
      }
    };
    serializationCtx.$onAddRoot$ = (_id, _root, value, isNew) => {
      bindBoundary?.(value, materializingBoundary, isNew);
    };
    serializationCtx.$onSerializeRoot$ = (id) => {
      const value = serializationCtx.$rootObjs$[id];
      const boundary = getLiveBoundary(rootBoundaries.get(value));
      if (boundary === false) {
        serializationCtx.$retireRoot$(id);
      }
      materializingBoundary = boundary === false ? undefined : boundary;
      rememberBoundary(materializingBoundary);
    };
    serializationCtx.$onSerializationError$ = (error) => {
      if (materializingBoundary !== undefined) {
        reportError(materializingBoundary, error);
      }
    };
  };
  const selectEagerResume = (value: object): void => {
    if (serializationCtx.$journal$ === undefined) {
      serializationCtx.$eagerResume$.add(value);
    } else {
      serializationCtx.$journal$.add(serializationCtx.$eagerResume$, value);
    }
    addSelectedRoot(value);
  };
  const selectPublication = (unit: SsrPublicationChunk) => {
    selectStyles(unit.owner);
    rememberBoundary(unit.boundary);
    if (unit.subscription !== undefined && !(unit.subscription.flags & SubscriberFlags.Disposed)) {
      selectedSubscribers.add(unit.subscription);
      bindBoundary?.(unit.subscription, unit.boundary);
    }
    const owned = unit.owner?.items;
    const subscribers =
      owned === null || owned === undefined ? [] : Array.isArray(owned) ? owned : [owned];
    for (let subscriberIndex = 0; subscriberIndex < subscribers.length; subscriberIndex++) {
      const subscriber = subscribers[subscriberIndex];
      if (
        subscriber instanceof Owner ||
        subscriber.flags & SubscriberFlags.Disposed ||
        ('scheduler' in subscriber && subscriber.scheduler === null)
      ) {
        continue;
      }
      selectedSubscribers.add(subscriber);
      bindBoundary?.(subscriber, unit.boundary);
      if (
        subscriber.kind === SubscriberKind.Task ||
        subscriber.kind === SubscriberKind.VisibleTask
      ) {
        addSelectedRoot(subscriber);
      }
      if (eagerRoots.has(subscriber)) {
        selectEagerResume(subscriber);
      }
    }
    for (let rootIndex = 0; rootIndex < unit.roots.length; rootIndex++) {
      const root = unit.roots[rootIndex];
      addSelectedRoot(root);
    }
  };
  const commitSubscribers = () => {
    for (const subscriber of selectedSubscribers) {
      subscriber.flags |= SubscriberFlags.Published;
    }
    selectedSubscribers.clear();
  };
  function addRoot(this: SsrPublicationScope, value: unknown): SsrReferenceChunk {
    const key = getActiveInvokeContextOrNull() ?? this;
    let roots = stagedRoots.get(key);
    if (roots === undefined) {
      stagedRoots.set(key, (roots = []));
    }
    roots.push(value);
    return { type: 'root-value', value, boundary: this.catchBoundary };
  }
  const registerSsrStyle = (id: string, content: string): void => {
    hasOwnedStyles = true;
    const context = getActiveInvokeContextOrNull();
    if (context !== null) {
      const owner = (context.owner ??= createOwner(context.ownerHost));
      let styles = ownerStyles.get(owner);
      if (styles === undefined) {
        ownerStyles.set(owner, (styles = new Map()));
      }
      styles.set(id, content);
    }
  };
  function ownOutput(
    this: SsrPublicationScope,
    output: SsrOutput,
    context: RuntimeInvokeContext,
    subscription?: Subscriber
  ): SsrOutput {
    const contextRoots = stagedRoots.get(context);
    const scopeRoots = stagedRoots.get(this);
    const roots =
      contextRoots !== undefined && scopeRoots !== undefined && contextRoots !== scopeRoots
        ? contextRoots.concat(scopeRoots)
        : (contextRoots ?? scopeRoots ?? []);
    stagedRoots.delete(context);
    stagedRoots.delete(this);
    if (
      context.owner === null &&
      roots.length === 0 &&
      (subscription === undefined || !('deps' in subscription) || subscription.deps === null)
    ) {
      return output;
    }
    return [
      {
        type: 'publication',
        owner: context.owner,
        roots,
        subscription,
        boundary: this.catchBoundary,
      },
      output,
    ];
  }
  const markEagerResume = (value: object): void => {
    eagerRoots.add(value);
    if (selectedSubscribers.has(value as Subscriber)) {
      selectEagerResume(value);
    }
  };
  const selectShellStyles = (output: SsrOutput): void => {
    if (!hasOwnedStyles) {
      return;
    }
    if (Array.isArray(output)) {
      for (let i = 0; i < output.length; i++) {
        selectShellStyles(output[i]);
      }
    } else if (typeof output === 'object' && 'type' in output && output.type === 'publication') {
      selectStyles(output.owner);
    }
  };
  const materializeValue = (
    chunk: SsrReferenceChunk | SsrPublicationChunk | { type: 'catch'; boundary: SsrCatchController }
  ): SsrOutput => {
    if (chunk.type === 'publication') {
      selectPublication(chunk);
      return '';
    }
    if (chunk.type === 'catch') {
      rememberBoundary(chunk.boundary);
      return chunk.boundary.output;
    }
    if (chunk.type === 'root-value') {
      return String(serializationCtx.$addRoot$(chunk.value));
    }
    if (chunk.type === 'event-value') {
      const serialized = serializeSsrEvent(
        serializationCtx,
        chunk.name,
        chunk.value,
        chunk.needsInvokeContext
      );
      const value =
        serialized === null
          ? ''
          : typeof serialized === 'string'
            ? serialized
            : serialized
                .map((part) => (typeof part === 'object' ? part.path.join(' ') : String(part)))
                .join('');
      return escapeHTML(value);
    }
    if (chunk.type === 'sync-fn') {
      const key = chunk.qrl.$symbol$;
      const { serialized } = chunk.qrl.resolved as { serialized: string };
      if (preparing !== undefined) {
        serializationCtx.$requireSyncFn$(key, serialized);
        return '';
      }
      if (emittedSyncFns.has(key)) {
        return '';
      }
      if (serializationCtx.$journal$ === undefined) {
        emittedSyncFns.add(key);
      } else {
        serializationCtx.$journal$.add(emittedSyncFns, key);
      }
      return scripts.emitSyncFn(key, serialized, instanceHash);
    }
    return chunk.type === 'root-ref-path' ? chunk.localPath.join(' ') : String(chunk.localId);
  };
  const materializeChunk: typeof materializeValue = (chunk) => {
    const previous = materializingBoundary;
    if ('boundary' in chunk) {
      materializingBoundary = chunk.boundary;
      if (materializingBoundary !== undefined && bindBoundary === undefined) {
        enableCatch();
      }
    }
    try {
      return materializeValue(chunk);
    } catch (error) {
      if (materializingBoundary !== undefined) {
        reportError(materializingBoundary, error);
        if (preparing === undefined) {
          return '';
        }
      }
      throw error;
    } finally {
      materializingBoundary = previous;
    }
  };
  const writeBufferedOutput = (
    output: SsrOutput,
    buffer: string[],
    cancellation?: Promise<void>
  ): ValueOrPromise<void> => {
    const fragments: string[] = [];
    let count = 0;
    return maybeThen(
      new SsrOutputWriter(
        {
          write: (chunk) => {
            fragments[count++] = chunk;
            if (count === 256) {
              buffer.push(fragments.join(''));
              count = 0;
            }
          },
        },
        undefined,
        materializeChunk
      ).finish(output, cancellation),
      () => {
        fragments.length = count;
        buffer.push(fragments.join(''));
      }
    );
  };
  const publishFrame = async (
    prepare: (
      transaction: ReturnType<SerializationContext['$beginTransaction$']>
    ) => Promise<string>,
    boundary?: SsrCatchController,
    record?: SsrPublicationRange
  ): Promise<boolean> => {
    const transaction = serializationCtx.$beginTransaction$(
      bindBoundary !== undefined || boundary !== undefined || record !== undefined
    );
    if (serializationCtx.$journal$ !== undefined) {
      scripts.checkpoint(serializationCtx.$journal$);
      styleIds.checkpoint(serializationCtx.$journal$);
    }
    const preparation: NonNullable<typeof preparing> = { transaction, record };
    preparing = preparation;
    rememberBoundary(boundary);
    let committed = false;
    const isInvalidated = () => {
      if (transaction.isCancelled || record?.cancelled) {
        return true;
      }
      if (preparation.generations !== undefined) {
        for (const [boundary, generation] of preparation.generations) {
          if (boundary.generation !== generation) {
            return true;
          }
        }
      }
      return false;
    };
    try {
      const frame = await prepare(transaction);
      if (isInvalidated()) {
        transaction.rollback();
        selectedSubscribers.clear();
        return false;
      }
      transaction.commit();
      styleIds.commit();
      committed = true;
      commitSubscribers();
      if (preparation.generations !== undefined) {
        for (const [boundary] of preparation.generations) {
          boundary.published = true;
        }
      }
      preparing = undefined;
      await write(frame);
      return true;
    } catch (error) {
      if (committed) {
        throw error;
      }
      transaction.rollback();
      selectedSubscribers.clear();
      if (hasDeferredError()) {
        throwIfFailed();
      }
      if (isInvalidated()) {
        return false;
      }
      if (boundary !== undefined) {
        reportError(boundary, error);
        throwIfFailed();
        return false;
      }
      throw error;
    } finally {
      preparing = undefined;
      materializingBoundary = undefined;
    }
  };
  const publishCatch = async (boundary: SsrCatchController): Promise<void> => {
    for (;;) {
      const published = await publishFrame(async (transaction) => {
        let output = boundary.isDocument ? ensureDocument(boundary.output) : boundary.output;
        const end = boundary.isDocument ? splitAtSection(output, '/body') : null;
        if (end !== null) {
          output = [end[0], end[2]];
        }
        collectSyncFunctions(output);
        const frame: string[] = [];
        await writeBufferedOutput(output, frame, transaction.cancelled);
        return (
          styleIds.emit(serializationCtx.$journal$) +
          takeSyncDefinitions().join('') +
          frame.join('')
        );
      }, boundary);
      if (published) {
        return;
      }
      throwIfFailed();
    }
  };
  /**
   * Cross-module `sync$` resolves through a chunk, so the compiler cannot place its definition; the
   * container emits it ahead of the batch whose rendering discovered it.
   */
  const placedSyncFunctions = (output: SsrOutput, placed: Set<string>): void => {
    if (Array.isArray(output)) {
      for (let childIndex = 0; childIndex < output.length; childIndex++) {
        const child = output[childIndex];
        placedSyncFunctions(child, placed);
      }
    } else if (typeof output === 'object' && 'type' in output && output.type === 'sync-fn') {
      placed.add(output.qrl.$symbol$);
    } else if (typeof output === 'object' && 'type' in output && output.type === 'catch') {
      if (preparing !== undefined) {
        rememberBoundary(output.boundary);
        placedSyncFunctions(output.boundary.output, placed);
      }
    }
  };
  const discoverSyncFunctions = (output: SsrOutput, placed: ReadonlySet<string>): void => {
    if (Array.isArray(output)) {
      for (let childIndex = 0; childIndex < output.length; childIndex++) {
        const child = output[childIndex];
        discoverSyncFunctions(child, placed);
      }
    } else if (typeof output === 'object' && !isPromise(output)) {
      if ('type' in output && output.type === 'catch') {
        if (preparing !== undefined) {
          discoverSyncFunctions(output.boundary.output, placed);
        }
      } else if (isSsrRecordChunk(output)) {
        for (let partIndex = 0; partIndex < output.parts.length; partIndex++) {
          const part = output.parts[partIndex];
          if (typeof part !== 'object') {
            continue;
          }
          if (part.type === 'event-attr') {
            for (let valueIndex = 0; valueIndex < part.valueParts.length; valueIndex++) {
              const value = part.valueParts[valueIndex];
              discoverSyncFunctions(value, placed);
            }
          } else {
            discoverSyncFunctions(part, placed);
          }
        }
      } else if ('type' in output && output.type === 'event-value') {
        requireSyncQrls(serializationCtx, output.value, placed);
      }
    }
  };
  const collectSyncFunctions = (output: SsrOutput): void => {
    const placed = new Set<string>();
    placedSyncFunctions(output, placed);
    discoverSyncFunctions(output, placed);
  };
  const takeSyncDefinitions = (): string[] => {
    const pending = serializationCtx.$pendingSyncFns$;
    const defs: string[] = [];
    const journal = serializationCtx.$journal$;
    for (const [key, source] of pending) {
      if (!emittedSyncFns.has(key)) {
        if (journal === undefined) {
          emittedSyncFns.add(key);
        } else {
          journal.add(emittedSyncFns, key);
        }
        defs.push(scripts.emitSyncFn(key, source, instanceHash));
      }
      if (journal === undefined) {
        pending.delete(key);
      } else {
        journal.delete(pending, key);
      }
    }
    return defs;
  };

  const writeShellState = async (): Promise<void> => {
    while (
      !(await publishFrame(async (transaction) => {
        const eventAttrs = createStateScriptEventAttrs(serializationCtx);
        const state = await serializationCtx.$serializeNext$();
        const frame = takeSyncDefinitions();
        if (state !== null) {
          await writeBufferedOutput(
            scripts.emitStateRange(state, undefined, undefined, eventAttrs),
            frame,
            transaction.cancelled
          );
        }
        return frame.join('');
      }))
    ) {
      throwIfFailed();
    }
  };
  const publishRange = (record: SsrPublicationRange): Promise<boolean> => {
    const boundary = (record.contentRoot as { content?: { container?: SsrPublicationScope } })
      ?.content?.container?.catchBoundary;
    return publishFrame(
      async (transaction) => {
        const contentOwner = getContentOwner(record.contentRoot);
        if (contentOwner !== null) {
          await transaction.waitFor(runOwnerCleanups(contentOwner, getDeferredContentOwner));
        }
        const html: string[] = [];
        addSelectedRoot(record.contentRoot);
        collectSyncFunctions(record.output!);
        await writeBufferedOutput(record.output!, html, transaction.cancelled);
        if (transaction.isCancelled) {
          throw new Error('Serialization cancelled');
        }
        const subscriptions = collectDeferredSubscriptions(
          serializationCtx,
          selectedSubscribers,
          serializationCtx.$rootStateRootCount$
        );
        const eventAttrs = createStateScriptEventAttrs(serializationCtx, selectedSubscribers);
        const state = await serializationCtx.$serializeNext$();
        throwIfFailed();
        const packet: SsrOutput[] = takeSyncDefinitions();
        if (state !== null) {
          packet.push(scripts.emitStateRange(state, record.id, subscriptions, eventAttrs));
        }
        packet.push(styleIds.emit(serializationCtx.$journal$));
        packet.push(
          scripts.emitQwikEvents(
            takeNewValues(
              serializationCtx.$eventNames$,
              (emittedEvents ??= new Set()),
              serializationCtx.$journal$
            )
          )
        );
        packet.push(
          scripts.emitResolved(
            record.id,
            html.join(''),
            true,
            serializationCtx.$hasRootId$(record.contentRoot),
            record.placeholderRoot === undefined
              ? undefined
              : serializationCtx.$hasRootId$(record.placeholderRoot)
          )
        );
        const patches = takePatches(record.lane.id);
        if (patches !== null) {
          packet.push(scripts.emitBackpatch(patches));
        }
        const frame: string[] = [];
        await writeBufferedOutput(packet, frame);
        return frame.join('');
      },
      boundary,
      record
    );
  };

  return {
    styleIds,
    addRoot,
    ownOutput,
    registerSsrStyle,
    markEagerResume,
    selectShellStyles,
    commitSubscribers,
    materializeChunk,
    publishCatch,
    publishRange,
    publishShellState(): ValueOrPromise<void> {
      return serializationCtx.$roots$.length === 0 ? undefined : writeShellState();
    },
    markShellEventsEmitted() {
      emittedEvents = new Set(serializationCtx.$eventNames$);
    },
    prepareShellOutput(output: SsrOutput): SsrOutput {
      collectSyncFunctions(output);
      const defs = takeSyncDefinitions();
      return defs.length === 0 ? output : insertAtSection(output, 'head', defs, 'after');
    },
    injectStyles(output: SsrOutput, isDocument: boolean): SsrOutput {
      const styled = injectStyles(output, styleIds, isDocument);
      styleIds.markInjected();
      return styled;
    },
    emitStyles(): string {
      return styleIds.emit(serializationCtx.$journal$);
    },
    cancelScope(boundary: SsrCatchController | undefined): void {
      if (
        preparing !== undefined &&
        (preparing.record?.lane.isCancelled ||
          (boundary !== undefined && preparing.generations?.has(boundary)))
      ) {
        preparing.transaction.cancel();
      }
    },
    cancel() {
      preparing?.transaction.cancel();
    },
  };
}

function findSharedBoundary(
  previous: SsrCatchController,
  boundary: SsrCatchController
): SsrCatchController | undefined {
  let first: SsrCatchController | undefined = previous;
  let second: SsrCatchController | undefined = boundary;
  while (first !== second) {
    first = first === undefined ? boundary : first.parent;
    second = second === undefined ? previous : second.parent;
  }
  return first;
}

function getLiveBoundary(
  owners: RootBoundaries | undefined
): SsrCatchController | undefined | false {
  if (!(owners instanceof Set)) {
    return owners == null ? undefined : owners.generation === 0 ? owners : false;
  }
  let boundary: SsrCatchController | undefined;
  for (const owner of owners) {
    if (owner.generation !== 0) {
      continue;
    }
    boundary = boundary === undefined ? owner : findSharedBoundary(owner, boundary);
    if (boundary === undefined) {
      return undefined;
    }
  }
  return boundary ?? false;
}

function collectDeferredSubscriptions(
  serializationCtx: SerializationContext,
  subscribers: ReadonlySet<Subscriber>,
  serializedRootCount: number
): number[] {
  const subscriptions: number[] = [];
  for (const subscriber of subscribers) {
    const subscriberId = serializationCtx.$hasRootId$(subscriber);
    if (
      (subscriberId !== undefined && subscriberId < serializedRootCount) ||
      subscriber.kind === SubscriberKind.Idle ||
      subscriber.deps === null
    ) {
      continue;
    }
    let sourceIds: number[] | null = null;
    for (let i = 0; i < subscriber.deps.length; i++) {
      const source = subscriber.deps[i];
      if (wasSerializedBefore(serializationCtx, source, serializedRootCount)) {
        (sourceIds ??= []).push(serializationCtx.$addRoot$(source));
      }
    }
    if (sourceIds === null) {
      continue;
    }
    const addedSubscriberId = serializationCtx.$addRoot$(subscriber);
    for (let i = 0; i < sourceIds.length; i++) {
      subscriptions.push(sourceIds[i], addedSubscriberId);
    }
  }
  return subscriptions;
}

function wasSerializedBefore(
  serializationCtx: SerializationContext,
  value: unknown,
  serializedRootCount: number
): boolean {
  let ref = serializationCtx.getSeenRef(value);
  if (ref === undefined) {
    return false;
  }
  while (ref.$parent$) {
    ref = ref.$parent$;
  }
  return ref.$index$ < serializedRootCount;
}

export function createStateScriptEventAttrs(
  serializationCtx: SerializationContext,
  selected?: ReadonlySet<Subscriber>
): readonly (string | SsrReferenceChunk)[] | undefined {
  const eagerResume: unknown[] = [];
  for (const value of selected ?? serializationCtx.$eagerResume$) {
    const subscriber = value as Subscriber;
    if (
      subscriber.flags & SubscriberFlags.Disposed ||
      (selected !== undefined &&
        (!serializationCtx.$eagerResume$.has(subscriber) ||
          wasSerializedBefore(serializationCtx, subscriber, serializationCtx.$rootStateRootCount$)))
    ) {
      continue;
    }
    eagerResume.push(value);
  }
  if (eagerResume.length === 0) {
    return undefined;
  }
  const serialized = serializeSsrEvent(
    serializationCtx,
    'q-d:qidle',
    createQRL(null, '_res', _res, null, eagerResume),
    false
  );
  return serialized === null
    ? undefined
    : createSsrEventAttrParts(selected === undefined ? 'q-d:qidle' : 'q:idle', serialized);
}

class SsrStyles extends Map<string, string> {
  private pending: string[] | undefined;
  private emitted = 0;
  private readonly published = new Set<string>();

  override set(id: string, content: string): this {
    if (!this.has(id)) {
      (this.pending ??= []).push(id);
    }
    return super.set(id, content);
  }

  checkpoint(journal: NonNullable<SerializationContext['$journal$']>): void {
    const pending = this.pending;
    const length = pending?.length ?? 0;
    const emitted = this.emitted;
    journal.record(() => {
      this.pending = pending;
      if (pending !== undefined) {
        pending.length = length;
      }
      this.emitted = emitted;
    });
  }

  markInjected(): void {
    const pending = this.pending;
    for (let index = 0; index < (pending?.length ?? 0); index++) {
      const id = pending![index];
      if (this.has(id)) {
        this.published.add(id);
      }
    }
    this.clearPending();
  }

  private clearPending(): void {
    this.pending = undefined;
    this.emitted = 0;
  }

  commit(): void {
    if (this.emitted === this.pending?.length) {
      this.clearPending();
    }
  }

  emit(journal?: SerializationContext['$journal$']): string {
    const pending = this.pending;
    if (pending === undefined) {
      return '';
    }
    let html = '';
    for (; this.emitted < pending.length; this.emitted++) {
      const id = pending[this.emitted];
      const content = this.get(id);
      if (content !== undefined && !this.published.has(id)) {
        if (journal === undefined) {
          this.published.add(id);
        } else {
          journal.add(this.published, id);
        }
        html += `<style q:style="${escapeHTML(id)}">${content}</style>`;
      }
    }
    if (journal === undefined) {
      this.clearPending();
    }
    return html;
  }
}

function requireSyncQrls(
  serializationCtx: SerializationContext,
  value: unknown,
  placed: ReadonlySet<string>
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      requireSyncQrls(serializationCtx, value[index], placed);
    }
  } else if (isQrl(value) && isSyncQrl(value) && !placed.has(value.$symbol$)) {
    const fn = value.resolved as Function & { serialized?: string };
    serializationCtx.$requireSyncFn$(value.$symbol$, fn.serialized ?? fn.toString());
  }
}

export function getContentOwner(contentRoot: unknown): Owner | null {
  const content = (
    contentRoot as { content?: { currentOwner: Owner | null; pendingOwner?: Owner | null } }
  )?.content;
  return content?.currentOwner ?? content?.pendingOwner ?? null;
}

export function getDeferredContentOwner(subscriber: Subscriber): Owner | null {
  return subscriber.flags & SubscriberFlags.Deferred ? getContentOwner(subscriber) : null;
}

function takeNewValues(
  values: ReadonlySet<string>,
  emitted: Set<string>,
  journal?: SerializationContext['$journal$']
): Set<string> {
  const added = new Set<string>();
  for (const value of values) {
    if (!emitted.has(value)) {
      if (journal === undefined) {
        emitted.add(value);
      } else {
        journal.add(emitted, value);
      }
      added.add(value);
    }
  }
  return added;
}
