import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';

export type SsrReferenceChunk =
  | { readonly type: 'node-id'; readonly localId: number | string }
  | { readonly type: 'root-ref'; readonly localId: number }
  | { readonly type: 'root-ref-path'; readonly localPath: readonly number[] };

export interface SsrEventAttrChunk {
  readonly type: 'event-attr';
  readonly name: string;
  readonly valueParts: readonly (string | SsrReferenceChunk)[];
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

export type SsrChunk = string | SsrReferenceChunk | SsrRecordChunk;

export type SsrResolvedOutput = SsrChunk | readonly SsrOutput[];
export type SsrOutput = SsrResolvedOutput | Promise<SsrResolvedOutput>;

/** Suspense needs the whole subtree settled before it can reveal its content. */
export function resolveSsrOutput(output: SsrOutput): ValueOrPromise<SsrResolvedOutput> {
  if (isPromise(output)) {
    return output.then(resolveSsrOutput);
  }
  if (!Array.isArray(output)) {
    return output as SsrChunk;
  }
  const children = output.map(resolveSsrOutput);
  return children.some(isPromise) ? Promise.all(children) : output;
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
export function _createSsrSlotMarker(rangeId: number, projectionRootId?: number): SsrOutput[] {
  return projectionRootId === undefined
    ? ['<!s=', createSsrNodeId(rangeId), '>']
    : ['<!s=', createSsrNodeId(rangeId), ',', createSsrRootRef(projectionRootId), '>'];
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

export function isSsrEventAttrChunk(value: SsrRecordPart): value is SsrEventAttrChunk {
  return typeof value === 'object' && value.type === 'event-attr';
}
