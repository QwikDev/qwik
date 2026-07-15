import { isDev } from '@qwik.dev/core/build';
import type { StreamWriter } from '../shared/utils/stream-writer';
import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import {
  isSsrRecordChunk,
  isSsrEventAttrChunk,
  type SsrOutput,
  type SsrRecordChunk,
  type SsrReferenceChunk,
} from './output';

/** Writes structured SSR output to one sink in document order. */
export class SsrOutputWriter {
  constructor(private readonly sink: Pick<StreamWriter, 'write'>) {}

  finish(output: SsrOutput): ValueOrPromise<void> {
    return writeOutput(this.sink, output);
  }
}

function writeOutput(sink: Pick<StreamWriter, 'write'>, output: SsrOutput): ValueOrPromise<void> {
  if (Array.isArray(output)) {
    return writeArray(sink, output, 0);
  }
  const html =
    typeof output === 'string'
      ? output
      : isSsrRecordChunk(output)
        ? materializeRecord(output)
        : materializeReference(output as SsrReferenceChunk);
  return html === '' ? undefined : sink.write(html);
}

function writeArray(
  sink: Pick<StreamWriter, 'write'>,
  output: readonly SsrOutput[],
  start: number
): ValueOrPromise<void> {
  for (let i = start; i < output.length; i++) {
    const result = writeOutput(sink, output[i]);
    if (isPromise(result)) {
      return Promise.resolve(result).then(() => writeArray(sink, output, i + 1));
    }
  }
}

function materializeRecord(record: SsrRecordChunk): string {
  let html = '';
  for (let i = 0; i < record.parts.length; i++) {
    const part = record.parts[i];
    html +=
      typeof part === 'string'
        ? part
        : isSsrEventAttrChunk(part)
          ? materializeEventAttr(part.name, part.valueParts)
          : materializeReference(part);
  }
  return html;
}

function materializeEventAttr(
  name: string,
  parts: readonly (string | SsrReferenceChunk)[]
): string {
  let value = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    value += typeof part === 'string' ? part : materializeReference(part);
  }
  return value === '' ? '' : ` ${name}="${value}"`;
}

function materializeReference(reference: SsrReferenceChunk): string {
  if (reference.type !== 'root-ref-path') {
    return String(reference.localId);
  }
  if (isDev && reference.localPath.length === 0) {
    throw new Error('An SSR root reference path cannot be empty.');
  }
  return reference.localPath.join(' ');
}
