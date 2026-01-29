import { describe, test, expect } from 'vitest';
import { getSerializer } from './serializers';
import crypto from 'node:crypto';

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
