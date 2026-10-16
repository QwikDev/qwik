import { isDev } from '@qwik.dev/core/build';
import type { StreamWriter } from '../shared/utils/stream-writer';
import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import {
  isSsrRecordChunk,
  isSsrEventAttrChunk,
  type SsrOutput,
  type SsrChunk,
  type SsrPublicationChunk,
  type SsrCatchChunk,
  type SsrCatchController,
  type SsrResolvedOutput,
  type SsrRecordChunk,
  type SsrReferenceChunk,
} from './output';

type WriteBoundary = (boundary: SsrCatchController) => ValueOrPromise<void>;

type ResolveChunk = (chunk: SsrReferenceChunk | SsrPublicationChunk | SsrCatchChunk) => SsrOutput;

interface OutputOperation {
  sink?: Pick<StreamWriter, 'write'>;
  writeResolved?: (output: SsrResolvedOutput) => ValueOrPromise<void>;
  resolveChunk?: ResolveChunk;
  writeBoundary?: WriteBoundary;
  current?: SsrOutput;
  stack: Array<readonly SsrOutput[]>;
  indices: number[];
  /** Synchronous html waiting for one sink write; every sink write costs a web-stream hop. */
  buffered: string[];
}

/** Writes structured SSR output to one sink in document order, one sink write per async boundary. */
export class SsrOutputWriter {
  constructor(
    private readonly sink: Pick<StreamWriter, 'write'>,
    private readonly writeResolved?: (output: SsrResolvedOutput) => ValueOrPromise<void>,
    private readonly resolveChunk?: ResolveChunk,
    private readonly writeBoundary?: WriteBoundary
  ) {}

  finish(output: SsrOutput, cancellation?: Promise<void>): ValueOrPromise<void> {
    const operation: OutputOperation = {
      sink: this.sink,
      writeResolved: this.writeResolved,
      resolveChunk: this.resolveChunk,
      writeBoundary: this.writeBoundary,
      current: output,
      stack: [],
      indices: [],
      buffered: [],
    };
    const result = drainOutput(operation);
    if (!isPromise(result)) {
      detachOutput(operation);
      return;
    }
    const pending =
      cancellation === undefined
        ? result
        : Promise.race([result, cancellation.then(() => detachOutput(operation))]);
    return pending.finally(() => detachOutput(operation));
  }
}

function detachOutput(operation: OutputOperation): void {
  operation.current = undefined;
  operation.sink =
    operation.resolveChunk =
    operation.writeResolved =
    operation.writeBoundary =
      undefined;
  operation.stack.length = operation.indices.length = operation.buffered.length = 0;
}

function flushOutput(operation: OutputOperation): ValueOrPromise<void> {
  const buffered = operation.buffered;
  if (buffered.length === 0 || operation.sink === undefined) {
    return;
  }
  const html = buffered.length === 1 ? buffered[0] : buffered.join('');
  buffered.length = 0;
  return operation.sink.write(html);
}

/** Flushes before an async step; a pending flush re-drains with the step as the next output. */
function flushBefore(operation: OutputOperation, output: SsrOutput): Promise<void> | undefined {
  const flushed = flushOutput(operation);
  if (!isPromise(flushed)) {
    return;
  }
  operation.current = output;
  return flushed.then(() => drainOutput(operation));
}

function resumeOutput(operation: OutputOperation, output: SsrResolvedOutput): ValueOrPromise<void> {
  if (operation.sink === undefined) {
    return;
  }
  if (operation.writeResolved !== undefined) {
    const result = operation.writeResolved(output);
    return isPromise(result) ? result.then(() => drainOutput(operation)) : drainOutput(operation);
  }
  operation.current = output;
  return drainOutput(operation);
}

function drainOutput(operation: OutputOperation): ValueOrPromise<void> {
  while (operation.sink !== undefined) {
    let output = operation.current;
    operation.current = undefined;
    if (output === undefined) {
      const stack = operation.stack;
      const indices = operation.indices;
      while (stack.length > 0 && indices[stack.length - 1] === stack[stack.length - 1].length) {
        stack.pop();
        indices.pop();
      }
      if (stack.length === 0) {
        return flushOutput(operation);
      }
      const depth = stack.length - 1;
      output = stack[depth][indices[depth]++];
    }
    if (isPromise(output)) {
      return (
        flushBefore(operation, output) ?? output.then((output) => resumeOutput(operation, output))
      );
    }
    if (Array.isArray(output)) {
      operation.stack.push(output);
      operation.indices.push(0);
      continue;
    }
    if (typeof output === 'object' && !isSsrRecordChunk(output)) {
      const chunk = output as Exclude<SsrChunk, string | SsrRecordChunk>;
      if (chunk.type === 'catch' && operation.writeBoundary !== undefined) {
        const pendingFlush = flushBefore(operation, output);
        if (pendingFlush !== undefined) {
          return pendingFlush;
        }
        const result = operation.writeBoundary(chunk.boundary);
        if (isPromise(result)) {
          return result.then(() => drainOutput(operation));
        }
        continue;
      }
      if (
        chunk.type === 'publication' ||
        chunk.type === 'catch' ||
        chunk.type === 'root-value' ||
        chunk.type === 'event-value' ||
        chunk.type === 'sync-fn'
      ) {
        if (operation.resolveChunk === undefined) {
          throw new Error('Missing SSR publication writer');
        }
        operation.current = operation.resolveChunk(chunk);
        continue;
      }
    }
    const html =
      typeof output === 'string'
        ? output
        : isSsrRecordChunk(output)
          ? materializeRecord(output, operation.resolveChunk)
          : isSsrEventAttrChunk(output)
            ? materializeEventAttr(
                output.name,
                output.valueParts,
                operation.resolveChunk,
                output.errorRoot
              )
            : materializeReference(output as SsrReferenceChunk, operation.resolveChunk);
    if (html !== '') {
      operation.buffered.push(html);
    }
  }
}

function materializeRecord(record: SsrRecordChunk, resolveChunk?: ResolveChunk): string {
  let html = '';
  let hasErrorRoot = false;
  for (let i = 0; i < record.parts.length; i++) {
    const part = record.parts[i];
    if (typeof part === 'string') {
      html += part;
    } else if (isSsrEventAttrChunk(part)) {
      html += materializeEventAttr(
        part.name,
        part.valueParts,
        resolveChunk,
        hasErrorRoot ? undefined : part.errorRoot
      );
      hasErrorRoot ||= part.errorRoot !== undefined;
    } else {
      html += materializeReference(part, resolveChunk);
    }
  }
  return html;
}

function materializeEventAttr(
  name: string,
  parts: readonly (string | SsrReferenceChunk)[],
  resolveChunk?: ResolveChunk,
  errorRoot?: SsrReferenceChunk
): string {
  let value = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    value += typeof part === 'string' ? part : materializeReference(part, resolveChunk);
  }
  return value === ''
    ? ''
    : ` ${name}="${value}"${errorRoot === undefined ? '' : ` q:catch="${materializeReference(errorRoot, resolveChunk)}"`}`;
}

function materializeReference(reference: SsrReferenceChunk, resolveChunk?: ResolveChunk): string {
  if (
    reference.type === 'root-value' ||
    reference.type === 'event-value' ||
    reference.type === 'sync-fn'
  ) {
    const value = resolveChunk?.(reference);
    if (typeof value !== 'string') {
      throw new Error('An SSR attribute must resolve synchronously');
    }
    return value;
  }
  if (reference.type !== 'root-ref-path') {
    return String(reference.localId);
  }
  if (isDev && reference.localPath.length === 0) {
    throw new Error('An SSR root reference path cannot be empty.');
  }
  return reference.localPath.join(' ');
}
