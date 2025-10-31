import { describe, it, expect, vi } from 'vitest';
import {
  verifySerializable,
  noSerialize,
  fastSkipSerialize,
  NoSerializeSymbol,
  SerializerSymbol,
} from './verify';
import * as useCore from '../../use/use-core';

describe('verifySerializable', () => {
  describe('serializable values', () => {
    it('should allow null and undefined', () => {
      expect(verifySerializable(null)).toBe(null);
      expect(verifySerializable(undefined)).toBe(undefined);
    });

    it('should allow primitives', () => {
      expect(verifySerializable('string')).toBe('string');
      expect(verifySerializable(123)).toBe(123);
      expect(verifySerializable(true)).toBe(true);
      expect(verifySerializable(false)).toBe(false);
    });

    it('should allow plain objects', () => {
      const obj = { a: 1, b: 'test', c: true };
      expect(verifySerializable(obj)).toEqual(obj);
    });

    it('should allow nested plain objects', () => {
      const obj = { a: { b: { c: 'deep' } } };
      expect(verifySerializable(obj)).toEqual(obj);
    });

    it('should allow arrays', () => {
      const arr = [1, 2, 'three', true];
      expect(verifySerializable(arr)).toEqual(arr);
    });

    it('should allow nested arrays', () => {
      const arr = [1, [2, [3, [4]]]];
      expect(verifySerializable(arr)).toEqual(arr);
    });
  });

  describe('circular references', () => {
    it('should handle circular object references', () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      expect(() => verifySerializable(obj)).not.toThrow();
    });

    it('should handle circular array references', () => {
      const arr: any[] = [1, 2];
      arr.push(arr);
      expect(() => verifySerializable(arr)).not.toThrow();
    });

    it('should handle complex circular structures', () => {
      const obj1: any = { name: 'obj1' };
      const obj2: any = { name: 'obj2', ref: obj1 };
      obj1.ref = obj2;
      expect(() => verifySerializable(obj1)).not.toThrow();
    });
  });

  describe('non-serializable values', () => {
    it('should throw for class instances', () => {
      class MyClass {
        value = 42;
      }
      const instance = new MyClass();
      expect(() => verifySerializable(instance)).toThrow(/cannot be serialized/);
      expect(() => verifySerializable(instance)).toThrow(/MyClass/);
    });

    it('should throw for functions', () => {
      const fn = function myFunction() {};
      expect(() => verifySerializable(fn)).toThrow(/cannot be serialized/);
      expect(() => verifySerializable(fn)).toThrow(/myFunction/);
      expect(() => verifySerializable(fn)).toThrow(/\$\(fn\)/);
    });

    it('should include context in error message', () => {
      class MyClass {}
      const obj = { nested: { deep: new MyClass() } };
      expect(() => verifySerializable(obj)).toThrow(/in _\.nested\.deep/);
    });

    it('should use preMessage if provided', () => {
      const fn = () => {};
      expect(() => verifySerializable(fn, 'Custom error')).toThrow(/Custom error/);
    });
  });

  describe('untrack integration', () => {
    it('should call untrack when verifying', () => {
      const untrackSpy = vi.spyOn(useCore, 'untrack');
      const value = { a: 1 };

      verifySerializable(value);

      expect(untrackSpy).toHaveBeenCalled();
      untrackSpy.mockRestore();
    });

    it('should verify value inside untrack callback', () => {
      let capturedCallback: any;
      const untrackMock = vi.spyOn(useCore, 'untrack').mockImplementation((fn) => {
        capturedCallback = fn;
        return fn();
      });

      const value = { test: 'value' };
      const result = verifySerializable(value);

      expect(untrackMock).toHaveBeenCalled();
      expect(capturedCallback).toBeDefined();
      expect(result).toBe(value);

      untrackMock.mockRestore();
    });
  });
});

describe('noSerialize', () => {
  it('should mark object as non-serializable', () => {
    const obj = { value: 42 };
    const marked = noSerialize(obj);

    expect(marked).toBe(obj);
    expect(() => verifySerializable(marked)).not.toThrow();
  });

  it('should mark function as non-serializable', () => {
    const fn = () => {};
    const marked = noSerialize(fn);

    expect(marked).toBe(fn);
    expect(() => verifySerializable(marked)).not.toThrow();
  });

  it('should handle null', () => {
    const result = noSerialize(null as any);
    expect(result).toBe(null);
  });

  it('should handle undefined', () => {
    const result = noSerialize(undefined);
    expect(result).toBe(undefined);
  });

  it('should not throw for primitives', () => {
    expect(noSerialize('string' as any)).toBe('string');
    expect(noSerialize(123 as any)).toBe(123);
  });

  it('should allow nested noSerialize objects', () => {
    class MyClass {}
    const obj = {
      serializable: 'yes',
      notSerializable: noSerialize(new MyClass()),
    };

    expect(() => verifySerializable(obj)).not.toThrow();
  });
});

describe('fastSkipSerialize', () => {
  it('should return true for noSerialize objects', () => {
    const obj = noSerialize({ value: 42 });
    expect(fastSkipSerialize(obj)).toBe(true);
  });

  it('should return true for objects with NoSerializeSymbol', () => {
    const obj = { [NoSerializeSymbol]: true, value: 42 };
    expect(fastSkipSerialize(obj)).toBe(true);
  });

  it('should return false for regular objects', () => {
    const obj = { value: 42 };
    expect(fastSkipSerialize(obj)).toBe(false);
  });

  it('should return false for null', () => {
    expect(fastSkipSerialize(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(fastSkipSerialize(undefined)).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(fastSkipSerialize('string')).toBe(false);
    expect(fastSkipSerialize(123)).toBe(false);
    expect(fastSkipSerialize(true)).toBe(false);
  });

  it('should return true for noSerialize functions', () => {
    const fn = noSerialize(() => {});
    expect(fastSkipSerialize(fn)).toBe(true);
  });
});

describe('NoSerializeSymbol', () => {
  it('should be a symbol', () => {
    expect(typeof NoSerializeSymbol).toBe('symbol');
  });

  it('should mark object as non-serializable when present', () => {
    class MyClass {
      [NoSerializeSymbol] = true;
      value = 42;
    }
    const instance = new MyClass();
    expect(() => verifySerializable(instance)).not.toThrow();
  });
});

describe('SerializerSymbol', () => {
  it('should be a symbol', () => {
    expect(typeof SerializerSymbol).toBe('symbol');
  });
});

describe('edge cases', () => {
  it('should handle empty objects', () => {
    expect(verifySerializable({})).toEqual({});
  });

  it('should handle empty arrays', () => {
    expect(verifySerializable([])).toEqual([]);
  });

  it('should handle objects with numeric keys', () => {
    const obj = { 0: 'a', 1: 'b', 2: 'c' };
    expect(verifySerializable(obj)).toEqual(obj);
  });

  it('should handle mixed nested structures', () => {
    const value = {
      arr: [1, { nested: 'object' }, [3, 4]],
      obj: { arr: [5, 6], val: 'string' },
    };
    expect(verifySerializable(value)).toEqual(value);
  });
});
