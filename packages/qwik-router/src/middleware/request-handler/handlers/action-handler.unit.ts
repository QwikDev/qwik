import { describe, it, expect, vi, beforeEach, afterEach, Mock, type Mocked } from 'vitest';
import { actionHandler } from './action-handler';
import type { ActionInternal, ActionStore } from '../../../runtime/src/types';
import type { RequestEventInternal } from '../request-event';
import type { QwikSerializer } from '../types';
import { IsQAction, QActionId } from '../user-response';
import { RequestEvQwikSerializer } from '../request-event';
import type { QRL } from 'packages/qwik/public';

// Mock dependencies
vi.mock('./loader-handler', () => ({
  runValidators: vi.fn(),
}));

vi.mock('../resolve-request-handlers', () => ({
  measure: vi.fn(async (_, __, fn) => await fn()),
  verifySerializable: vi.fn(),
}));

vi.mock('../request-event', () => ({
  getRequestActions: vi.fn(),
  getRequestMode: vi.fn(),
  RequestEvQwikSerializer: Symbol('RequestEvQwikSerializer'),
}));

const { runValidators } = await import('./loader-handler');
const { measure, verifySerializable } = await import('../resolve-request-handlers');
const { getRequestActions, getRequestMode } = await import('../request-event');

describe('actionHandler', () => {
  let mockRequestEvent: Mocked<RequestEventInternal>;
  let mockAction: Mocked<ActionInternal>;
  let mockQwikSerializer: Mocked<QwikSerializer>;
  let mockActions: Record<string, any>;
  let consoleSpy: any;

  const mockActionId = 'test-action-id';
  const mockActionHash = 'test-hash';

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock console.warn
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create mock action
    const mockActionFunction = (): Mocked<ActionStore<unknown, unknown>> => ({
      actionPath: `?action=${mockActionId}`,
      isRunning: false,
      status: undefined,
      value: undefined,
      formData: undefined,
      submit: vi.fn() as any,
      submitted: false,
    });

    mockAction = {
      __brand: 'server_action' as const,
      __id: mockActionId,
      __qrl: {
        call: vi.fn(),
        getHash: vi.fn().mockReturnValue(mockActionHash),
      } as unknown as Mocked<QRL<(form: any, event: any) => any>>,
      __validators: [],
      ...mockActionFunction,
    } as unknown as Mocked<ActionInternal>;

    // Create mock serializer
    mockQwikSerializer = {
      _serialize: vi.fn(),
      _deserialize: vi.fn(),
      _verifySerializable: vi.fn(),
    } as Mocked<QwikSerializer>;

    // Create mock actions record
    mockActions = {};

    // Create mock request event
    mockRequestEvent = {
      sharedMap: new Map(),
      headersSent: false,
      exited: false,
      method: 'POST',
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
      parseBody: vi.fn(),
      fail: vi.fn(),
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
    (getRequestActions as Mock).mockReturnValue(mockActions);
    (getRequestMode as Mock).mockReturnValue('dev');
    mockRequestEvent[RequestEvQwikSerializer] = mockQwikSerializer;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('when not a QAction request', () => {
    it('should return early without processing', async () => {
      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.sharedMap.has(IsQAction)).toBe(false);
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
      mockEvent.sharedMap.set(IsQAction, true);

      const handler = actionHandler([mockAction]);

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
      mockEvent.sharedMap.set(IsQAction, true);

      const handler = actionHandler([mockAction]);

      await handler(mockEvent);

      expect(mockEvent.json).not.toHaveBeenCalled();
      expect(mockEvent.send).not.toHaveBeenCalled();
    });
  });

  describe('when method is GET in dev mode', () => {
    it('should log a warning', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        method: 'GET',
      };
      mockEvent.sharedMap.set(IsQAction, true);
      mockEvent.sharedMap.set(QActionId, mockActionId);

      const handler = actionHandler([mockAction]);

      await handler(mockEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Seems like you are submitting a Qwik Action via GET request. Qwik Actions should be submitted via POST request.\nMake sure your <form> has method="POST" attribute, like this: <form method="POST">'
      );
    });
  });

  describe('when method is not POST', () => {
    it('should not process the action', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        method: 'PUT',
      };
      mockEvent.sharedMap.set(IsQAction, true);
      mockEvent.sharedMap.set(QActionId, mockActionId);

      const handler = actionHandler([mockAction]);

      await handler(mockEvent);

      expect(mockEvent.json).not.toHaveBeenCalled();
      expect(mockEvent.send).not.toHaveBeenCalled();
    });
  });

  describe('when action is not found in route actions', () => {
    it('should return 404 error', async () => {
      mockRequestEvent.sharedMap.set(IsQAction, true);
      mockRequestEvent.sharedMap.set(QActionId, 'non-existent-action');

      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.json).toHaveBeenCalledWith(404, { error: 'Action not found' });
    });

    it('should check global actions map when not found in route actions', async () => {
      const globalAction = {
        ...mockAction,
        __id: 'global-action-id',
      };

      // Mock global actions map
      (globalThis as any)._qwikActionsMap = new Map([['global-action-id', globalAction]]);

      mockRequestEvent.sharedMap.set(IsQAction, true);
      mockRequestEvent.sharedMap.set(QActionId, 'global-action-id');

      const data = { test: 'data' };

      (mockRequestEvent.parseBody as Mock).mockResolvedValue(data);
      (runValidators as Mock).mockResolvedValue({
        success: true,
        data,
      });

      (mockQwikSerializer._serialize as Mock).mockResolvedValue(data);

      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.send).toBeCalledWith(200, data);
    });
  });

  describe('when action is found and executed successfully', () => {
    beforeEach(() => {
      mockRequestEvent.sharedMap.set(IsQAction, true);
      mockRequestEvent.sharedMap.set(QActionId, mockActionId);
      (mockRequestEvent.parseBody as Mock).mockResolvedValue({ test: 'data' });
      (runValidators as Mock).mockResolvedValue({
        success: true,
        data: { test: 'data' },
      });
      (mockAction.__qrl.call as Mock).mockResolvedValue({ result: 'success' });
      (mockQwikSerializer._serialize as Mock).mockResolvedValue('serialized-data');
    });

    it('should execute action and return serialized data', async () => {
      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(runValidators).toHaveBeenCalledWith(
        mockRequestEvent,
        mockAction.__validators,
        { test: 'data' },
        true
      );
      expect(mockAction.__qrl.call).toHaveBeenCalledWith(
        mockRequestEvent,
        { test: 'data' },
        mockRequestEvent
      );
      expect(mockQwikSerializer._serialize).toHaveBeenCalledWith([{ result: 'success' }]);
      expect(mockRequestEvent.headers.set).toHaveBeenCalledWith(
        'Content-Type',
        'application/json; charset=utf-8'
      );
      expect(mockRequestEvent.send).toHaveBeenCalledWith(200, 'serialized-data');
    });

    it('should measure execution time in dev mode', async () => {
      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(measure).toHaveBeenCalledWith(mockRequestEvent, mockActionHash, expect.any(Function));
      expect(verifySerializable).toHaveBeenCalledWith(
        mockQwikSerializer,
        { result: 'success' },
        mockAction.__qrl
      );
    });

    it('should not measure execution time in production mode', async () => {
      (getRequestMode as Mock).mockReturnValue('prod');

      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(measure).not.toHaveBeenCalled();
      expect(verifySerializable).not.toHaveBeenCalled();
    });

    it('should not return serialized data when client does not accept JSON', async () => {
      mockRequestEvent.request.headers.set('accept', 'text/html');

      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(mockQwikSerializer._serialize).not.toHaveBeenCalled();
      expect(mockRequestEvent.send).not.toHaveBeenCalled();
    });
  });

  describe('when validation fails', () => {
    beforeEach(() => {
      mockRequestEvent.sharedMap.set(IsQAction, true);
      mockRequestEvent.sharedMap.set(QActionId, mockActionId);
      const mockEvent = {
        ...mockRequestEvent,
        parseBody: vi.fn().mockResolvedValue({ test: 'data' }),
        fail: vi.fn().mockReturnValue({
          failed: true,
          status: 400,
          error: 'Validation failed',
        }),
      };
      (runValidators as Mock).mockResolvedValue({
        success: false,
        status: 400,
        error: 'Validation failed',
      });

      // Update the mockRequestEvent reference for this test
      Object.assign(mockRequestEvent, mockEvent);
    });

    it('should call fail method and store the result', async () => {
      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.fail).toHaveBeenCalledWith(400, 'Validation failed');
      expect(mockActions[mockActionId]).toEqual({
        failed: true,
        status: 400,
        error: 'Validation failed',
      });
    });

    it('should use default status code 500 when not provided', async () => {
      (runValidators as Mock).mockResolvedValue({
        success: false,
        error: 'Validation failed',
      });

      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.fail).toHaveBeenCalledWith(500, 'Validation failed');
    });
  });

  describe('when parseBody returns invalid data', () => {
    beforeEach(() => {
      mockRequestEvent.sharedMap.set(IsQAction, true);
      mockRequestEvent.sharedMap.set(QActionId, mockActionId);
      const mockEvent = {
        ...mockRequestEvent,
        parseBody: vi.fn().mockResolvedValue('invalid-data'),
      };
      Object.assign(mockRequestEvent, mockEvent);
    });

    it('should throw an error', async () => {
      const handler = actionHandler([mockAction]);

      await expect(handler(mockRequestEvent)).rejects.toThrow(
        `Expected request data for the action id ${mockActionId} to be an object`
      );
    });

    it('should throw an error when data is null', async () => {
      const mockEvent = {
        ...mockRequestEvent,
        parseBody: vi.fn().mockResolvedValue(null),
      };

      const handler = actionHandler([mockAction]);

      await expect(handler(mockEvent)).rejects.toThrow(
        `Expected request data for the action id ${mockActionId} to be an object`
      );
    });
  });

  describe('when action execution throws an error', () => {
    beforeEach(() => {
      mockRequestEvent.sharedMap.set(IsQAction, true);
      mockRequestEvent.sharedMap.set(QActionId, mockActionId);
      const mockEvent = {
        ...mockRequestEvent,
        parseBody: vi.fn().mockResolvedValue({ test: 'data' }),
      };
      (runValidators as Mock).mockResolvedValue({
        success: true,
        data: { test: 'data' },
      });
      (mockAction.__qrl.call as Mock).mockRejectedValue(new Error('Action execution failed'));
      Object.assign(mockRequestEvent, mockEvent);
    });

    it('should propagate the error', async () => {
      const handler = actionHandler([mockAction]);

      await expect(handler(mockRequestEvent)).rejects.toThrow('Action execution failed');
    });
  });

  describe('edge cases', () => {
    it('should handle empty route actions array', async () => {
      mockRequestEvent.sharedMap.set(IsQAction, true);
      mockRequestEvent.sharedMap.set(QActionId, mockActionId);

      const handler = actionHandler([]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.json).toHaveBeenCalledWith(404, { error: 'Action not found' });
    });

    it('should handle undefined global actions map', async () => {
      (globalThis as any)._qwikActionsMap = undefined;
      mockRequestEvent.sharedMap.set(IsQAction, true);
      mockRequestEvent.sharedMap.set(QActionId, 'non-existent-action');

      const handler = actionHandler([mockAction]);

      await handler(mockRequestEvent);

      expect(mockRequestEvent.json).toHaveBeenCalledWith(404, { error: 'Action not found' });
    });

    it('should handle action with undefined validators', async () => {
      mockAction.__validators = undefined;
      mockRequestEvent.sharedMap.set(IsQAction, true);
      mockRequestEvent.sharedMap.set(QActionId, mockActionId);
      const mockEvent = {
        ...mockRequestEvent,
        parseBody: vi.fn().mockResolvedValue({ test: 'data' }),
      };
      (runValidators as Mock).mockResolvedValue({
        success: true,
        data: { test: 'data' },
      });
      (mockAction.__qrl.call as Mock).mockResolvedValue({ result: 'success' });
      (mockQwikSerializer._serialize as Mock).mockResolvedValue('serialized-data');

      const handler = actionHandler([mockAction]);

      await handler(mockEvent);

      expect(runValidators).toHaveBeenCalledWith(mockEvent, undefined, { test: 'data' }, true);
    });
  });
});
