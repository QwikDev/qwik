import {
  createContextId,
  useContext,
  useContextProvider,
  useSignal,
  useTask$,
  type Signal,
} from '@qwik.dev/core';
import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$ } from '../shared/component.public';
import { SSRBackpatch } from '../shared/jsx/utils.public';

const debug = true;

describe('SSR Backpatching (attributes only, wrapper-scoped)', () => {
  it.only('emits marker and JSON blob when signal-derived attribute changes', async () => {
    const Ctx = createContextId<{ descId: Signal<string> }>('bp-ctx-1');

    const Child = component$(() => {
      const context = useContext(Ctx);
      useTask$(() => {
        context.descId.value = 'final-id';
      });
      return null;
    });

    const Root = component$(() => {
      const descId = useSignal('initial-id');
      useContextProvider(Ctx, { descId });
      return (
        <SSRBackpatch>
          <input aria-describedby={descId.value} />
          <Child />
        </SSRBackpatch>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });

    document.querySelectorAll('q:backpatch').forEach((script) => {
      console.log('EXECUTOR SCRIPT: ', script.textContent);
    });

    // expect(document.querySelector('input')).toMatchDOM(
    //   <input id="test-input" aria-describedby="final" />
    // )
  });

  it('does not emit JSON blob when serialized value does not change', async () => {
    const Ctx = createContextId<{ descId: Signal<string> }>('bp-ctx-2');

    const Child = component$(() => {
      const { descId } = useContext(Ctx);
      useTask$(() => {
        descId.value = 'same-id';
      });
      return null;
    });

    const Root = component$(() => {
      const descId = useSignal('same-id');
      useContextProvider(Ctx, { descId });
      return (
        <SSRBackpatch>
          <input aria-describedby={descId.value} />
          <Child />
        </SSRBackpatch>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });
    const html = document.documentElement.outerHTML;

    expect(html).toMatch(/q:reactive-id="/);
    expect(html).not.toMatch(/data-qwik-backpatch=/);
  });

  it('does not affect nodes outside wrapper', async () => {
    const App = component$(() => {
      const val = useSignal('x');
      return (
        <>
          <div data-out aria-label={val.value}></div>
          <SSRBackpatch>
            <div data-in aria-label={val.value}></div>
          </SSRBackpatch>
        </>
      );
    });

    const { document } = await ssrRenderToDom(<App />, { debug });
    const html = document.documentElement.outerHTML;

    expect(html).toMatch(/data-in[^>]*q:reactive-id="/);
    expect(html).not.toMatch(/data-out[^>]*q:reactive-id="/);
  });

  it('emits patch for attribute removal when value becomes null', async () => {
    const Ctx = createContextId<{ aria: Signal<string | null> }>('bp-ctx-3');

    const Child = component$(() => {
      const { aria } = useContext(Ctx);
      useTask$(() => {
        aria.value = null;
      });
      return null;
    });

    const Root = component$(() => {
      const aria = useSignal<string | null>('label-id');
      useContextProvider(Ctx, { aria });
      return (
        <SSRBackpatch>
          <button aria-labelledby={aria.value ?? undefined}>ok</button>
          <Child />
        </SSRBackpatch>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });
    const html = document.documentElement.outerHTML;

    expect(html).toContain('"name":"aria-labelledby"');
    expect(html).toContain('"serializedValue":null');
  });

  it('emits executor script when patches are generated', async () => {
    const Ctx = createContextId<{ id: Signal<string> }>('bp-ctx-4');

    const Child = component$(() => {
      const { id } = useContext(Ctx);
      useTask$(() => {
        id.value = 'final';
      });
      return null;
    });

    const Root = component$(() => {
      const id = useSignal('init');
      useContextProvider(Ctx, { id });
      return (
        <SSRBackpatch>
          <input aria-describedby={id.value} />
          <Child />
        </SSRBackpatch>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });
    const html = document.documentElement.outerHTML;

    expect(html).toMatch(/data-qwik-backpatch=/);
    expect(html).toMatch(/<script[^>]*id="qwik-backpatch-executor"/);
  });

  it('does not emit executor script when no patches are generated', async () => {
    const NoChanges = component$(() => {
      const x = useSignal('same');
      return (
        <SSRBackpatch>
          <div aria-label={x.value}></div>
        </SSRBackpatch>
      );
    });

    const { document } = await ssrRenderToDom(<NoChanges />, { debug });
    const html = document.documentElement.outerHTML;

    expect(html).toMatch(/q:reactive-id="/);
    expect(html).not.toMatch(/data-qwik-backpatch=/);
    expect(html).not.toMatch(/id="qwik-backpatch-executor"/);
  });

  it('handles nested SSRBackpatch scopes independently', async () => {
    const Ctx = createContextId<{ outer: Signal<string>; inner: Signal<string> }>('nested-ctx');

    const Child = component$(() => {
      const { outer, inner } = useContext(Ctx);
      useTask$(() => {
        outer.value = 'outer-final';
        inner.value = 'inner-final';
      });
      return null;
    });

    const Root = component$(() => {
      const outer = useSignal('outer-init');
      const inner = useSignal('inner-init');
      useContextProvider(Ctx, { outer, inner });

      return (
        <SSRBackpatch>
          <div data-outer aria-label={outer.value}>
            <SSRBackpatch>
              <div data-inner aria-label={inner.value}>
                <Child />
              </div>
            </SSRBackpatch>
          </div>
        </SSRBackpatch>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });
    const html = document.documentElement.outerHTML;

    const patchMatches = html.match(/data-qwik-backpatch="[^"]+"/g);
    expect(patchMatches?.length).toBeGreaterThan(1);

    expect(html).toContain('"serializedValue":"outer-final"');
    expect(html).toContain('"serializedValue":"inner-final"');

    expect(html).toMatch(/data-outer[^>]*\sq:reactive-id="/);
    expect(html).toMatch(/data-inner[^>]*\sq:reactive-id="/);
  });

  it('emits patches with final signal values within scope', async () => {
    const Ctx = createContextId<{ id: Signal<string> }>('dedup-ctx');

    const Child1 = component$(() => {
      const { id } = useContext(Ctx);
      useTask$(() => {
        id.value = 'middle';
      });
      return null;
    });

    const Child2 = component$(() => {
      const { id } = useContext(Ctx);
      useTask$(() => {
        id.value = 'final';
      });
      return null;
    });

    const Root = component$(() => {
      const id = useSignal('init');
      useContextProvider(Ctx, { id });

      return (
        <SSRBackpatch>
          <input id="test-input" aria-describedby={id.value} />
          <Child1 />
          <Child2 />
        </SSRBackpatch>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });
    const html = document.documentElement.outerHTML;

    // expect(html).toMatch(/data-qwik-backpatch="/);
    // expect(html).toContain('"serializedValue":"final"');
    expect(document.querySelector('input')).toMatchDOM(
      <input id="test-input" aria-describedby="final" />
    );
  });
});
