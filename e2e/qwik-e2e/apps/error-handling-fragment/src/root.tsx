import { $, component$, Catch, isServer, sync$, type JSXOutput } from '@qwik.dev/core';

// onClick$ here would load a second core copy and re-trip Q30.
const bumpCount = sync$((_: Event, el: Element) => {
  const count = el.parentElement!.querySelector('#catch-fallback-count')!;
  count.textContent = String(Number(count.textContent) + 1);
});

const FragmentFallback = component$((props: { msg: string }) => (
  <section id="catch-fallback">
    <p id="catch-fallback-msg">caught: {props.msg}</p>
    <button id="catch-fallback-button" onClick$={bumpCount}>
      Touch fallback
    </button>
    <span id="catch-fallback-count">0</span>
  </section>
));

const fragmentFallback = $((e: unknown) => (
  <FragmentFallback msg={String((e as { message?: unknown })?.message ?? e)} />
));

const FragmentThrower = component$((): JSXOutput => {
  if (isServer) {
    throw new Error('fragment boom');
  }
  return <span id="catch-fragment-client" />;
});

export default component$(() => (
  <Catch fallback$={fragmentFallback}>
    <section id="catch-content">
      <p>fragment content</p>
    </section>
    <FragmentThrower />
  </Catch>
));
