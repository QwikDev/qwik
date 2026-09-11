import { component$, useSignal, type JSXOutput } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: linked dynamic content`, () => {
  it('updates proven text at the component root after resume', async () => {
    const Text = component$((props: { value: number }) => props.value);
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <main>
          <button onClick$={() => count.value++}>next</button>
          <section>
            <Text value={count.value} />
          </section>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const section = container.querySelector('section')!;
      expect(section.textContent).toBe('0');
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(section.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });
  it('replaces mixed prop values between stable siblings and at a component root', async () => {
    const Content = component$((props: { value: JSXOutput }) => props.value);
    const App = component$(() => {
      const step = useSignal(0);
      const values = ['<text>', <b>element</b>, ['array', <i>child</i>], null];
      return (
        <main>
          <button onClick$={() => (step.value = (step.value + 1) % 4)}>next</button>
          <section>
            <span>before</span>
            <Content value={values[step.value]} />
            <span>after</span>
          </section>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const section = container.querySelector('section')!;
      const before = section.firstElementChild;
      const after = section.lastElementChild;
      expect(section.textContent).toBe('before<text>after');
      expect(section.querySelector('text')).toBeFalsy();
      const expectedContents = [
        'beforeelementafter',
        'beforearraychildafter',
        'beforeafter',
        'before<text>after',
      ];
      for (let index = 0; index < expectedContents.length; index++) {
        await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
        expect(section.textContent).toBe(expectedContents[index]);
        expect(section.firstElementChild).toBe(before);
        expect(section.lastElementChild).toBe(after);
      }
    } finally {
      cleanup();
    }
  });
});
