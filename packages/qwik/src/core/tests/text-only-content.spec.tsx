import { component$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: text-only elements`, () => {
  it('renders title and textarea content with several parts as one text node', async () => {
    const App = component$(() => {
      const page = useSignal('Home');
      const line = useSignal('a');
      return (
        <section>
          <button onClick$={() => ((page.value = 'About'), (line.value = 'b'))} />
          {/* @ts-expect-error the JSX types allow one string child; the compiler folds several */}
          <title>{page.value} - Site</title>
          {/* @ts-expect-error same */}
          <textarea>
            {line.value}
            {line.value}
          </textarea>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    const title = container.querySelector('title')!;
    const textarea = container.querySelector('textarea')!;

    expect(title.textContent).toBe('Home - Site');
    expect(title.childNodes).toHaveLength(1);
    expect(textarea.textContent).toBe('aa');
    expect(textarea.childNodes).toHaveLength(1);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(title.textContent).toBe('About - Site');
    expect(textarea.textContent).toBe('bb');
    cleanup();
  });
});
