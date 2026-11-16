import { $, component$, useComputed$, useSignal } from '@qwik.dev/core';
import { openLightbox } from './lightbox';
import { Slide } from './slide';

/**
 * A gallery: a computed derives the slides from a signal, and an inline `$()` that calls a library
 * is passed to each slide as an `on*$` prop. Only a click on a slide runs the library; switching
 * the colour re-renders the gallery.
 */
export default component$(() => {
  const color = useSignal('slate');
  const images = useComputed$(() => [`${color.value}-front`, `${color.value}-back`]);
  const opened = useSignal('');
  const open$ = $((index: number) => {
    opened.value = openLightbox(images.value, index);
  });
  // Read in the render, so only a re-render of the gallery shows the new slides and the result.
  const shown = images.value.join(' ');
  return (
    <section class="fixture" data-fixture="heavy-dep-qrl-prop">
      <h2>heavy dependency of a QRL prop</h2>
      <button data-testid="trigger" onClick$={() => (color.value = 'rust')}>
        Rust
      </button>
      {images.value.map((src, index) => (
        <Slide key={src} src={src} index={index} onOpen$={open$} />
      ))}
      <output data-testid="result" data-done={shown.startsWith('rust') ? '' : undefined}>
        {shown}
      </output>
      <output data-testid="opened">{opened.value}</output>
    </section>
  );
});
