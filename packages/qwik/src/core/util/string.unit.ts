import { test, expect } from 'vitest';
import { packUint8Array, unpackUint8Array } from './string';
import crypto from 'node:crypto';

test('pack/unpack bytes including surrogate pair', () => {
  const a = new Uint8Array([66, 216, 183, 223, 206, 145, 182, 91]);
  const packed = packUint8Array(a);
  expect(packed).toBe('𠮷野家');
  expect(typeof packed).toBe('string');
  expect(unpackUint8Array(packed)).toStrictEqual(a);
});

test('random pack/unpack of even array', () => {
  const a = new Uint8Array(8);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  for (let i = 0; i < 1000; i++) {
    crypto.getRandomValues(a);
    const packed = packUint8Array(a);
    if (packed.includes('\ufeff')) {
      // skip if the BOM is included because the TextEncoder removes it
      continue;
    }
    const code = enc.encode(packed);
    const decoded = dec.decode(code);
    expect(unpackUint8Array(decoded)).toStrictEqual(a);
  }
});

test('random pack/unpack of odd array', () => {
  const a = new Uint8Array(7);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  for (let i = 0; i < 1000; i++) {
    crypto.getRandomValues(a);
    const packed = packUint8Array(a);
    if (packed.includes('\ufeff')) {
      // skip if the BOM is included because the TextEncoder removes it
      continue;
    }
    const code = enc.encode(packed);
    const decoded = dec.decode(code);
    expect(unpackUint8Array(decoded)).toStrictEqual(a);
  }
});

test('space efficient', () => {
  const a = new Uint8Array(65536);
  crypto.getRandomValues(a);
  const packed = packUint8Array(a);
  // 0xD800-0xDFFF = 2048. 2048/65536 = 0.03125
  // These are doubled in length, so inflating ratio is about 1.0625
  expect((packed.length * 2) / a.length).toBeLessThan(1.07);
});
