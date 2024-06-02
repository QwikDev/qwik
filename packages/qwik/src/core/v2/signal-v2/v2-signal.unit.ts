import { describe, it, expect, beforeEach } from 'vitest';
import { createComputed2$, createSignal2 } from './v2-signal.public';

describe('v2-signal', () => {
  const log: any[] = [];
  beforeEach(() => {
    log.length = 0;
  });
  describe('primitive', () => {
    it('basic read operation', () => {
      const signal = createSignal2(123);
      expect(signal.value).toBe(123);
    });

    it('basic subscription operation', async () => {
      const signal = createSignal2(123);
      effect(() => log.push(signal.value));
      expect(log).toBe([123]);
      signal.value++;
      expect(log).toBe([123]);
      await flushSignals();
      expect(log).toBe([123, 124]);
    });
  });
  describe('computed', () => {
    it('basic subscription operation', async () => {
      const a = createSignal2(2);
      const b = createSignal2(10);
      await retry(() => {
        const signal = createComputed2$(() => a.value + b.value);
        effect(() => log.push(signal.value));
        expect(log).toBe([12]);
        a.value++;
        b.value++;
        expect(log).toBe([12]);
      });
      await flushSignals();
      expect(log).toBe([12, 23]);
    });
  });
});

function effect(fn: () => void) {
  fn();
}

function flushSignals() {
  return Promise.resolve();
}

function retry(fn: () => void) {
  fn();
}
