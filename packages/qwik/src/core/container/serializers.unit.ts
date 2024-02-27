import { describe, test, expect } from 'vitest';
import { getSerializer } from './serializers';

describe('Uint8ArraySerializer', () => {
  const serializer = getSerializer('\u001c');
  if (!serializer) {
    throw new Error('Serializer not found');
  }

  test('get it', () => {
    expect(serializer).toBeDefined();
  });

  test('serialize/deserialize', () => {
    const array = new Uint8Array([0, 1, 2, 3]);
    expect(serializer.$test$(array)).toBe(true);
    const _: any = undefined;
    const code = serializer.$serialize$!(array, _, _, _);
    const decoded = serializer.$prepare$!(code, _, _);
    expect(decoded).toStrictEqual(array);
  });
});
