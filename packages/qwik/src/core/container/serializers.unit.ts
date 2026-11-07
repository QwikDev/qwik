import { describe, test, expect, vi } from 'vitest';
import { getSerializer } from './serializers';
import { _deserializeData } from './resume';
import crypto from 'node:crypto';

describe('BigIntSerializer', () => {
  const deserialize = (value: string) =>
    _deserializeData(JSON.stringify({ _entry: '0', _objs: [`\u0018${value}`] }));

  test('accepts decimal values up to 1000 digits', () => {
    expect(deserialize('-42')).toBe(-42n);
    expect(deserialize('9'.repeat(1000))).toBe(BigInt('9'.repeat(1000)));
  });

  test('rejects oversized and non-decimal values', () => {
    expect(() => deserialize('9'.repeat(1001))).toThrow('Invalid BigInt');
    expect(() => deserialize('0x10')).toThrow('Invalid BigInt');
  });
});

describe('Uint8ArraySerializer', () => {
  const serializer = getSerializer('\u001c');
  if (!serializer) {
    throw new Error('Serializer not found');
  }

  test('get it', () => {
    expect(serializer).toBeDefined();
  });

  test('serialize/deserialize', () => {
    const _: any = undefined;
    const array = new Uint8Array(1024);
    expect(serializer.$test$(array)).toBe(true);
    for (let i = 0; i < 1000; i++) {
      crypto.getRandomValues(array);
      const code = serializer.$serialize$!(array, _, _, _);
      const decoded = serializer.$prepare$!(code, _, _);
      expect(decoded).toStrictEqual(array);
    }
  });
});

describe('ResourceSerializer', () => {
  const serializer = getSerializer('\u0004');
  if (!serializer) {
    throw new Error('Serializer not found');
  }

  test('rejects deserialized thenables without invoking then', async () => {
    const resource = serializer.$prepare$('0 0', undefined as any, undefined as any) as any;
    const then = vi.fn(() => Promise.reject(new Error('boom')));

    serializer.$fill$!(resource, () => ({ then }), undefined as any);

    expect(then).not.toHaveBeenCalled();
    expect(resource._state).toBe('rejected');
    expect(resource.loading).toBe(false);
    await expect(resource.value).rejects.toThrow('Invalid deserialized resource value');
  });

  test('keeps non-thenable deserialized values resolved', async () => {
    const resource = serializer.$prepare$('0 0', undefined as any, undefined as any) as any;

    serializer.$fill$!(resource, () => ({ safe: true }), undefined as any);

    expect(resource._state).toBe('resolved');
    await expect(resource.value).resolves.toEqual({ safe: true });
  });
});
