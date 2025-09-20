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
  ])('should throw an error if the origin does not match for $contentType', ({ contentType }) => {
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

    try {
      csrfCheckMiddleware(requestEv);
    } catch (_) {
      // ignore the error here, we just want to check the errorFn
    }

    expect(errorFn).toBeCalledWith(403, expect.stringMatching('CSRF check failed'));
  });

  describe('isContentType', () => {
    it('should correctly identify form/data', () => {
      const headers = new Headers({
        'content-type':
          'multipart/form-data; boundary=---------------------------5509475224001460121912752931',
      });
      expect(isContentType(headers, 'multipart/form-data')).toBe(true);
    });
  });
});
