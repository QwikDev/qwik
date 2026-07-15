import {
  _run,
  createQRL,
  isQrl,
  qrlToChunks,
  type QRL,
  type QRLInternal,
  type SerializationContext,
} from '@qwik.dev/core';
import { getEventDataFromHtmlAttribute, getScopedEventName } from './qwik-copy';

export type SsrEventWriteChunk = string | number | { readonly path: number[] };

export function serializeSsrEvent(
  serializationCtx: SerializationContext,
  key: string,
  rawValue: unknown,
  hasMovedCaptures: boolean
): string | SsrEventWriteChunk[] | null {
  let value: string | SsrEventWriteChunk[] | null = null;

  const append = (next: string | SsrEventWriteChunk[]) => {
    if (value === null) {
      value = next;
    } else if (typeof value === 'string' && typeof next === 'string') {
      value += '|' + next;
    } else {
      value = [
        ...(typeof value === 'string' ? [value] : value),
        '|',
        ...(typeof next === 'string' ? [next] : next),
      ];
    }
  };

  const appendQrl = (qrl: QRLInternal<unknown>) => {
    if (!qrl.$symbol$.startsWith('_') && (qrl.$captures$?.length || hasMovedCaptures)) {
      qrl = createQRL(null, '_run', _run, null, [qrl]);
    }
    append(qrlToChunks(serializationCtx, qrl));
    addEvent(serializationCtx, key, qrl);
  };

  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        visit(current[i]);
      }
    } else if (isQrl(current)) {
      appendQrl(current);
    }
  };

  visit(rawValue);
  return value;
}

function addEvent(serializationCtx: SerializationContext, key: string, qrl: QRL): void {
  const data = getEventDataFromHtmlAttribute(key);
  if (data) {
    serializationCtx.$eventNames$.add(getScopedEventName(data[0], data[1]));
    serializationCtx.$eventQrls$.add(qrl);
  }
}
