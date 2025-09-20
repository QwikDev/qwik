import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { runValidators } from './validator-utils';
import type { RequestEventInternal } from '../request-event';
import { measure } from '../resolve-request-handlers';

vi.mock('../resolve-request-handlers', () => ({
  measure: vi.fn(async (_, __, fn) => await fn()),
}));

describe('runValidators', () => {
  let mockRequestEvent: Mocked<RequestEventInternal>;
  let mockValidators: any[];

  beforeEach(() => {
    vi.clearAllMocks();

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

    mockValidators = [
      {
        validate: vi.fn().mockResolvedValue({ success: true, data: 'validated-data' }),
      },
    ];
  });

  describe('when no validators exist', () => {
    it('should return success with original data', async () => {
      const result = await runValidators(mockRequestEvent, undefined, 'test-data', true);

      expect(result).toEqual({
        success: true,
        data: 'test-data',
      });
    });
  });

  describe('when validators exist', () => {
    it('should run all validators in sequence', async () => {
      const validator1 = {
        validate: vi.fn().mockResolvedValue({ success: true, data: 'data1' }),
      };
      const validator2 = {
        validate: vi.fn().mockResolvedValue({ success: true, data: 'data2' }),
      };

      const result = await runValidators(
        mockRequestEvent,
        [validator1, validator2],
        'initial-data',
        true
      );

      expect(validator1.validate).toHaveBeenCalledWith(mockRequestEvent, 'initial-data');
      expect(validator2.validate).toHaveBeenCalledWith(mockRequestEvent, 'data1');
      expect(result).toEqual({
        success: true,
        data: 'data2',
      });
    });

    it('should stop on first validation failure', async () => {
      const validator1 = {
        validate: vi.fn().mockResolvedValue({ success: false, error: 'First validation failed' }),
      };
      const validator2 = {
        validate: vi.fn().mockResolvedValue({ success: true, data: 'data2' }),
      };

      const result = await runValidators(
        mockRequestEvent,
        [validator1, validator2],
        'initial-data',
        true
      );

      expect(validator1.validate).toHaveBeenCalledWith(mockRequestEvent, 'initial-data');
      expect(validator2.validate).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'First validation failed',
      });
    });

    it('should measure validators in dev mode', async () => {
      await runValidators(mockRequestEvent, mockValidators, 'test-data', true);

      expect(measure).toHaveBeenCalledWith(mockRequestEvent, 'validator$', expect.any(Function));
    });

    it('should not measure validators in production mode', async () => {
      await runValidators(mockRequestEvent, mockValidators, 'test-data', false);

      expect(measure).not.toHaveBeenCalled();
    });
  });
});
