import { component$, useStore } from '@qwik.dev/core';
import { _waitOn } from '@qwik.dev/core/internal';
import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { delay } from '../shared/utils/promises';

describe('_waitOn', () => {
  it('renders children after the promise settles', async () => {
    const Child = component$((props: { state: { ready: boolean } }) => (
      <span>{props.state.ready ? 'ready' : 'waiting'}</span>
    ));
    const Parent = component$(() => {
      const state = useStore({ ready: false });
      _waitOn(
        delay(1).then(() => {
          state.ready = true;
        })
      );
      return <Child state={state} />;
    });

    const { document } = await ssrRenderToDom(<Parent />);

    expect(document.querySelector('span')?.textContent).toBe('ready');
  });
});
