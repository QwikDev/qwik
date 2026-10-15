import { isPromise, maybeThen } from '../shared/utils/promises';
import type { Subscriber } from '../runtime/subscriber';
import type { Owner } from '../runtime/owner';
import type { SerializationContext } from '../shared/serdes/serialization-context';
import type { TaskScheduler } from '../runtime/scheduler';
import type { ServerDataContext } from '../runtime/use-server-data';
import type { RuntimeInvokeContext } from '../runtime/invoke-context';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { ValueOrPromise } from '../shared/utils/types';

export interface SsrContentContext extends ServerDataContext {
  readonly element?: never;
  readonly document?: never;
  readonly state?: never;
  readonly locale?: never;
  scheduler: TaskScheduler;
  styleIds?: Map<string, string>;
  serializationCtx?: SerializationContext;
  markEagerResume?(value: object): void;
  registerSsrStyle?(id: string, content: string): void;
  eventAttr?(name: string, value: unknown): SsrEventAttrChunk;
  ownOutput?(
    output: SsrOutput,
    context: RuntimeInvokeContext,
    subscription?: Subscriber
  ): SsrOutput;
}

/** Shared services for streaming content ranges. */
export interface SsrRangeHost extends SsrContentContext {
  nextId(): number;
  addRoot(value: unknown): SsrReferenceChunk;
  catchBoundary?: SsrCatchController;
  /** Wraps content in a range's document markers. */
  wrapRange(rangeId: number, content: SsrOutput): SsrOutput;
  /** A child scope: its work runs on its own lane and its ranges nest under `rangeId`. */
  createRangeScope(rangeId: number): SsrRangeScope;
  /** False under in-order rendering: the owner must await its content instead of deferring. */
  canDefer: boolean;
}

export interface SsrRangeScope extends SsrRangeHost {
  /** Runs the work queued on this scope's lane. */
  flush(): ValueOrPromise<void>;
  /** Streams `range.output` in a later packet; the caller returns placeholder markup now. */
  defer(range: SsrDeferredRange, content: Promise<SsrOutput>): void;
  /** Lifts ranges nested in this scope up to its parent, for a scope that never defers. */
  reparentRanges(): void;
  cancel?(): void;
}

export type SsrReferenceChunk =
  | { readonly type: 'node-id'; readonly localId: number | string }
  | { readonly type: 'root-ref'; readonly localId: number }
  | { readonly type: 'root-value'; readonly value: unknown; readonly boundary?: SsrCatchController }
  | {
      readonly type: 'event-value';
      readonly name: string;
      readonly value: unknown;
      readonly needsInvokeContext: boolean;
      readonly boundary?: SsrCatchController;
    }
  | { readonly type: 'sync-fn'; readonly qrl: QRLInternal }
  | { readonly type: 'root-ref-path'; readonly localPath: readonly number[] };

export interface SsrEventAttrChunk {
  readonly type: 'event-attr';
  readonly name: string;
  readonly valueParts: readonly (string | SsrReferenceChunk)[];
  readonly errorRoot?: SsrReferenceChunk;
}

export type SsrRecordPart = string | SsrReferenceChunk | SsrEventAttrChunk;

/** A document tag the runtime inserts around; marking it spares the runtime a text search. */
export type SsrSection = 'head' | '/head' | 'body' | '/body';

export interface SsrRecordChunk {
  readonly type: 'record';
  /** Open tags may still receive attributes after the render returns (`useOn$`). */
  readonly openTag: boolean;
  readonly headlessCarrier: boolean;
  readonly section?: SsrSection;
  readonly parts: readonly SsrRecordPart[];
}

export interface SsrPublicationChunk {
  readonly type: 'publication';
  readonly owner: Owner | null;
  readonly roots: readonly unknown[];
  readonly subscription?: Subscriber;
  readonly boundary?: SsrCatchController;
}

export interface SsrCatchController {
  owner?: Owner | null;
  generation: number;
  published: boolean;
  isDocument?: boolean;
  output: SsrOutput;
  reapplyUseOn?: (output: SsrOutput) => SsrOutput;
  readonly parent?: SsrCatchController;
  catchError(error: unknown): ValueOrPromise<void>;
}

export interface SsrCatchChunk {
  readonly type: 'catch';
  readonly boundary: SsrCatchController;
}

export type SsrChunk =
  | string
  | SsrReferenceChunk
  | SsrRecordChunk
  | SsrEventAttrChunk
  | SsrPublicationChunk
  | SsrCatchChunk;

export function ownSsrOutput(
  output: SsrOutput,
  context: RuntimeInvokeContext,
  subscription?: Subscriber
): SsrOutput {
  const container = context.container as SsrContentContext | undefined;
  return container?.ownOutput?.(output, context, subscription) ?? output;
}

export type SsrResolvedOutput = SsrChunk | readonly SsrOutput[];
export type SsrOutput = SsrResolvedOutput | Promise<SsrResolvedOutput>;

/** Pending resolves ordinary async output before revealing its content. */
export function resolveSsrOutput(
  output: SsrOutput,
  observe?: typeof maybeThen
): ValueOrPromise<SsrResolvedOutput> {
  if (isPromise(output)) {
    return resolveSsrPromise(output, observe);
  }
  if (!Array.isArray(output)) {
    return output as SsrChunk;
  }
  let children: SsrOutput[] | undefined;
  for (let index = 0; index < output.length; index++) {
    const resolved = resolveSsrOutput(output[index], observe);
    if (resolved !== output[index]) {
      children ??= output.slice(0, index);
    }
    children?.push(resolved);
  }
  return children === undefined
    ? output
    : children.some(isPromise)
      ? Promise.all(children)
      : (children as SsrResolvedOutput);
}

function resolveSsrPromise(
  output: Promise<SsrResolvedOutput>,
  observe: typeof maybeThen | undefined
): ValueOrPromise<SsrResolvedOutput> {
  return (observe ?? maybeThen)(output, (resolved) => resolveSsrOutput(resolved, observe));
}

/**
 * A range whose content is not ready when the shell streams. The engine emits its swap packet once
 * the content settles, its parent range is out, and the owner's own gate allows it. The engine
 * knows nothing about why a range defers — that belongs to whoever created it.
 */
export interface SsrDeferredRange {
  readonly id: number;
  /** Reassigned when an ancestor resolves inline, so its markers never reach the document. */
  parentId: number | null;
  /** Set by the owner once the content is ready to swap in. */
  output?: SsrOutput;
  /** Serialized roots riding the packet: the content's, and the placeholder's to dispose. */
  contentRoot: unknown;
  placeholderRoot?: unknown;
  cancelled?: true;
  /** Owner-supplied ordering gate; the engine separately requires the parent range to be out. */
  canEmit?(): boolean;
  onEmitted?(): void;
  onCancelled?(): void;
}

export function createSsrMarkup(...parts: readonly (SsrRecordPart | null)[]): SsrRecordChunk {
  return {
    type: 'record',
    openTag: false,
    headlessCarrier: false,
    parts: parts.filter((part) => part !== null),
  };
}

export function createSsrOpenTag(...parts: readonly SsrRecordPart[]): SsrRecordChunk {
  return { type: 'record', openTag: true, headlessCarrier: false, parts };
}

export function createSsrSection(
  section: SsrSection,
  ...parts: readonly SsrRecordPart[]
): SsrRecordChunk {
  return { type: 'record', openTag: section[0] !== '/', headlessCarrier: false, section, parts };
}

export function createSsrEventAttr(
  name: string,
  valueParts: readonly (string | SsrReferenceChunk)[]
): SsrEventAttrChunk {
  return { type: 'event-attr', name, valueParts };
}

/** A row marker may carry its key beside the id (`r=<id>,<key>`), so the id is text there. */
export function createSsrNodeId(localId: number | string): SsrReferenceChunk {
  return { type: 'node-id', localId };
}

/** @internal */
export function _createSsrSlotMarker(
  rangeId: number,
  projectionRootId?: SsrReferenceChunk
): SsrOutput[] {
  return projectionRootId === undefined
    ? ['<!s=', createSsrNodeId(rangeId), '>']
    : ['<!s=', createSsrNodeId(rangeId), ',', projectionRootId, '>'];
}

export function createSsrRootRef(localId: number): SsrReferenceChunk {
  return { type: 'root-ref', localId };
}

export function createSsrRootRefPath(localPath: readonly number[]): SsrReferenceChunk {
  return { type: 'root-ref-path', localPath };
}

export function isSsrRecordChunk(value: SsrOutput): value is SsrRecordChunk {
  return (
    !Array.isArray(value) &&
    typeof value === 'object' &&
    (value as SsrRecordChunk).type === 'record'
  );
}

export function isSsrEventAttrChunk(value: SsrOutput | SsrRecordPart): value is SsrEventAttrChunk {
  return typeof value === 'object' && (value as SsrEventAttrChunk).type === 'event-attr';
}
