import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { fixTrailingSlash } from './path-handler';
import type { RequestEvent } from '../types';
import { isQDataRequestBasedOnSharedMap } from '../resolve-request-handlers';
import { HttpStatus } from '../http-status-codes';

// Mock dependencies
vi.mock('../request-event', () => ({
  getRequestTrailingSlash: vi.fn(),
}));

vi.mock('../resolve-request-handlers', () => ({
  isQDataRequestBasedOnSharedMap: vi.fn(),
}));

describe('fixTrailingSlash', () => {
  let mockRequestEvent: Mocked<RequestEvent>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock request event
    mockRequestEvent = {
      basePathname: '/',
      originalUrl: new URL('http://localhost/test'),
      sharedMap: new Map(),
      redirect: vi.fn(),
      request: {
        headers: {},
      },
    } as unknown as Mocked<RequestEvent>;

    // Set up default mocks
    globalThis.__NO_TRAILING_SLASH__ = true;
    vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(false);
  });

  describe('when it is a QData request', () => {
    it('should not check for trailing slash redirects', () => {
      vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(true);
      mockRequestEvent.originalUrl.pathname = '/test';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).not.toThrow();
      expect(mockRequestEvent.redirect).not.toHaveBeenCalled();
    });
  });

  describe('when pathname ends with .html', () => {
    it('should not check for trailing slash redirects', () => {
      vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(false);
      mockRequestEvent.originalUrl.pathname = '/test.html';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).not.toThrow();
      expect(mockRequestEvent.redirect).not.toHaveBeenCalled();
    });
  });

  describe('when pathname equals basePathname', () => {
    it('should not check for trailing slash redirects', () => {
      vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(false);
      const mockEvent = {
        ...mockRequestEvent,
        basePathname: '/',
        originalUrl: new URL('http://localhost/'),
      };
      mockEvent.originalUrl.pathname = '/';
      mockEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockEvent)).not.toThrow();
      expect(mockEvent.redirect).not.toHaveBeenCalled();
    });
  });

  describe('when trailing slash is required (trailingSlash = true)', () => {
    beforeEach(() => {
      globalThis.__NO_TRAILING_SLASH__ = false;
      vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(false);
    });

    it('should redirect when pathname does not end with slash', () => {
      mockRequestEvent.originalUrl.pathname = '/test';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test/?param=value'
      );
    });

    it('should not redirect when pathname already ends with slash', () => {
      mockRequestEvent.originalUrl.pathname = '/test/';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).not.toThrow();
      expect(mockRequestEvent.redirect).not.toHaveBeenCalled();
    });

    it('should handle pathname with multiple segments', () => {
      mockRequestEvent.originalUrl.pathname = '/test/path';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test/path/?param=value'
      );
    });

    it('should handle pathname with no search params', () => {
      mockRequestEvent.originalUrl.pathname = '/test';
      mockRequestEvent.originalUrl.search = '';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(HttpStatus.MovedPermanently, '/test/');
    });

    it('should handle pathname with complex search params', () => {
      mockRequestEvent.originalUrl.pathname = '/test/path';
      mockRequestEvent.originalUrl.search = '?param1=value1&param2=value2&param3=value3';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test/path/?param1=value1&param2=value2&param3=value3'
      );
    });
  });

  describe('when trailing slash is not required (trailingSlash = false)', () => {
    beforeEach(() => {
      globalThis.__NO_TRAILING_SLASH__ = true;
      vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(false);
    });

    it('should redirect when pathname ends with slash', () => {
      mockRequestEvent.originalUrl.pathname = '/test/';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test?param=value'
      );
    });

    it('should not redirect when pathname does not end with slash', () => {
      mockRequestEvent.originalUrl.pathname = '/test';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).not.toThrow();
      expect(mockRequestEvent.redirect).not.toHaveBeenCalled();
    });

    it('should handle pathname with multiple segments ending with slash', () => {
      mockRequestEvent.originalUrl.pathname = '/test/path/';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test/path?param=value'
      );
    });

    it('should handle pathname with no search params', () => {
      mockRequestEvent.originalUrl.pathname = '/test/';
      mockRequestEvent.originalUrl.search = '';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(HttpStatus.MovedPermanently, '/test');
    });

    it('should handle pathname with complex search params', () => {
      mockRequestEvent.originalUrl.pathname = '/test/path/';
      mockRequestEvent.originalUrl.search = '?param1=value1&param2=value2&param3=value3';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test/path?param1=value1&param2=value2&param3=value3'
      );
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(false);
    });

    it('should handle pathname with only slash', () => {
      globalThis.__NO_TRAILING_SLASH__ = true;
      mockRequestEvent.originalUrl.pathname = '/';
      mockRequestEvent.originalUrl.search = '';

      expect(() => fixTrailingSlash(mockRequestEvent)).not.toThrow();
      expect(mockRequestEvent.redirect).not.toHaveBeenCalled();
    });

    it('should handle pathname with multiple trailing slashes', () => {
      globalThis.__NO_TRAILING_SLASH__ = true;
      mockRequestEvent.originalUrl.pathname = '/test///';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test//?param=value'
      );
    });

    it('should handle pathname with special characters', () => {
      globalThis.__NO_TRAILING_SLASH__ = false;
      mockRequestEvent.originalUrl.pathname = '/test-path_with_underscores';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test-path_with_underscores/?param=value'
      );
    });

    it('should handle pathname with numbers', () => {
      globalThis.__NO_TRAILING_SLASH__ = false;
      mockRequestEvent.originalUrl.pathname = '/test123';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test123/?param=value'
      );
    });

    it('should handle pathname with encoded characters', () => {
      globalThis.__NO_TRAILING_SLASH__ = false;
      mockRequestEvent.originalUrl.pathname = '/test%20path';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).toThrow();
      expect(mockRequestEvent.redirect).toHaveBeenCalledWith(
        HttpStatus.MovedPermanently,
        '/test%20path/?param=value'
      );
    });
  });

  describe('integration with other handlers', () => {
    it('should work correctly with QData requests', () => {
      vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(true);
      globalThis.__NO_TRAILING_SLASH__ = false;
      mockRequestEvent.originalUrl.pathname = '/test';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).not.toThrow();
      expect(mockRequestEvent.redirect).not.toHaveBeenCalled();
    });

    it('should work correctly with HTML files', () => {
      vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(false);
      globalThis.__NO_TRAILING_SLASH__ = false;
      mockRequestEvent.originalUrl.pathname = '/test.html';
      mockRequestEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockRequestEvent)).not.toThrow();
      expect(mockRequestEvent.redirect).not.toHaveBeenCalled();
    });

    it('should work correctly with base pathname', () => {
      vi.mocked(isQDataRequestBasedOnSharedMap).mockReturnValue(false);
      globalThis.__NO_TRAILING_SLASH__ = false;
      const mockEvent = {
        ...mockRequestEvent,
        basePathname: '/app',
        originalUrl: new URL('http://localhost/app'),
      };
      mockEvent.originalUrl.search = '?param=value';

      expect(() => fixTrailingSlash(mockEvent)).not.toThrow();
      expect(mockEvent.redirect).not.toHaveBeenCalled();
    });
  });
});
