import { describe, expect, it } from 'vitest';
import { getServerDataUrl } from './response-page';

describe('getServerDataUrl', () => {
  const originalUrl = new URL('http://localhost:3000/path/?q=1');
  const forwardedHeaders = new Headers({
    'X-Forwarded-Host': 'example.com',
    'X-Forwarded-Proto': 'https',
  });

  it('ignores forwarded headers by default', () => {
    expect(getServerDataUrl(originalUrl, forwardedHeaders, false)).toBe(
      'http://localhost:3000/path/?q=1'
    );
  });

  it('uses forwarded headers when trusted', () => {
    expect(getServerDataUrl(originalUrl, forwardedHeaders, true)).toBe(
      'https://example.com/path/?q=1'
    );
  });

  it('keeps the forwarded port when trusted', () => {
    const headers = new Headers({ 'X-Forwarded-Host': 'example.com:9999' });
    expect(getServerDataUrl(originalUrl, headers, true)).toBe('http://example.com:9999/path/?q=1');
  });

  it('keeps the original url without forwarded headers', () => {
    expect(getServerDataUrl(originalUrl, new Headers(), true)).toBe(
      'http://localhost:3000/path/?q=1'
    );
  });
});
