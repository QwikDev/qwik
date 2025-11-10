import { describe, expect, it, vi, beforeEach } from 'vitest';
import { qrlToString } from './qrl-to-string';
import { createQRL, type QRLInternal, type SyncQRLInternal } from '../qrl/qrl-class';
import type { SerializationContext } from './serialization-context';
import { SYNC_QRL } from '../qrl/qrl-utils';

describe('qrlToString', () => {
  let mockContext: SerializationContext;

  beforeEach(() => {
    mockContext = {
      $symbolToChunkResolver$: vi.fn((hash: string) => `chunk-${hash}`),
      $addRoot$: vi.fn((obj: unknown) => 1) as any,
      $addSyncFn$: vi.fn((funcStr: string | null, argsCount: number, fn: Function) => 42),
    } as unknown as SerializationContext;
  });

  describe('async QRL serialization', () => {
    it('should serialize a basic async QRL without captures', () => {
      const qrl = createQRL('myChunk', 'mySymbol', null, null, null) as QRLInternal;
      const result = qrlToString(mockContext, qrl);

      expect(result).toBe('myChunk#mySymbol');
    });

    it('should serialize QRL with chunk and symbol', () => {
      const qrl = createQRL('path/to/chunk', 'functionName', null, null, null) as QRLInternal;
      const result = qrlToString(mockContext, qrl);

      expect(result).toBe('path/to/chunk#functionName');
    });

    it('should remove "./" prefix from chunk', () => {
      const qrl = createQRL('./myChunk', 'mySymbol', null, null, null) as QRLInternal;
      const result = qrlToString(mockContext, qrl);

      expect(result).toBe('myChunk#mySymbol');
    });

    it('should resolve chunk from context when chunk is missing', () => {
      const qrl = createQRL(null, 'mySymbol_abc123', null, null, null) as QRLInternal;
      mockContext.$symbolToChunkResolver$ = vi.fn(() => 'resolved-chunk');

      const result = qrlToString(mockContext, qrl);

      expect(mockContext.$symbolToChunkResolver$).toHaveBeenCalledWith('abc123');
      expect(result).toBe('resolved-chunk#mySymbol_abc123');
    });

    it('should use fallback chunk in dev mode when chunk cannot be resolved', () => {
      const qrl = createQRL(null, 'mySymbol_abc123', null, null, null) as QRLInternal;
      mockContext.$symbolToChunkResolver$ = vi.fn(() => '') as any;

      // In dev mode, it falls back to QRL_RUNTIME_CHUNK instead of throwing
      const result = qrlToString(mockContext, qrl);
      expect(result).toContain('#mySymbol_abc123');
    });
  });

  describe('sync QRL serialization', () => {
    it('should serialize a sync QRL', () => {
      const testFn = function myFunc() {
        return 42;
      };
      const qrl = createQRL('', SYNC_QRL, testFn, null, null) as SyncQRLInternal;
      mockContext.$addSyncFn$ = vi.fn(() => 5);

      const result = qrlToString(mockContext, qrl);

      expect(mockContext.$addSyncFn$).toHaveBeenCalledWith(null, 0, testFn);
      expect(result).toBe('#5');
    });

    it('should not include chunk for sync QRL', () => {
      const testFn = () => 'test';
      const qrl = createQRL('', SYNC_QRL, testFn, null, null) as SyncQRLInternal;
      mockContext.$addSyncFn$ = vi.fn(() => 99);

      const result = qrlToString(mockContext, qrl);

      expect(result).toBe('#99');
    });
  });

  describe('capture references', () => {
    it('should serialize QRL with single capture reference', () => {
      const captureRef = { value: 'captured' };
      const qrl = createQRL('myChunk', 'mySymbol', null, null, [captureRef]) as QRLInternal;
      mockContext.$addRoot$ = vi.fn(() => 3) as any;

      const result = qrlToString(mockContext, qrl);

      expect(mockContext.$addRoot$).toHaveBeenCalledWith(captureRef);
      expect(result).toBe('myChunk#mySymbol[3]');
    });

    it('should serialize QRL with multiple capture references', () => {
      const capture1 = { value: 'first' };
      const capture2 = { value: 'second' };
      const capture3 = { value: 'third' };
      const qrl = createQRL('myChunk', 'mySymbol', null, null, [
        capture1,
        capture2,
        capture3,
      ]) as QRLInternal;

      let callCount = 0;
      mockContext.$addRoot$ = vi.fn(() => ++callCount) as any;

      const result = qrlToString(mockContext, qrl);

      expect(mockContext.$addRoot$).toHaveBeenCalledTimes(3);
      expect(mockContext.$addRoot$).toHaveBeenCalledWith(capture1);
      expect(mockContext.$addRoot$).toHaveBeenCalledWith(capture2);
      expect(mockContext.$addRoot$).toHaveBeenCalledWith(capture3);
      expect(result).toBe('myChunk#mySymbol[1 2 3]');
    });

    it('should not mutate the original QRL object', () => {
      const captureRef = { value: 'captured' };
      const qrl = createQRL('myChunk', 'mySymbol', null, null, [captureRef]) as QRLInternal;
      mockContext.$addRoot$ = vi.fn(() => 5) as any;

      const result = qrlToString(mockContext, qrl);
      expect(result).toBe('myChunk#mySymbol[5]');
    });

    it('should handle empty capture references array', () => {
      const qrl = createQRL('myChunk', 'mySymbol', null, null, []) as QRLInternal;

      const result = qrlToString(mockContext, qrl);

      expect(mockContext.$addRoot$).not.toHaveBeenCalled();
      expect(result).toBe('myChunk#mySymbol');
    });

    it('should handle null capture references', () => {
      const qrl = createQRL('myChunk', 'mySymbol', null, null, null) as QRLInternal;

      const result = qrlToString(mockContext, qrl);

      expect(mockContext.$addRoot$).not.toHaveBeenCalled();
      expect(result).toBe('myChunk#mySymbol');
    });
  });

  describe('raw mode', () => {
    it('should return tuple in raw mode without captures', () => {
      const qrl = createQRL('myChunk', 'mySymbol', null, null, null) as QRLInternal;

      const result = qrlToString(mockContext, qrl, true);

      expect(result).toEqual(['myChunk', 'mySymbol', null]);
    });

    it('should return tuple in raw mode with captures', () => {
      const captureRef = { value: 'captured' };
      const qrl = createQRL('myChunk', 'mySymbol', null, null, [captureRef]) as QRLInternal;
      mockContext.$addRoot$ = vi.fn(() => 7) as any;

      const result = qrlToString(mockContext, qrl, true);

      expect(result).toEqual(['myChunk', 'mySymbol', ['7']]);
    });

    it('should return tuple in raw mode for sync QRL', () => {
      const testFn = () => {};
      const qrl = createQRL('', SYNC_QRL, testFn, null, null) as SyncQRLInternal;
      mockContext.$addSyncFn$ = vi.fn(() => 15);

      const result = qrlToString(mockContext, qrl, true);

      expect(result).toEqual(['', '15', null]);
    });

    it('should return tuple in raw mode with chunk starting with "./"', () => {
      const qrl = createQRL('./myChunk', 'mySymbol', null, null, null) as QRLInternal;

      const result = qrlToString(mockContext, qrl, true);

      expect(result).toEqual(['myChunk', 'mySymbol', null]);
    });
  });
});
