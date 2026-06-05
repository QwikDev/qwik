import {
  component$,
  createAsync$,
  Fragment as Component,
  useSignal,
  type Signal,
} from '@qwik.dev/core';
import { domRender, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false;
Error.stackTraceLimit = 100;

describe('Cursor Behavior', () => {
  it('does not leak DOM from a paused cursor when a parent re-renders above it', async () => {
    const Home = component$(() => {
      return <h1 id="home">Home</h1>;
    });

    const Blocked = component$(() => {
      const slow = createAsync$(() => new Promise<string>(() => {}));
      return (
        <div>
          <h1 id="blocked">Blocked</h1>
          <span>{slow.value}</span>
        </div>
      );
    });

    const Target = component$(() => {
      return <h1 id="target">Target</h1>;
    });

    const Inner = component$<{ view: Signal<'home' | 'blocked'> }>(({ view }) => {
      return view.value === 'home' ? <Home /> : <Blocked />;
    });

    const Outer = component$<{ innerView: Signal<'home' | 'blocked'> }>(({ innerView }) => {
      return <Inner view={innerView} />;
    });

    const App = component$(() => {
      const outerView = useSignal<'outer' | 'target'>('outer');
      const innerView = useSignal<'home' | 'blocked'>('home');
      return (
        <div>
          <button
            id="block-btn"
            onClick$={() => {
              innerView.value = 'blocked';
            }}
          />
          <button
            id="target-btn"
            onClick$={() => {
              outerView.value = 'target';
            }}
          />
          {outerView.value === 'outer' ? <Outer innerView={innerView} /> : <Target />}
        </div>
      );
    });

    const { document, vNode, container } = await domRender(<App />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button id="block-btn"></button>
          <button id="target-btn"></button>
          <Component>
            <Component>
              <Component>
                <h1 id="home">Home</h1>
              </Component>
            </Component>
          </Component>
        </div>
      </Component>
    );
    await expect(document.querySelector('div')).toMatchDOM(
      <div>
        <button id="block-btn"></button>
        <button id="target-btn"></button>
        <h1 id="home">Home</h1>
      </div>
    );

    // The first update pauses below the second update's root, so both triggers
    // skip idle waiting.
    await trigger(document.body, '#block-btn', 'click', {}, { waitForIdle: false });
    await trigger(document.body, '#target-btn', 'click', {}, { waitForIdle: false });

    await waitForDrain(container);

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button id="block-btn"></button>
          <button id="target-btn"></button>
          <Component>
            <h1 id="target">Target</h1>
          </Component>
        </div>
      </Component>
    );
    await expect(document.querySelector('div')).toMatchDOM(
      <div>
        <button id="block-btn"></button>
        <button id="target-btn"></button>
        <h1 id="target">Target</h1>
      </div>
    );
  });
});
