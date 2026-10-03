import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parseQRL, qrlToString } from './qrl-to-string';
import { createQRL, createSyncQRL, type QRLInternal, type SyncQRLInternal } from '../qrl/qrl-class';
import type { SerializationContext } from './serialization-context';
import { isSyncQrl, SYNC_QRL } from '../qrl/qrl-utils';
import { _qrlSync } from '../qrl/qrl.public';

describe('qrlToString', () => {
  let mockContext: SerializationContext;

  beforeEach(() => {
    mockContext = {
      $symbolToChunkResolver$: vi.fn((hash: string) => `chunk-${hash}`),
      $addRoot$: vi.fn((obj: unknown) => 1) as any,
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
    it('refuses to serialize a sync QRL without a compiler key', () => {
      const qrl = createSyncQRL(SYNC_QRL, () => 42) as SyncQRLInternal;

      expect(() => qrlToString(mockContext, qrl)).toThrow(
        'A sync$ without a compiler key cannot be serialized.'
      );
    });

    it('preserves a compiler table key when serializing and parsing a sync QRL', () => {
      const handler = () => 'handled';
      const qrl = _qrlSync(handler, 'text-key') as unknown as QRLInternal;
      mockContext.$requireSyncFn$ = vi.fn();
      mockContext.$qrlMapper$ = vi.fn(() => ['wrong-symbol', 'wrong-chunk'] as const);

      const serialized = qrlToString(mockContext, qrl);
      expect(serialized).toBe('#text-key');
      expect(mockContext.$requireSyncFn$).toHaveBeenCalledWith('text-key', handler.toString());
      expect(mockContext.$qrlMapper$).not.toHaveBeenCalled();
      const restored = parseQRL(serialized);
      expect(isSyncQrl(restored)).toBe(true);
      expect(restored.$symbol$).toBe('text-key');
    });

    it('treats an empty chunk as a missing chunk, not as a sync QRL', () => {
      const qrl = createQRL('', 'mySymbol_abc123', () => 'content', null, null) as QRLInternal;
      mockContext.$requireSyncFn$ = vi.fn();

      expect(isSyncQrl(qrl)).toBe(false);
      expect(qrlToString(mockContext, qrl)).toBe('chunk-abc123#mySymbol_abc123');
      expect(mockContext.$requireSyncFn$).not.toHaveBeenCalled();
    });
  });

  describe('capture references', () => {
    it('rejects captures that have not been restored', () => {
      const qrl = createQRL('myChunk', 'mySymbol', null, null, '0') as QRLInternal;

      expect(() => qrlToString(mockContext, qrl)).toThrow(
        'QRL captures must be restored before serialization.'
      );
    });

    it('should serialize QRL with single capture reference', () => {
      const captureRef = { value: 'captured' };
      const qrl = createQRL('myChunk', 'mySymbol', null, null, [captureRef]) as QRLInternal;
      mockContext.$addRoot$ = vi.fn(() => 3) as any;

      const result = qrlToString(mockContext, qrl);

      expect(mockContext.$addRoot$).toHaveBeenCalledWith(captureRef);
      expect(result).toBe('myChunk#mySymbol#3');
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
      expect(result).toBe('myChunk#mySymbol#1 1 1');
    });

    it('should not mutate the original QRL object', () => {
      const captureRef = { value: 'captured' };
      const qrl = createQRL('myChunk', 'mySymbol', null, null, [captureRef]) as QRLInternal;
      mockContext.$addRoot$ = vi.fn(() => 5) as any;

      expect(qrl.$captures$).toEqual([captureRef]);

      const result = qrlToString(mockContext, qrl);
      expect(result).toBe('myChunk#mySymbol#5');

      // After serialization, the original QRL should NOT be mutated
      expect(qrl.$captures$).toEqual([captureRef]);
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

      expect(result).toEqual(['myChunk', 'mySymbol', '7']);
    });

    it('should return tuple in raw mode for sync QRL', () => {
      const qrl = _qrlSync(() => {}, 'raw-key') as unknown as QRLInternal;
      mockContext.$requireSyncFn$ = vi.fn();

      expect(qrlToString(mockContext, qrl, true)).toEqual(['', 'raw-key', null]);
    });

    it('should return tuple in raw mode with chunk starting with "./"', () => {
      const qrl = createQRL('./myChunk', 'mySymbol', null, null, null) as QRLInternal;

      const result = qrlToString(mockContext, qrl, true);

      expect(result).toEqual(['myChunk', 'mySymbol', null]);
    });
  });
});
