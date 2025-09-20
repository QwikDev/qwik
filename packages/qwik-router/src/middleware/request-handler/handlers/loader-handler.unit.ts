import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import {
  loaderHandler,
  loadersMiddleware,
  loaderDataHandler,
  executeLoader,
} from './loader-handler';
import type { LoaderInternal, LoaderSignal } from '../../../runtime/src/types';
import type { RequestEventInternal } from '../request-event';
import type { QwikSerializer } from '../types';
import { IsQLoader, IsQLoaderData, QLoaderId } from '../user-response';
import {
  getRequestLoaders,
  getRequestLoaderSerializationStrategyMap,
  getRequestMode,
} from '../request-event';
import type { QRL } from 'packages/qwik/public';
import { runValidators } from './validator-utils';
import { measure, verifySerializable } from '../resolve-request-handlers';
import { getPathnameForDynamicRoute } from '../../../utils/pathname';
import * as loaderHandlerModule from './loader-handler';
import { _serialize } from '@qwik.dev/core/internal';

// Mock dependencies
vi.mock('../resolve-request-handlers', () => ({
  measure: vi.fn(async (_, __, fn) => await fn()),
  verifySerializable: vi.fn(),
}));

vi.mock('../request-event', () => ({
  getRequestLoaders: vi.fn(),
  getRequestLoaderSerializationStrategyMap: vi.fn(),
  getRequestMode: vi.fn(),
  RequestEvQwikSerializer: Symbol('RequestEvQwikSerializer'),
}));

vi.mock('@qwik-router-config', () => ({
  default: {
    loaderIdToRoute: {
      'test-loader-id': '/test-route',
      'global-loader-id': '/global-route',
      loader1: '/test-route',
      loader2: '/test-route',
    },
  },
}));

vi.mock('../../../utils/pathname', () => ({
  getPathnameForDynamicRoute: vi.fn(),
}));

vi.mock('./validator-utils', () => ({
  runValidators: vi.fn(),
}));

function createMockLoader(id: string, hash: string, result: unknown): Mocked<LoaderInternal> {
  const mockLoaderFunction = (): Mocked<LoaderSignal<unknown>> =>
    ({
      value: Promise.resolve(result),
      force: vi.fn(),
      invalidate: vi.fn(),
      refetch: vi.fn(),
    }) as unknown as Mocked<LoaderSignal<unknown>>;

  return {
    __brand: 'server_loader' as const,
    __id: id,
    __qrl: {
      call: vi.fn(),
      getHash: vi.fn().mockReturnValue(hash),
    } as unknown as Mocked<QRL<(event: any) => any>>,
    __validators: [],
    __serializationStrategy: 'always',
    __expires: -1,
    ...mockLoaderFunction,
  } as unknown as Mocked<LoaderInternal>;
}

describe('loaderHandler', () => {
  let mockRequestEvent: Mocked<RequestEventInternal>;
  let mockLoader: Mocked<LoaderInternal>;
  let mockQwikSerializer: Mocked<QwikSerializer>;
  let mockLoaders: Record<string, any>;
  let mockSerializationStrategyMap: Map<string, any>;

  const mockLoaderId = 'test-loader-id';
  const mockLoaderHash = 'test-hash';

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock loader
    mockLoader = createMockLoader(mockLoaderId, mockLoaderHash, { result: 'success' });

    // Create mock serializer
    mockQwikSerializer = {
      _serialize: vi.fn(),
      _deserialize: vi.fn(),
      _verifySerializable: vi.fn(),
    } as Mocked<QwikSerializer>;

    // Create mock loaders record
    mockLoaders = {};

    // Create mock serialization strategy map
    mockSerializationStrategyMap = new Map();

    // Create mock request event
    mockRequestEvent = {
      sharedMap: new Map(),
      headersSent: false,
      exited: false,
      method: 'GET',
      request: {
        headers: new Headers({
          'content-type': 'application/json',
          accept: 'application/json',
        }),
      } as any,
      headers: {
        set: vi.fn(),
      } as any,
      json: vi.fn(),
      send: vi.fn(),
      fail: vi.fn(),
      cacheControl: vi.fn(),
      // Add other required properties
      url: new URL('http://localhost/test'),
      originalUrl: new URL('http://localhost/test'),
      pathname: '/test',
      params: {},
      query: new URLSearchParams(),
      basePathname: '/',
      platform: {},
      env: { get: vi.fn() },
      signal: {} as AbortSignal,
      cookie: {} as any,
      status: vi.fn(),
      locale: vi.fn(),
      redirect: vi.fn(),
      rewrite: vi.fn(),
      error: vi.fn(),
      text: vi.fn(),
      html: vi.fn(),
      exit: vi.fn(),
      next: vi.fn(),
      getWritableStream: vi.fn(),
      isDirty: vi.fn(),
      resetRoute: vi.fn(),
      resolveValue: vi.fn(),
      defer: vi.fn(),
    } as unknown as Mocked<RequestEventInternal>;

    // Set up default mocks
    vi.mocked(getRequestLoaders).mockReturnValue(mockLoaders);
    vi.mocked(getRequestLoaderSerializationStrategyMap).mockReturnValue(
      mockSerializationStrategyMap
    );
    vi.mocked(getRequestMode).mockReturnValue('dev');
  });

  describe('when not a QLoader request', () => {
    it('should return early without processing', async () => {
      const handler = loaderHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.sharedMap.has(IsQLoader)).toBe(false);
      expect(mockRequestEvent.json).not.toHaveBeenCalled();
      expect(mockRequestEvent.send).not.toHaveBeenCalled();
    });
  });

  describe('when headers already sent', () => {
    it('should return early', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        headersSent: true,
      };
      mockEvent.sharedMap.set(IsQLoader, true);

      const handler = loaderHandler([mockLoader]);

      await handler(mockEvent);

      expect(mockEvent.json).not.toHaveBeenCalled();
      expect(mockEvent.send).not.toHaveBeenCalled();
    });
  });

  describe('when request already exited', () => {
    it('should return early', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        exited: true,
      };
      mockEvent.sharedMap.set(IsQLoader, true);

      const handler = loaderHandler([mockLoader]);

      await handler(mockEvent);

      expect(mockEvent.json).not.toHaveBeenCalled();
      expect(mockEvent.send).not.toHaveBeenCalled();
    });
  });

  describe('when loader is not found in route loaders', () => {
    it('should return 404 error', async () => {
      mockRequestEvent.sharedMap.set(IsQLoader, true);
      mockRequestEvent.sharedMap.set(QLoaderId, 'non-existent-loader');

      const handler = loaderHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.json).toHaveBeenCalledWith(404, { error: 'Loader not found' });
    });
  });

  describe('when loader is found and executed successfully', () => {
    beforeEach(() => {
      mockRequestEvent.sharedMap.set(IsQLoader, true);
      mockRequestEvent.sharedMap.set(QLoaderId, mockLoaderId);
      vi.mocked(runValidators).mockResolvedValue({
        success: true,
        data: { test: 'data' },
      });
      vi.mocked(mockLoader.__qrl.call).mockResolvedValue({ result: 'success' });
      vi.mocked(mockQwikSerializer._serialize).mockResolvedValue('serialized-data');
    });

    it('should execute loader and return serialized data', async () => {
      const handler = loaderHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(runValidators).toHaveBeenCalledWith(
        mockRequestEvent,
        mockLoader.__validators,
        undefined,
        true
      );
      expect(mockLoader.__qrl.call).toHaveBeenCalledWith(mockRequestEvent, mockRequestEvent);
      expect(mockRequestEvent.headers.set).toHaveBeenCalledWith(
        'Content-Type',
        'application/json; charset=utf-8'
      );
      expect(mockRequestEvent.send).toHaveBeenCalledWith(
        200,
        await _serialize([{ result: 'success' }])
      );
    });

    it('should set cache headers for loaders', async () => {
      const handler = loaderHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.cacheControl).toHaveBeenCalled();
    });

    it('should measure execution time in dev mode', async () => {
      vi.mocked(getRequestMode).mockReturnValue('dev');
      const handler = loaderHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(measure).toHaveBeenCalledWith(mockRequestEvent, mockLoaderHash, expect.any(Function));
      expect(verifySerializable).toHaveBeenCalledWith({ result: 'success' }, mockLoader.__qrl);
    });

    it('should not measure execution time in production mode', async () => {
      vi.mocked(getRequestMode).mockReturnValue('server');

      const handler = loaderHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(measure).not.toHaveBeenCalled();
      expect(verifySerializable).not.toHaveBeenCalled();
    });
  });

  describe('when validation fails', () => {
    beforeEach(() => {
      mockRequestEvent.sharedMap.set(IsQLoader, true);
      mockRequestEvent.sharedMap.set(QLoaderId, mockLoaderId);
      const mockEvent = {
        ...mockRequestEvent,
        fail: vi.fn().mockReturnValue({
          failed: true,
          status: 400,
          error: 'Validation failed',
        }),
      };
      Object.assign(mockRequestEvent, mockEvent);
    });

    it('should call fail method when validation fails', async () => {
      vi.mocked(runValidators).mockResolvedValue({
        success: false,
        status: 400,
        error: 'Validation failed',
      });

      const handler = loaderHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.fail).toHaveBeenCalledWith(400, 'Validation failed');
    });

    it('should use default status code 500 when not provided', async () => {
      vi.mocked(runValidators).mockResolvedValue({
        success: false,
        error: 'Validation failed',
      });

      const handler = loaderHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.fail).toHaveBeenCalledWith(500, 'Validation failed');
    });
  });

  describe('when loader execution throws an error', () => {
    beforeEach(() => {
      mockRequestEvent.sharedMap.set(IsQLoader, true);
      mockRequestEvent.sharedMap.set(QLoaderId, mockLoaderId);
      vi.mocked(runValidators).mockResolvedValue({
        success: true,
        data: undefined,
      });
      vi.mocked(mockLoader.__qrl.call).mockImplementation(() => {
        throw new Error('Loader execution failed');
      });
    });

    it('should propagate the error', async () => {
      const handler = loaderHandler([mockLoader]);
      await expect(handler(mockRequestEvent)).rejects.toThrow('Loader execution failed');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      vi.mocked(runValidators).mockResolvedValue({
        success: true,
        data: undefined,
      });
    });

    it('should handle empty route loaders array', async () => {
      mockRequestEvent.sharedMap.set(IsQLoader, true);
      mockRequestEvent.sharedMap.set(QLoaderId, mockLoaderId);

      const handler = loaderHandler([]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.json).toHaveBeenCalledWith(404, { error: 'Loader not found' });
    });

    it('should handle loader with undefined validators', async () => {
      mockLoader.__validators = undefined;
      mockRequestEvent.sharedMap.set(IsQLoader, true);
      mockRequestEvent.sharedMap.set(QLoaderId, mockLoaderId);
      vi.mocked(mockLoader.__qrl.call).mockResolvedValue({ result: 'success' });
      vi.mocked(mockQwikSerializer._serialize).mockResolvedValue('serialized-data');

      const handler = loaderHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(mockLoader.__qrl.call).toHaveBeenCalledWith(mockRequestEvent, mockRequestEvent);
    });
  });
});

describe('loadersMiddleware', () => {
  let mockRequestEvent: Mocked<RequestEventInternal>;
  let mockLoader: Mocked<LoaderInternal>;
  let mockLoaders: Record<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLoader = createMockLoader('test-loader-id', 'test-hash', { result: 'success' });

    mockLoaders = {};

    mockRequestEvent = {
      sharedMap: new Map(),
      headersSent: false,
      exited: false,
      exit: vi.fn(),
      url: new URL('http://localhost/test'),
      originalUrl: new URL('http://localhost/test'),
      pathname: '/test',
      params: {},
      query: new URLSearchParams(),
      basePathname: '/',
      platform: {},
      env: { get: vi.fn() },
      signal: {} as AbortSignal,
      cookie: {} as any,
      status: vi.fn(),
      locale: vi.fn(),
      redirect: vi.fn(),
      rewrite: vi.fn(),
      error: vi.fn(),
      text: vi.fn(),
      html: vi.fn(),
      next: vi.fn(),
      getWritableStream: vi.fn(),
      isDirty: vi.fn(),
      resetRoute: vi.fn(),
      resolveValue: vi.fn(),
      defer: vi.fn(),
    } as unknown as Mocked<RequestEventInternal>;

    vi.mocked(getRequestLoaders).mockReturnValue(mockLoaders);
    vi.mocked(getRequestMode).mockReturnValue('dev');
  });

  describe('when headers already sent', () => {
    it('should exit early', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        headersSent: true,
      };

      const middleware = loadersMiddleware([mockLoader]);

      await middleware(mockEvent);

      expect(mockEvent.exit).toHaveBeenCalled();
    });
  });

  describe('when loaders exist', () => {
    let mockSerializationStrategyMap: Map<string, any>;
    beforeEach(() => {
      mockSerializationStrategyMap = new Map();

      vi.mocked(getRequestLoaderSerializationStrategyMap).mockReturnValue(
        mockSerializationStrategyMap
      );
      vi.mocked(runValidators).mockResolvedValue({
        success: true,
        data: undefined,
      });
    });

    it('should execute all loaders in parallel', async () => {
      const loader1 = createMockLoader('loader1', 'loader1-hash', { result: 'success' });
      const loader2 = createMockLoader('loader2', 'loader2-hash', { result: 'success' });

      const middleware = loadersMiddleware([loader1, loader2]);

      await middleware(mockRequestEvent);

      expect(loader1.__qrl.call).toHaveBeenCalledWith(mockRequestEvent, mockRequestEvent);
      expect(loader2.__qrl.call).toHaveBeenCalledWith(mockRequestEvent, mockRequestEvent);
    });
  });

  describe('when no loaders exist', () => {
    it('should not execute any loaders', async () => {
      const middleware = loadersMiddleware([]);

      vi.spyOn(loaderHandlerModule, 'executeLoader');

      await middleware(mockRequestEvent);

      expect(executeLoader).not.toHaveBeenCalled();
    });
  });
});

describe('loaderDataHandler', () => {
  let mockRequestEvent: Mocked<RequestEventInternal>;
  let mockLoader: Mocked<LoaderInternal>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLoader = createMockLoader('test-loader-id', 'test-hash', { result: 'success' });

    mockRequestEvent = {
      sharedMap: new Map(),
      headersSent: false,
      exited: false,
      url: new URL('http://localhost/test'),
      originalUrl: new URL('http://localhost/test'),
      pathname: '/test',
      params: {},
      query: new URLSearchParams(),
      basePathname: '/',
      platform: {},
      env: { get: vi.fn() },
      signal: {} as AbortSignal,
      cookie: {} as any,
      status: vi.fn(),
      locale: vi.fn(),
      redirect: vi.fn(),
      rewrite: vi.fn(),
      error: vi.fn(),
      text: vi.fn(),
      html: vi.fn(),
      json: vi.fn(),
      next: vi.fn(),
      getWritableStream: vi.fn(),
      isDirty: vi.fn(),
      resetRoute: vi.fn(),
      resolveValue: vi.fn(),
      defer: vi.fn(),
      cacheControl: vi.fn(),
    } as unknown as Mocked<RequestEventInternal>;
  });

  describe('when not a QLoaderData request', () => {
    it('should return early without processing', async () => {
      const handler = loaderDataHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.sharedMap.has(IsQLoaderData)).toBe(false);
      expect(mockRequestEvent.json).not.toHaveBeenCalled();
    });
  });

  describe('when headers already sent', () => {
    it('should return early', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        headersSent: true,
      };
      mockEvent.sharedMap.set(IsQLoaderData, true);

      const handler = loaderDataHandler([mockLoader]);

      await handler(mockEvent);

      expect(mockEvent.json).not.toHaveBeenCalled();
    });
  });

  describe('when request already exited', () => {
    it('should return early', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        exited: true,
      };
      mockEvent.sharedMap.set(IsQLoaderData, true);

      const handler = loaderDataHandler([mockLoader]);

      await handler(mockEvent);

      expect(mockEvent.json).not.toHaveBeenCalled();
    });
  });

  describe('when processing loader data', () => {
    beforeEach(() => {
      mockRequestEvent.sharedMap.set(IsQLoaderData, true);
    });

    it('should set cache headers for loader data', async () => {
      const handler = loaderDataHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.cacheControl).toHaveBeenCalledWith({
        maxAge: 365 * 24 * 60 * 60, // 1 year
      });
    });

    it('should return loader data with id and route', async () => {
      const handler = loaderDataHandler([mockLoader]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.json).toHaveBeenCalledWith(200, {
        loaderData: [
          {
            id: 'test-loader-id',
            route: '/test-route',
          },
        ],
      });
    });

    it('should handle dynamic routes with params', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        params: { id: '123' },
      };
      mockEvent.sharedMap.set(IsQLoaderData, true);
      vi.mocked(getPathnameForDynamicRoute).mockReturnValue('/dynamic-route');

      const handler = loaderDataHandler([mockLoader]);

      await handler(mockEvent);

      expect(getPathnameForDynamicRoute).toHaveBeenCalledWith(mockEvent.url.pathname, ['id'], {
        id: '123',
      });
      expect(mockEvent.json).toHaveBeenCalledWith(200, {
        loaderData: [
          {
            id: 'test-loader-id',
            route: '/dynamic-route',
          },
        ],
      });
    });

    it('should handle multiple loaders', async () => {
      const loader1 = createMockLoader('loader1', 'loader1-hash', { result: 'success' });
      const loader2 = createMockLoader('loader2', 'loader2-hash', { result: 'success' });

      const handler = loaderDataHandler([loader1, loader2]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.json).toHaveBeenCalledWith(200, {
        loaderData: [
          {
            id: 'loader1',
            route: '/test-route',
          },
          {
            id: 'loader2',
            route: '/test-route',
          },
        ],
      });
    });
  });
});

describe('executeLoader', () => {
  let mockRequestEvent: Mocked<RequestEventInternal>;
  let mockLoader: Mocked<LoaderInternal>;
  let mockLoaders: Record<string, any>;
  let mockSerializationStrategyMap: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLoader = createMockLoader('test-loader-id', 'test-hash', { result: 'success' });

    mockLoaders = {};
    mockSerializationStrategyMap = new Map();

    mockRequestEvent = {
      sharedMap: new Map(),
      headersSent: false,
      exited: false,
      url: new URL('http://localhost/test'),
      originalUrl: new URL('http://localhost/test'),
      pathname: '/test',
      params: {},
      query: new URLSearchParams(),
      basePathname: '/',
      platform: {},
      env: { get: vi.fn() },
      signal: {} as AbortSignal,
      cookie: {} as any,
      status: vi.fn(),
      locale: vi.fn(),
      redirect: vi.fn(),
      rewrite: vi.fn(),
      error: vi.fn(),
      text: vi.fn(),
      html: vi.fn(),
      json: vi.fn(),
      fail: vi.fn(),
      next: vi.fn(),
      getWritableStream: vi.fn(),
      isDirty: vi.fn(),
      resetRoute: vi.fn(),
      resolveValue: vi.fn(),
      defer: vi.fn(),
    } as unknown as Mocked<RequestEventInternal>;

    vi.mocked(getRequestLoaderSerializationStrategyMap).mockReturnValue(
      mockSerializationStrategyMap
    );
  });

  describe('when validation succeeds', () => {
    beforeEach(() => {
      vi.mocked(runValidators).mockResolvedValue({
        success: true,
        data: undefined,
      });
    });

    it('should execute loader and store result', async () => {
      vi.mocked(mockLoader.__qrl.call).mockResolvedValue({ result: 'success' });

      await executeLoader(mockLoader, mockLoaders, mockRequestEvent, true);

      expect(runValidators).toHaveBeenCalledWith(
        mockRequestEvent,
        mockLoader.__validators,
        undefined,
        true
      );
      expect(mockLoader.__qrl.call).toHaveBeenCalledWith(mockRequestEvent, mockRequestEvent);
      expect(verifySerializable).toHaveBeenCalledWith({ result: 'success' }, mockLoader.__qrl);
      expect(mockLoaders['test-loader-id']).toEqual({ result: 'success' });
      expect(mockSerializationStrategyMap.get('test-loader-id')).toBe('always');
    });

    it('should not measure in production mode', async () => {
      vi.mocked(mockLoader.__qrl.call).mockResolvedValue({ result: 'success' });

      await executeLoader(mockLoader, mockLoaders, mockRequestEvent, false);

      expect(measure).not.toHaveBeenCalled();
      expect(verifySerializable).not.toHaveBeenCalled();
    });

    it('should handle function return from loader', async () => {
      const mockFunction = vi.fn().mockReturnValue('function-result');
      vi.mocked(mockLoader.__qrl.call).mockResolvedValue(mockFunction);

      await executeLoader(mockLoader, mockLoaders, mockRequestEvent, true);

      expect(mockFunction).toHaveBeenCalled();
      expect(mockLoaders['test-loader-id']).toEqual('function-result');
    });
  });

  describe('when validation fails', () => {
    beforeEach(() => {
      vi.mocked(runValidators).mockResolvedValue({
        success: false,
        status: 400,
        error: 'Validation failed',
      });
    });

    it('should call fail method', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        fail: vi.fn().mockReturnValue('failed-result'),
      };

      await executeLoader(mockLoader, mockLoaders, mockEvent, true);

      expect(mockEvent.fail).toHaveBeenCalledWith(400, 'Validation failed');
      expect(mockLoaders['test-loader-id']).toEqual('failed-result');
    });

    it('should use default status code 500 when not provided', async () => {
      vi.mocked(runValidators).mockResolvedValue({
        success: false,
        error: 'Validation failed',
      });

      const mockEvent = {
        ...mockRequestEvent,
        fail: vi.fn().mockReturnValue('failed-result'),
      };

      await executeLoader(mockLoader, mockLoaders, mockEvent, true);

      expect(mockEvent.fail).toHaveBeenCalledWith(500, 'Validation failed');
    });
  });

  describe('when loader execution throws an error', () => {
    beforeEach(() => {
      vi.mocked(runValidators).mockResolvedValue({
        success: true,
        data: undefined,
      });
      vi.mocked(mockLoader.__qrl.call).mockImplementation(() => {
        throw new Error('Loader execution failed');
      });
    });

    it('should propagate the error', async () => {
      await expect(executeLoader(mockLoader, mockLoaders, mockRequestEvent, true)).rejects.toThrow(
        'Loader execution failed'
      );
    });
  });
});
