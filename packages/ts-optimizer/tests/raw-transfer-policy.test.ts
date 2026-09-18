import { describe, expect, it } from 'vitest';
import {
  RAW_TRANSFER_RESERVATION_BYTES,
  shouldUseRawTransfer,
} from '../src/raw-transfer-policy.js';

const GiB = 1024 ** 3;

describe('shouldUseRawTransfer', () => {
  it('keeps raw transfer when physical memory holds two reservations', () => {
    expect(shouldUseRawTransfer(undefined, 32 * GiB)).toBe(true);
    expect(shouldUseRawTransfer(undefined, 16 * GiB)).toBe(true);
    expect(shouldUseRawTransfer(undefined, 8 * GiB)).toBe(false);
    expect(shouldUseRawTransfer(undefined, RAW_TRANSFER_RESERVATION_BYTES * 2)).toBe(true);
    expect(shouldUseRawTransfer(undefined, RAW_TRANSFER_RESERVATION_BYTES * 2 - 1)).toBe(false);
  });

  it('gives a worker with no memory budget raw transfer only on explicit opt-in', () => {
    expect(shouldUseRawTransfer(undefined, 0)).toBe(false);
    expect(shouldUseRawTransfer('1', 0)).toBe(true);
  });

  it('lets the environment variable override the memory rule either way', () => {
    for (const off of ['0', 'false', 'off', 'no', ' FALSE ']) {
      expect(shouldUseRawTransfer(off, 64 * GiB)).toBe(false);
    }
    for (const on of ['1', 'true', 'on', 'yes']) {
      expect(shouldUseRawTransfer(on, 8 * GiB)).toBe(true);
    }
    expect(shouldUseRawTransfer('', 8 * GiB)).toBe(false);
  });
});
