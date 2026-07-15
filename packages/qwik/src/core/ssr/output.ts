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
  readonly element?: string;
  readonly headlessCarrier?: true;
  readonly parts: readonly SsrRecordPart[];
}

export type SsrChunk = string | SsrReferenceChunk | SsrRecordChunk;

export type SsrOutput = SsrChunk | readonly SsrOutput[];

export function createSsrRecord(...parts: readonly SsrRecordPart[]): SsrRecordChunk {
  return { type: 'record', parts };
}

export function createSsrElementRecord(
  tag: string,
  ...parts: readonly SsrRecordPart[]
): SsrRecordChunk {
  return { type: 'record', element: tag, parts };
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
