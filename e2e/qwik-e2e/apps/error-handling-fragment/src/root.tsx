import { $, component$, ErrorBoundary, isServer, sync$, type JSXOutput } from '@qwik.dev/core';

// onClick$ here would load a second core copy and re-trip Q30.
const bumpCount = sync$((_: Event, el: Element) => {
  const count = el.parentElement!.querySelector('#eb-fallback-count')!;
  count.textContent = String(Number(count.textContent) + 1);
});

const FragmentFallback = component$((props: { msg: string }) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {props.msg}</p>
    <button id="eb-fallback-button" onClick$={bumpCount}>
      Touch fallback
    </button>
    <span id="eb-fallback-count">0</span>
  </section>
));

const fragmentFallback = $((e: unknown) => (
  <FragmentFallback msg={String((e as { message?: unknown })?.message ?? e)} />
));

const FragmentThrower = component$((): JSXOutput => {
  if (isServer) {
    throw new Error('fragment boom');
  }
  return <span id="eb-fragment-client" />;
});

export default component$(() => (
  <ErrorBoundary fallback$={fragmentFallback}>
    <section id="eb-content">
      <p>fragment content</p>
    </section>
    <FragmentThrower />
  </ErrorBoundary>
));
