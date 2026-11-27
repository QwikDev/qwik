import { createComputed$, createSignal } from '@qwik.dev/core';
import { createDocument } from '@qwik.dev/core/testing';
import { _deserialize } from '@qwik.dev/core/internal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _serialize } from './index';
import { TypeIds } from './qwik-copy';

describe('serialized state script', () => {
  it.each(['<!-- <script>', '<!-- <ScRiPt>', `${'a'.repeat(128)}<!-- <script>`])(
    'keeps the script boundary for %s',
    async (value) => {
      const state = await _serialize({ value });
      const document = createDocument({
        html: `<script type="qwik/state">${state}</script><script id="after"></script>`,
      });

      expect(document.querySelector('script[type="qwik/state"]')?.textContent).toBe(state);
      expect(document.querySelector('#after')).not.toBeNull();
      expect(await _deserialize(state)).toEqual({ value });
    }
  );
});

describe('computed chains', () => {
  it.each([
    { length: 3, splits: false },
    { length: 500, splits: true },
  ])(
    'writes separate computed roots for deep chains only ($length links)',
    async ({ length, splits }) => {
      const count = createSignal(1);
      let last = count;
      for (let i = 0; i < length; i++) {
        const previous = last;
        last = createComputed$(() => previous.value + 1);
        expect(last.value).toBe(i + 2);
      }

      const roots = JSON.parse(await _serialize(count)) as unknown[];
      const hasComputedRoot = roots.some(
        (typeId, index) => index % 2 === 0 && typeId === TypeIds.ComputedSignal
      );
      expect(hasComputedRoot).toBe(splits);
    }
  );
});

/** Loads the serializer with `qTest` off, as an app would. */
const loadSerializer = async () => {
  vi.resetModules();
  (globalThis as any).qTest = false;
  try {
    return await import('./index');
  } finally {
    (globalThis as any).qTest = true;
  }
};

describe('serialization errors on the server in dev mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('logs a function it cannot serialize without rethrowing the error later', async () => {
    const serializer = await loadSerializer();

    await expect(serializer._serialize({ describe: () => 'a plain function' })).rejects.toThrow(
      'Cannot serialize function'
    );

    expect(console.error).toHaveBeenCalledOnce();
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
