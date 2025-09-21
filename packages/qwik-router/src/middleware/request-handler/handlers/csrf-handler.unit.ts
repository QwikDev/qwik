import { describe, expect, it, vi } from 'vitest';
import { csrfCheckMiddleware, isContentType } from './csrf-handler';
import { RequestEvent } from '@qwik.dev/router/middleware/request-handler';

describe('csrf handler', () => {
  it.each([
    {
      contentType: 'application/x-www-form-urlencoded',
    },
    {
      contentType: 'multipart/form-data',
    },
    {
      contentType: 'text/plain',
    },
  ])('should reject request when the origin does not match for $contentType', ({ contentType }) => {
    const errorFn = vi.fn();
    const requestEv = {
      request: {
        headers: new Headers({
          'content-type': contentType,
          origin: 'http://example.com',
        }),
      },
      url: new URL('http://bad-example.com'),
      error: errorFn,
    } as unknown as RequestEvent;

    expect(() => csrfCheckMiddleware(requestEv)).toThrow();
    expect(errorFn).toBeCalledWith(403, expect.stringMatching('CSRF check failed'));
  });

  it('should reject request when origin header is missing for form content types', () => {
    const errorFn = vi.fn();
    const requestEv = {
      request: {
        headers: new Headers({
          'content-type': 'application/x-www-form-urlencoded',
          // No origin header
        }),
      },
      url: new URL('http://example.com'),
      error: errorFn,
    } as unknown as RequestEvent;

    expect(() => csrfCheckMiddleware(requestEv)).toThrow();
    expect(errorFn).toBeCalledWith(403, expect.stringMatching('CSRF check failed'));
  });

  it.each([
    {
      contentType: 'application/x-www-form-urlencoded',
    },
    {
      contentType: 'multipart/form-data',
    },
    {
      contentType: 'text/plain',
    },
  ])('should allow request when origin matches for $contentType', ({ contentType }) => {
    const errorFn = vi.fn();
    const requestEv = {
      request: {
        headers: new Headers({
          'content-type': contentType,
          origin: 'http://example.com',
        }),
      },
      url: new URL('http://example.com'),
      error: errorFn,
    } as unknown as RequestEvent;

    // Should not throw an error
    expect(() => csrfCheckMiddleware(requestEv)).not.toThrow();
    expect(errorFn).not.toHaveBeenCalled();
  });

  it.each([
    {
      contentType: 'application/json',
    },
    {
      contentType: 'text/html',
    },
    {
      contentType: 'application/xml',
    },
    {
      contentType: 'image/png',
    },
  ])(
    'should allow request for non-form content type $contentType regardless of origin',
    ({ contentType }) => {
      const errorFn = vi.fn();
      const requestEv = {
        request: {
          headers: new Headers({
            'content-type': contentType,
            origin: 'http://example.com',
          }),
        },
        url: new URL('http://bad-example.com'),
        error: errorFn,
      } as unknown as RequestEvent;

      // Should not throw an error for non-form content types
      expect(() => csrfCheckMiddleware(requestEv)).not.toThrow();
      expect(errorFn).not.toHaveBeenCalled();
    }
  );

  it('should allow request when content-type header is missing', () => {
    const errorFn = vi.fn();
    const requestEv = {
      request: {
        headers: new Headers({
          origin: 'http://example.com',
          // No content-type header
        }),
      },
      url: new URL('http://example.com'),
      error: errorFn,
    } as unknown as RequestEvent;

    // Should not throw an error when content-type is missing
    expect(() => csrfCheckMiddleware(requestEv)).not.toThrow();
    expect(errorFn).not.toHaveBeenCalled();
  });

  it('should verify exact error message content', () => {
    const errorFn = vi.fn();
    const requestEv = {
      request: {
        headers: new Headers({
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://malicious.com',
        }),
      },
      url: new URL('http://example.com'),
      method: 'POST',
      error: errorFn,
    } as unknown as RequestEvent;

    try {
      csrfCheckMiddleware(requestEv);
    } catch (_) {
      // ignore the error here, we just want to check the errorFn
    }

    expect(errorFn).toBeCalledWith(
      403,
      'CSRF check failed. Cross-site POST form submissions are forbidden.\nThe request origin "http://malicious.com" does not match the server origin "http://example.com".'
    );
  });

  describe('isContentType', () => {
    it('should correctly identify form/data', () => {
      const headers = new Headers({
        'content-type':
          'multipart/form-data; boundary=---------------------------5509475224001460121912752931',
      });
      expect(isContentType(headers, 'multipart/form-data')).toBe(true);
    });

    it('should handle multiple content type parameters', () => {
      const headers = new Headers({
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      });
      expect(isContentType(headers, 'application/x-www-form-urlencoded')).toBe(true);
    });

    it('should handle case insensitive content types', () => {
      const headers = new Headers({
        'content-type': 'APPLICATION/X-WWW-FORM-URLENCODED',
      });
      expect(isContentType(headers, 'application/x-www-form-urlencoded')).toBe(false);
    });

    it('should return false for non-matching content types', () => {
      const headers = new Headers({
        'content-type': 'application/json',
      });
      expect(isContentType(headers, 'application/x-www-form-urlencoded')).toBe(false);
    });

    it('should handle empty content-type header', () => {
      const headers = new Headers({});
      expect(isContentType(headers, 'application/x-www-form-urlencoded')).toBe(false);
    });

    it('should handle missing content-type header', () => {
      const headers = new Headers({
        'other-header': 'value',
      });
      expect(isContentType(headers, 'application/x-www-form-urlencoded')).toBe(false);
    });

    it('should handle multiple content type checks', () => {
      const headers = new Headers({
        'content-type': 'text/plain',
      });
      expect(isContentType(headers, 'application/x-www-form-urlencoded', 'text/plain')).toBe(true);
      expect(isContentType(headers, 'application/json', 'multipart/form-data')).toBe(false);
    });

    it('should handle content type with only whitespace', () => {
      const headers = new Headers({
        'content-type': '   ',
      });
      expect(isContentType(headers, 'application/x-www-form-urlencoded')).toBe(false);
    });
  });
});
