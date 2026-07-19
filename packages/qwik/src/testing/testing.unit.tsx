import { component$ } from '@qwik.dev/core';
import { _deserialize, _serialize } from '@qwik.dev/core/internal';
import { describe, expect, it } from 'vitest';
import { createDOM, createDocument, domRender, ssrRenderToDom, testTarget } from './index';

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

  it('validates explicit renderers against the compiled target', async () => {
    const invalidRender = testTarget === 'csr' ? ssrRenderToDom : domRender;
    const harness = await createDOM();

    try {
      await harness.render(App);
      expect(harness.screen.querySelector('button')?.textContent).toBe('works');
      await expect(invalidRender(App)).rejects.toThrow('requires');
    } finally {
      harness.cleanup();
    }
  });
});
