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

  it('models firstElementChild on template fragments', () => {
    const document = createDocument();
    const template = document.createElement('template');
    template.innerHTML = 'text<span>element</span>';

    expect(template.content.firstElementChild?.tagName).toBe('SPAN');
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
