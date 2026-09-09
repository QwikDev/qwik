import { component$, useSignal, type Signal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

function makeButton(label: string, total: Signal<number>) {
  return <button onClick$={() => total.value++}>{label}</button>;
}

function makeFactory(prefix: string, total: Signal<number>) {
  return (label: string) => makeButton(prefix + label, total);
}

/* eslint-disable prefer-rest-params -- Exercise native arguments across compiler boundaries. */
function makeContextButton(this: { prefix: string; total: Signal<number> }, _label: string) {
  return (() => (
    <button
      onClick$={() => {
        this.total.value += Array.isArray(arguments) ? 100 : [...arguments][0].length;
      }}
    >
      {this.prefix + (arguments.length === 1 ? arguments[0] : 'wrong')}:{this.total.value}
    </button>
  ))();
}
/* eslint-enable prefer-rest-params */

describe(`${name}: JSX helpers`, () => {
  it('preserves helper receivers and arguments through independent resumed captures', async () => {
    const App = component$(() => {
      const total = useSignal(0);
      const content = [
        <h1>context</h1>,
        makeContextButton.call({ prefix: 'first:', total }, 'one'),
        makeContextButton.call({ prefix: 'second:', total }, 'four'),
      ];
      return <main>{content}</main>;
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons.map((button) => button.textContent)).toEqual(['first:one:0', 'second:four:0']);
      await qwikLoader?.dispatch(buttons[0], 'click');
      expect(buttons.map((button) => button.textContent)).toEqual(['first:one:3', 'second:four:3']);
      await qwikLoader?.dispatch(buttons[1], 'click');
      expect(buttons.map((button) => button.textContent)).toEqual(['first:one:7', 'second:four:7']);
    } finally {
      cleanup();
    }
  });

  it('renders helper results with independent captures and resumable events', async () => {
    const App = component$(() => {
      const total = useSignal(0);
      const content = [
        <h1>helpers</h1>,
        makeButton('one', total),
        makeFactory('prefix:', total)('two'),
        local('three'),
      ];
      function local(label: string) {
        return <button onClick$={() => (total.value += 10)}>{label}</button>;
      }
      return (
        <main>
          {content}
          <output>{total.value}</output>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons.map((button) => button.textContent)).toEqual(['one', 'prefix:two', 'three']);
      for (let index = 0; index < buttons.length; index++) {
        await qwikLoader?.dispatch(buttons[index], 'click');
      }
      expect(container.querySelector('output')?.textContent).toBe('12');
      await qwikLoader?.dispatch(buttons[0], 'click');
      expect(container.querySelector('output')?.textContent).toBe('13');
    } finally {
      cleanup();
    }
  });
});
