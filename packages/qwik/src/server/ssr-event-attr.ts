import {
  createSsrEventAttr as createSsrEventAttrChunk,
  createSsrRootRef,
  createSsrRootRefPath,
  type SerializationContext,
  type SsrEventAttrChunk,
  type SsrReferenceChunk,
} from '@qwik.dev/core';
import { escapeHTML } from './qwik-copy';
import { serializeSsrEvent, type SsrEventWriteChunk } from './ssr-events';

export function createSsrEventAttr(
  serializationCtx: SerializationContext,
  name: string,
  value: unknown,
  hasMovedCaptures: boolean
): SsrEventAttrChunk {
  const serialized = serializeSsrEvent(serializationCtx, name, value, hasMovedCaptures);
  return createSsrEventAttrChunk(name, createSsrEventValueParts(serialized));
}

export function createSsrEventAttrParts(
  name: string,
  serialized: string | SsrEventWriteChunk[] | null
): (string | SsrReferenceChunk)[] {
  if (serialized === null) {
    return [];
  }
  const parts = createSsrEventValueParts(serialized);
  if (typeof parts[0] === 'string') {
    parts[0] = ` ${name}="${parts[0]}`;
  } else {
    parts.unshift(` ${name}="`);
  }
  appendString(parts, '"');
  return parts;
}

function createSsrEventValueParts(
  serialized: string | SsrEventWriteChunk[] | null
): (string | SsrReferenceChunk)[] {
  if (serialized === null) {
    return [];
  }
  const parts: (string | SsrReferenceChunk)[] = [];
  if (typeof serialized === 'string') {
    appendString(parts, escapeHTML(serialized));
  } else {
    for (let i = 0; i < serialized.length; i++) {
      appendEventChunk(parts, serialized[i]);
    }
  }
  return parts;
}

function appendEventChunk(parts: (string | SsrReferenceChunk)[], chunk: SsrEventWriteChunk): void {
  if (typeof chunk === 'string') {
    appendString(parts, escapeHTML(chunk));
  } else if (typeof chunk === 'number') {
    parts.push(createSsrRootRef(chunk));
  } else {
    parts.push(createSsrRootRefPath(chunk.path));
  }
}

function appendString(parts: (string | SsrReferenceChunk)[], value: string): void {
  const last = parts.length - 1;
  if (typeof parts[last] === 'string') {
    parts[last] += value;
  } else {
    parts.push(value);
  }
}
