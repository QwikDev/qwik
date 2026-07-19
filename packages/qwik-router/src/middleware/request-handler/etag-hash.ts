import type { RequestEventInternal } from './request-event-core';

/**
 * FNV-1a 32-bit hash for generating eTags from response data. Cheap to compute, sufficient
 * collision resistance for cache validation (not cryptographic).
 */
export function hash(str: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) | 0; // FNV prime, keep 32-bit
  }
  return (hash >>> 0).toString(36);
}

/**
 * Normalize an ETag header value (or a single `If-None-Match` entry) into a canonical form so byte
 * equality compares the same logical tag. Strips weak ETag syntax (`W/"..."`), quotes, and any
 * character outside RFC 7232's `etagc` grammar (printable ASCII except DQUOTE — no escape mechanism
 * exists, and non-ASCII bytes are mangled by many HTTP stacks even though `obs-text` technically
 * permits them). Idempotent.
 */
export function normalizeETag(raw: string): string {
  let tag = raw.trim();
  if (tag.endsWith('"') && tag.startsWith('W/"')) {
    tag = tag.slice(3);
  }
  tag = tag.replace(/[^!#-~]/g, '');
  return tag;
}

export function setETagHeader(requestEv: RequestEventInternal, normalizedETag: string): void {
  const headerETag = `"${normalizedETag}"`;
  requestEv.headers.set('ETag', headerETag);
}

/**
 * Set the strong ETag header on the response and check the request's `If-None-Match` against it.
 * The eTag argument must already be normalized. Returns true if a 304 was sent (caller should stop
 * processing).
 */
export function performETagMatch(requestEv: RequestEventInternal, normalizedETag: string): boolean {
  setETagHeader(requestEv, normalizedETag);

  const ifNoneMatch = requestEv.request.headers.get('If-None-Match');
  if (ifNoneMatch) {
    // If-None-Match may be a comma-separated list or `*`.
    let found = ifNoneMatch.trim() === '*';
    if (!found) {
      for (const entry of ifNoneMatch.split(',')) {
        const normalizedEntry = normalizeETag(entry);
        if (normalizedEntry === normalizedETag) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      requestEv.status(304);
      requestEv.send(304 as any, '' as any);
      return true;
    }
  }
  return false;
}
