import {
  _run,
  createQRL,
  isQrl,
  isSyncQrl,
  qrlToChunks,
  type QRL,
  type QRLInternal,
} from '@qwik.dev/core';
import type { SerializationContext } from '@qwik.dev/core/internal/serializer';
import { getEventDataFromHtmlAttribute, getScopedEventName } from './qwik-copy';

export type SsrEventWriteChunk = string | number | { readonly path: number[] };

export function serializeSsrEvent(
  serializationCtx: SerializationContext,
  key: string,
  rawValue: unknown,
  /** Wrap even capture-less handlers so they run under a container invoke context. */
  needsInvokeContext: boolean
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
    // sync handlers have no captures to move — wrapping would lose their sync dispatch
    const needsRunWrapper =
      !isSyncQrl(qrl) &&
      !qrl.$symbol$.startsWith('_') &&
      (qrl.$captures$?.length || qrl.$hasMovedCaptures$ || needsInvokeContext);
    const attrQrl = needsRunWrapper ? createQRL(null, '_run', _run, null, [qrl]) : qrl;
    append(qrlToChunks(serializationCtx, attrQrl));
    // the preloader needs the handler's own chunk, not the core-owned _run
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
    const journal = serializationCtx.$journal$;
    if (journal === undefined) {
      serializationCtx.$eventNames$.add(getScopedEventName(data[0], data[1]));
      serializationCtx.$eventQrls$.add(qrl);
    } else {
      journal.add(serializationCtx.$eventNames$, getScopedEventName(data[0], data[1]));
      journal.add(serializationCtx.$eventQrls$, qrl);
    }
  }
}
