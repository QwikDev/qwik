import { component$, createAsync$, useSignal, type Signal } from '@qwik.dev/core';
import { domRender, getTestPlatform, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false;
Error.stackTraceLimit = 100;

describe('cursor pause / journal abandonment', () => {
  it('does not leak DOM from a paused cursor when a parent re-renders above it', async () => {
    // Topology:
    //
    //   App        (subscribes to outerView)
    //   ├── Outer  (passes innerView to Inner)
    //   │   └── Inner   (subscribes to innerView)
    //   │       └── Home | Blocked
    //   └── Target (rendered instead of Outer once outerView flips)
    //
    // 1. Clicking #block sets innerView='blocked'. Inner re-renders,
    //    expectComponent swaps Home->Blocked. expectNoMore queues a DEL of the
    //    home <h1> in the current cursor's journal. The cursor descends into
    //    Blocked, whose render reads `slow.value` from a createAsync$ whose
    //    promise never resolves. The cursor walker pauses with the pending DEL
    //    still in its journal.
    //
    // 2. Clicking #target sets outerView='target'. App re-renders.
    //    `findAndPropagateToBlockingCursor` walks UP from App and finds no
    //    cursor above it (the paused one is rooted below, in Inner's subtree),
    //    so it creates a NEW cursor. That cursor swaps Outer->Target and
    //    flushes its own journal — but the original cursor's pending DEL home
    //    is never flushed.
    //
    // Bug: #home is still present in the DOM after Target mounts.

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

    const { document } = await domRender(<App />, { debug });

    // Sanity: Home is rendered, Target/Blocked are not.
    expect(document.querySelector('#home')).toBeTruthy();
    expect(document.querySelector('#blocked')).toBeFalsy();
    expect(document.querySelector('#target')).toBeFalsy();

    // Trigger 1: Inner -> Blocked. Cursor will pause inside Blocked's render
    // because createAsync$ never resolves; the cursor's journal will hold a
    // pending DEL of the home <h1>. Use waitForIdle:false because the global
    // drain would hang forever — the bug is exactly that the cursor never
    // finishes draining.
    await trigger(document.body, '#block-btn', 'click', {}, { waitForIdle: false });

    // Trigger 2: App -> Target via outerView. This creates a NEW parallel
    // cursor (rooted at App) because the paused cursor lives below App. Also
    // skip waitForIdle since the paused cursor keeps the global drain stuck.
    await trigger(document.body, '#target-btn', 'click', {}, { waitForIdle: false });

    // Yield a few macrotasks so the new (parallel) cursor for the Target swap
    // can walk to completion and flush its own journal.
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    await getTestPlatform().flush();

    // Target mounted.
    expect(document.querySelector('#target')?.textContent).toBe('Target');

    // Bug assertion: with the bug, #home remains in the DOM because its DEL
    // was queued in the paused cursor's journal, which never flushes.
    expect(document.querySelector('#home')).toBeFalsy();
    expect(document.querySelector('#blocked')).toBeFalsy();
  });
});
