import { component$, useStore } from '@qwik.dev/core';
import { _waitOn } from '@qwik.dev/core/internal';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: _waitOn`, () => {
  it('renders children after the promise settles', async () => {
    const Child = component$((props: { state: { ready: boolean } }) => (
      <span>{props.state.ready ? 'ready' : 'waiting'}</span>
    ));
    const Parent = component$(() => {
      const state = useStore({ ready: false });
      _waitOn(
        new Promise((resolve) => setTimeout(resolve, 1)).then(() => {
          state.ready = true;
        })
      );
      return <Child state={state} />;
    });

    const { container, cleanup } = await render(Parent, { debug });

    expect(container.querySelector('span')!.textContent).toBe('ready');
    cleanup();
  });
});
