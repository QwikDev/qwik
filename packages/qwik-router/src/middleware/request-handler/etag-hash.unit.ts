import { describe, expect, it, vi } from 'vitest';
import { performETagMatch, hash, normalizeETag } from './etag-hash';
import type { RequestEventInternal } from './request-event-core';

const makeRequestEv = (ifNoneMatch?: string) => {
  const headers = new Headers();
  const requestHeaders = new Headers();
  if (ifNoneMatch !== undefined) {
    requestHeaders.set('If-None-Match', ifNoneMatch);
  }
  return {
    headers,
    request: { headers: requestHeaders } as Request,
    send: vi.fn(),
    status: vi.fn(),
  } as unknown as RequestEventInternal & {
    send: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
};

describe('hash', () => {
  it('returns a base-36 hash of the content', () => {
    expect(hash('hello')).toMatch(/^[0-9a-z]+$/);
  });

  it('is stable for the same input', () => {
    expect(hash('hello')).toBe(hash('hello'));
  });

  it('produces different tags for different content', () => {
    expect(hash('a')).not.toBe(hash('b'));
  });

  it('handles the empty string', () => {
    expect(hash('')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('normalizeETag', () => {
  it('strips weak prefix', () => {
    expect(normalizeETag('W/"abc"')).toBe('abc');
  });

  it('preserves W/ when it is part of the opaque tag', () => {
    expect(normalizeETag('W/foo')).toBe('W/foo');
  });

  it('strips header quotes', () => {
    expect(normalizeETag('"abc"')).toBe('abc');
  });

  it('accepts unquoted input', () => {
    expect(normalizeETag('abc')).toBe('abc');
  });

  it('is idempotent on its own output', () => {
    const first = normalizeETag('  W/"a b\tc"  ')!;
    const second = normalizeETag(first);
    expect(second).toBe(first);
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeETag('  "abc"  ')).toBe('abc');
  });

  it('preserves an empty opaque value', () => {
    expect(normalizeETag('""')).toBe('');
  });
});

describe('checkETagMatch', () => {
  it('sets the ETag header (normalized) and returns false when no If-None-Match', () => {
    const ev = makeRequestEv();
    expect(performETagMatch(ev, normalizeETag('"abc"')!)).toBe(false);
    expect(ev.headers.get('ETag')).toBe('"abc"');
    expect(ev.send).not.toHaveBeenCalled();
  });

  it('returns 304 when If-None-Match matches exactly', () => {
    const ev = makeRequestEv('"abc"');
    expect(performETagMatch(ev, normalizeETag('"abc"')!)).toBe(true);
    expect(ev.status).toHaveBeenCalledWith(304);
    expect(ev.send).toHaveBeenCalledWith(304, '');
  });

  it('matches a weak If-None-Match against a strong server tag', () => {
    const ev = makeRequestEv('W/"abc"');
    expect(performETagMatch(ev, normalizeETag('"abc"')!)).toBe(true);
    expect(ev.send).toHaveBeenCalledWith(304, '');
  });

  it('normalizes a weak server tag to a strong response header', () => {
    const ev = makeRequestEv('"abc"');
    expect(performETagMatch(ev, normalizeETag('W/"abc"')!)).toBe(true);
    expect(ev.headers.get('ETag')).toBe('"abc"');
  });

  it('matches one entry in a comma-separated If-None-Match list', () => {
    const ev = makeRequestEv('"xyz", "abc", "def"');
    expect(performETagMatch(ev, normalizeETag('"abc"')!)).toBe(true);
    expect(ev.send).toHaveBeenCalledWith(304, '');
  });

  it('matches the wildcard If-None-Match', () => {
    const ev = makeRequestEv('*');
    expect(performETagMatch(ev, normalizeETag('"anything"')!)).toBe(true);
    expect(ev.send).toHaveBeenCalledWith(304, '');
  });

  it('does not match when tags differ', () => {
    const ev = makeRequestEv('"xyz"');
    expect(performETagMatch(ev, normalizeETag('"abc"')!)).toBe(false);
    expect(ev.send).not.toHaveBeenCalled();
  });

  it('normalizes both sides so whitespace inside the tag is ignored', () => {
    // Tabs are legal in HTTP header values, so Headers accepts them; the normalizer strips them.
    const ev = makeRequestEv('"a\tb c"');
    expect(performETagMatch(ev, normalizeETag('"a b\tc"')!)).toBe(true);
    expect(ev.headers.get('ETag')).toBe('"abc"');
  });
});
