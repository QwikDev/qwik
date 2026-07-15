import { component$ } from '@qwik.dev/core';
import { _deserialize, _serialize } from '@qwik.dev/core/internal';
import { describe, expect, it } from 'vitest';
import { createDOM, createDocument } from './index';

const App = component$(() => <button>works</button>);

describe('public subpaths', () => {
  it('renders a compiled root through the testing harness', async () => {
    const harness = await createDOM();

    try {
      await harness.render(App);
      expect(harness.screen.innerHTML).toBe('<button>works</button>');
    } finally {
      harness.cleanup();
    }
  });

  it('keeps neutral internal serdes available', async () => {
    const value = { count: 1 };
    expect(await _deserialize(await _serialize(value))).toEqual(value);
    expect(createDocument().nodeType).toBe(9);
  });
});
