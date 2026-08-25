export type SsrReferenceChunk =
  | { readonly type: 'node-id'; readonly localId: number }
  | { readonly type: 'root-ref'; readonly localId: number }
  | { readonly type: 'root-ref-path'; readonly localPath: readonly number[] };

export interface SsrEventAttrChunk {
  readonly type: 'event-attr';
  readonly name: string;
  readonly valueParts: readonly (string | SsrReferenceChunk)[];
}

export type SsrRecordPart = string | SsrReferenceChunk | SsrEventAttrChunk;

export interface SsrRecordChunk {
  readonly type: 'record';
  /** Open tags may still receive attributes after the render returns (`useOn$`). */
  readonly openTag: boolean;
  readonly headlessCarrier: boolean;
  readonly parts: readonly SsrRecordPart[];
}

export type SsrChunk = string | SsrReferenceChunk | SsrRecordChunk;

export type SsrOutput = SsrChunk | readonly SsrOutput[];

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

export function createSsrMarkup(...parts: readonly SsrRecordPart[]): SsrRecordChunk {
  return { type: 'record', openTag: false, headlessCarrier: false, parts };
}

export function createSsrOpenTag(...parts: readonly SsrRecordPart[]): SsrRecordChunk {
  return { type: 'record', openTag: true, headlessCarrier: false, parts };
}

export function createSsrEventAttr(
  name: string,
  valueParts: readonly (string | SsrReferenceChunk)[]
): SsrEventAttrChunk {
  return { type: 'event-attr', name, valueParts };
}

export function createSsrNodeId(localId: number): SsrReferenceChunk {
  return { type: 'node-id', localId };
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
