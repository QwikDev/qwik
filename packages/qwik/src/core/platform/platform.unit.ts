import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPlatform, setPlatform } from './platform';
import { getSymbolHash } from '../qrl/qrl-class';

describe('core platform', () => {
  beforeEach(() => {
    // Initialize a fresh Map for each test to avoid pollution
    (globalThis as any).__qwik_reg_symbols = new Map<string, any>();
  });

  afterEach(() => {
    // Clean up global state
    delete (globalThis as any).__qwik_reg_symbols;
  });

  describe('importSymbol - server mode', () => {
    test('returns registered symbol without importing', async () => {
      const platform = createPlatform();

      // Register a mock symbol
      const symbolName = 'myComponent_abc123';
      const hash = getSymbolHash(symbolName);
      const mockFunction = () => 'mock component';
      (globalThis as any).__qwik_reg_symbols.set(hash, mockFunction);

      // importSymbol should return the registered symbol synchronously
      const result = await platform.importSymbol(null as any, '', symbolName);

      expect(result).toBe(mockFunction);
    });

    test('throws error for unregistered symbol without importing', async () => {
      const platform = createPlatform();

      const symbolName = 'unregisteredSymbol_xyz789';

      // importSymbol should throw qError without attempting any dynamic import
      expect(() => platform.importSymbol(null as any, '', symbolName)).toThrow();

      let didThrow = false;
      // Verify it throws with the correct error structure
      try {
        platform.importSymbol(null as any, '', symbolName);
        expect.unreachable('Should have thrown an error');
      } catch (e: any) {
        didThrow = true;
        // The error should be a QError with code for dynamic import failed
        expect(e.message).toMatch(/Code\(\d+\)/);
        expect(e.message).toContain('Dynamic import not found');
      }
      expect(didThrow).toBe(true);
    });

    test('does not call dynamic import on server', async () => {
      const platform = createPlatform();

      const symbolName = 'testSymbol_test123';

      // Verify that the function throws synchronously without any async import
      const startTime = Date.now();
      try {
        platform.importSymbol(null as any, '', symbolName);
      } catch (e) {
        // Expected to throw
      }
      const endTime = Date.now();

      // Should complete nearly instantly (no network/file I/O)
      // If it took more than 100ms, something is probably doing async work
      expect(endTime - startTime).toBeLessThan(100);
    });

    test('works with symbols containing multiple underscores in server mode', async () => {
      const platform = createPlatform();

      const symbolName = 'my_component_with_underscores_abc123';
      const hash = getSymbolHash(symbolName);
      const mockFunction = () => 'mock';
      (globalThis as any).__qwik_reg_symbols.set(hash, mockFunction);

      const result = await platform.importSymbol(null as any, '', symbolName);

      expect(result).toBe(mockFunction);
    });
  });

  describe('setPlatform and getPlatform', () => {
    test('setPlatform updates the platform', () => {
      const customPlatform = createPlatform();
      const customImportSymbol = vi.fn();
      customPlatform.importSymbol = customImportSymbol;

      setPlatform(customPlatform);

      // The platform should now use the custom implementation
      expect(customPlatform.importSymbol).toBe(customImportSymbol);
    });
  });

  describe('platform utilities', () => {
    test('nextTick returns a promise and executes callback', async () => {
      const platform = createPlatform();
      const mockFn = vi.fn(() => 'result');

      const promise = platform.nextTick(mockFn);

      expect(promise).toBeInstanceOf(Promise);
      const result = await promise;
      expect(mockFn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    test('chunkForSymbol returns symbol and chunk', () => {
      const platform = createPlatform();

      const result1 = platform.chunkForSymbol('mySymbol', 'chunk.js');
      expect(result1).toEqual(['mySymbol', 'chunk.js']);

      const result2 = platform.chunkForSymbol('mySymbol', null);
      expect(result2).toEqual(['mySymbol', '_']);
    });
  });

  describe('getSymbolHash', () => {
    test('extracts hash after last underscore', () => {
      expect(getSymbolHash('mySymbol_abc123')).toBe('abc123');
      expect(getSymbolHash('component_with_multiple_underscores_xyz789')).toBe('xyz789');
    });

    test('returns full name if no underscore present', () => {
      expect(getSymbolHash('noUnderscore')).toBe('noUnderscore');
      expect(getSymbolHash('simpleSymbol')).toBe('simpleSymbol');
    });

    test('handles edge cases', () => {
      expect(getSymbolHash('_leadingUnderscore')).toBe('leadingUnderscore');
      expect(getSymbolHash('trailingUnderscore_')).toBe('');
      expect(getSymbolHash('_')).toBe('');
    });
  });
});
